/**
 * JotForm Weight Ticket Service — Track 3.1
 * ==========================================
 *
 * Handles JotForm weight ticket sync: field extraction from submissions,
 * 3-tier matching cascade to loads, and photo URL extraction/filtering.
 *
 * JotForm API:
 *   - Base: https://hairpintrucking.jotform.com/API
 *   - Auth: ?apiKey=... query parameter
 *   - Submissions: GET /form/{formId}/submissions?apiKey={key}&offset={n}&limit=100
 *   - Response: { responseCode: 200, content: [...submissions] }
 *
 * Matching tiers:
 *   1. ticket_no/bol_no exact match against loads.ticketNo or loads.bolNo
 *   2. load_no match against loads.loadNo
 *   3. driver_name + delivery_date + weight (5% tolerance) fuzzy match
 */

import { eq, or, and, between, ilike } from "drizzle-orm";
import { loads, jotformImports } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "https://hairpintrucking.jotform.com/API";
const DEFAULT_FORM_ID = "240655800307047";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;

/**
 * Allowed domains for photo URLs. Rejects anything not from these origins
 * to prevent injection of arbitrary URLs into the photo pipeline.
 */
const ALLOWED_PHOTO_DOMAINS = [
  "hairpintrucking.jotform.com",
  "www.jotform.com",
  "files.propx.com",
  "storage.googleapis.com",
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JotFormConfig {
  apiKey: string;
  formId?: string;
  baseUrl?: string;
}

export interface JotFormSubmission {
  id: string;
  created_at: string;
  answers: Record<
    string,
    {
      type: string;
      name?: string;
      text?: string;
      answer: unknown;
    }
  >;
}

export interface ExtractedFields {
  driverName: string | null;
  truckNo: string | null;
  bolNo: string | null;
  weight: number | null;
  loadNo: string | null;
  photoUrl: string | null;
  imageUrls: string[];
  submittedAt: Date | null;
}

export interface MatchResult {
  matched: boolean;
  loadId: number | null;
  matchMethod: "ticket_no" | "load_no" | "driver_date_weight" | null;
  confidence: number; // 0-100
}

export interface SyncResult {
  fetched: number;
  stored: number;
  matched: number;
  skippedDuplicate: number;
  errors: Array<{ submissionId: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Diagnostics state (module-level counters — zero-cost until queried)
// ---------------------------------------------------------------------------

let _lastSyncAt: Date | null = null;
let _lastSyncResult: SyncResult | null = null;
let _totalSyncs = 0;
let _totalErrors = 0;

// ---------------------------------------------------------------------------
// URL Filtering
// ---------------------------------------------------------------------------

/**
 * Validates a photo URL: must be HTTP(S) and from an allowed domain.
 */
export function isAllowedPhotoUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return false;
    return ALLOWED_PHOTO_DOMAINS.some(
      (domain) =>
        parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Field Extraction (pure function — no side effects, no DB)
// ---------------------------------------------------------------------------

/**
 * Extracts structured fields from a JotForm weight ticket submission.
 *
 * Loops through submission.answers and uses answer.type + label heuristics
 * to identify driver name, truck/BOL numbers, weight, and photo uploads.
 */
export function extractWeightTicketFields(
  submission: JotFormSubmission,
): ExtractedFields {
  const answers = submission.answers ?? {};

  let driverName: string | null = null;
  let truckNo: string | null = null;
  let bolNo: string | null = null;
  let loadNo: string | null = null;
  let weight: number | null = null;
  const imageUrls: string[] = [];
  let submittedAt: Date | null = null;

  // Parse submitted_at from the submission envelope
  if (submission.created_at) {
    const parsed = new Date(submission.created_at);
    if (!isNaN(parsed.getTime())) {
      submittedAt = parsed;
    }
  }

  for (const answer of Object.values(answers)) {
    const name = (answer.name ?? "").toLowerCase();
    const text = (answer.text ?? "").toLowerCase();

    switch (answer.type) {
      case "control_fullname": {
        const parts = (answer.answer ?? {}) as Record<string, string>;
        const full = [parts.first, parts.last].filter(Boolean).join(" ");
        if (full) driverName = full;
        break;
      }

      case "control_textbox": {
        const val = typeof answer.answer === "string" ? answer.answer : "";

        // Truck number
        if (text.includes("truck") || name.includes("truck")) {
          truckNo = val;
        }
        // BOL / ticket number
        else if (
          text.includes("bol") ||
          text.includes("bill") ||
          text.includes("ticket") ||
          name.includes("bol") ||
          name.includes("ticket")
        ) {
          bolNo = val;
        }
        // Load number
        else if (
          text.includes("load number") ||
          text.includes("load no") ||
          name.includes("load")
        ) {
          loadNo = val;
        }
        // Weight
        else if (
          text.includes("weight") ||
          text.includes("lbs") ||
          text.includes("tons") ||
          name.includes("weight")
        ) {
          const parsed = parseFloat(String(val).replace(/[,\s]/g, ""));
          if (!isNaN(parsed) && parsed >= 0) weight = parsed;
        }
        break;
      }

      case "control_number":
      case "control_spinner": {
        // Number fields — check labels for weight or load context
        if (text.includes("weight") || name.includes("weight")) {
          const parsed = parseFloat(String(answer.answer ?? ""));
          if (!isNaN(parsed) && parsed >= 0) weight = parsed;
        } else if (text.includes("load") || name.includes("load")) {
          const val = String(answer.answer ?? "").trim();
          if (val) loadNo = val;
        }
        break;
      }

      case "control_fileupload": {
        const raw = answer.answer;
        if (Array.isArray(raw)) {
          for (const url of raw) {
            if (isAllowedPhotoUrl(url)) imageUrls.push(url);
          }
        } else if (isAllowedPhotoUrl(raw)) {
          imageUrls.push(raw);
        }
        break;
      }

      case "control_datetime": {
        // Submitted date override from form field (prefer over created_at)
        const val = String(answer.answer ?? "");
        if (val) {
          const parsed = new Date(val);
          if (!isNaN(parsed.getTime())) submittedAt = parsed;
        }
        break;
      }

      // Unknown control types are silently skipped
    }
  }

  return {
    driverName,
    truckNo,
    bolNo,
    weight,
    loadNo,
    photoUrl: imageUrls[0] ?? null,
    imageUrls,
    submittedAt,
  };
}

// ---------------------------------------------------------------------------
// JotForm API Client (with retry + backoff)
// ---------------------------------------------------------------------------

async function fetchWithRetry(url: string, label: string): Promise<unknown> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status} from JotForm (${label})`);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      return await res.json();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < MAX_RETRIES) {
        const delay =
          BASE_RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError ?? new Error(`fetchWithRetry failed for ${label}`);
}

async function fetchSubmissions(
  config: JotFormConfig,
  offset: number,
  limit: number,
): Promise<JotFormSubmission[]> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const formId = config.formId ?? DEFAULT_FORM_ID;
  const url =
    `${baseUrl}/form/${formId}/submissions` +
    `?apiKey=${encodeURIComponent(config.apiKey)}` +
    `&offset=${offset}` +
    `&limit=${limit}` +
    `&orderby=created_at` +
    `&direction=DESC`;

  const data = (await fetchWithRetry(url, `submissions offset=${offset}`)) as {
    responseCode: number;
    content: JotFormSubmission[];
  };

  if (data.responseCode !== 200) {
    throw new Error(`JotForm API error: responseCode=${data.responseCode}`);
  }

  return data.content ?? [];
}

// ---------------------------------------------------------------------------
// 3-Tier Matching
// ---------------------------------------------------------------------------

/**
 * Attempts to match extracted JotForm fields to a load in the database.
 *
 * Tier 1: ticket_no/bol_no exact match against loads.ticketNo or loads.bolNo
 * Tier 2: load_no match against loads.loadNo
 * Tier 3: driver_name + delivery_date (+/-1 day) + weight (5% tolerance)
 *
 * Returns { matched, loadId, matchMethod, confidence }.
 */
export async function matchSubmissionToLoad(
  db: Database,
  fields: ExtractedFields,
): Promise<MatchResult> {
  const noMatch: MatchResult = {
    matched: false,
    loadId: null,
    matchMethod: null,
    confidence: 0,
  };

  // --- Tier 1: ticket_no / bol_no exact match ---
  if (fields.bolNo) {
    const [hit] = await db
      .select({ id: loads.id })
      .from(loads)
      .where(
        or(eq(loads.ticketNo, fields.bolNo), eq(loads.bolNo, fields.bolNo)),
      )
      .limit(1);

    if (hit) {
      return {
        matched: true,
        loadId: hit.id,
        matchMethod: "ticket_no",
        confidence: 95,
      };
    }
  }

  // --- Tier 2: load_no match ---
  const loadNoCandidate = fields.loadNo ?? fields.bolNo;
  if (loadNoCandidate) {
    const [hit] = await db
      .select({ id: loads.id })
      .from(loads)
      .where(eq(loads.loadNo, loadNoCandidate))
      .limit(1);

    if (hit) {
      return {
        matched: true,
        loadId: hit.id,
        matchMethod: "load_no",
        confidence: 85,
      };
    }
  }

  // --- Tier 3: driver + date + weight ---
  if (fields.driverName && fields.submittedAt) {
    const dayBefore = new Date(fields.submittedAt);
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setHours(0, 0, 0, 0);

    const dayAfter = new Date(fields.submittedAt);
    dayAfter.setDate(dayAfter.getDate() + 1);
    dayAfter.setHours(23, 59, 59, 999);

    const candidates = await db
      .select({
        id: loads.id,
        weightTons: loads.weightTons,
        netWeightTons: loads.netWeightTons,
      })
      .from(loads)
      .where(
        and(
          ilike(loads.driverName, `%${fields.driverName}%`),
          between(loads.deliveredOn, dayBefore, dayAfter),
        ),
      );

    if (candidates.length === 1) {
      return {
        matched: true,
        loadId: candidates[0].id,
        matchMethod: "driver_date_weight",
        confidence: 70,
      };
    }

    // Multiple candidates — try weight-based disambiguation (5% tolerance)
    if (candidates.length > 1 && fields.weight != null) {
      const weightMatch = candidates.find((c) => {
        const loadWeight = parseFloat(c.weightTons ?? c.netWeightTons ?? "");
        if (isNaN(loadWeight)) return false;
        return Math.abs(loadWeight - fields.weight!) <= fields.weight! * 0.05;
      });

      if (weightMatch) {
        return {
          matched: true,
          loadId: weightMatch.id,
          matchMethod: "driver_date_weight",
          confidence: 65,
        };
      }
    }
    // Multiple candidates with no weight disambiguation — leave unmatched (ambiguous)
  }

  return noMatch;
}

// ---------------------------------------------------------------------------
// Sync Pipeline
// ---------------------------------------------------------------------------

/**
 * Fetches recent weight ticket submissions from JotForm, extracts fields,
 * stores in jotform_imports, and runs the 3-tier matching cascade.
 */
export async function syncWeightTickets(
  db: Database,
  config: JotFormConfig,
  options: { limit?: number; offset?: number } = {},
): Promise<SyncResult> {
  const { limit = 100, offset = 0 } = options;

  const result: SyncResult = {
    fetched: 0,
    stored: 0,
    matched: 0,
    skippedDuplicate: 0,
    errors: [],
  };

  // Fetch from JotForm API
  const submissions = await fetchSubmissions(config, offset, limit);
  result.fetched = submissions.length;

  for (const submission of submissions) {
    try {
      const fields = extractWeightTicketFields(submission);

      // Skip submissions with no identifying data
      if (!fields.bolNo && !fields.driverName && !fields.loadNo) {
        result.errors.push({
          submissionId: String(submission.id),
          error: "No BOL, driver name, or load number found",
        });
        continue;
      }

      // Check for duplicate (already imported)
      const [existing] = await db
        .select({ id: jotformImports.id })
        .from(jotformImports)
        .where(eq(jotformImports.jotformSubmissionId, String(submission.id)))
        .limit(1);

      if (existing) {
        result.skippedDuplicate++;
        continue;
      }

      // Attempt match before insert
      const match = await matchSubmissionToLoad(db, fields);

      // Insert into jotform_imports
      await db.insert(jotformImports).values({
        jotformSubmissionId: String(submission.id),
        driverName: fields.driverName,
        truckNo: fields.truckNo,
        bolNo: fields.bolNo,
        weight: fields.weight != null ? String(fields.weight) : null,
        photoUrl: fields.photoUrl,
        imageUrls: fields.imageUrls,
        submittedAt: fields.submittedAt,
        matchedLoadId: match.loadId,
        matchMethod: match.matchMethod,
        matchedAt: match.matched ? new Date() : null,
        status: match.matched ? "matched" : "pending",
      });

      result.stored++;
      if (match.matched) result.matched++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Duplicate key constraint — already stored by a concurrent sync
      if (message.includes("unique") || message.includes("duplicate")) {
        result.skippedDuplicate++;
        continue;
      }
      result.errors.push({
        submissionId: String(submission.id),
        error: message,
      });
    }
  }

  // Update diagnostics state
  _lastSyncAt = new Date();
  _lastSyncResult = result;
  _totalSyncs++;
  _totalErrors += result.errors.length;

  return result;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export function diagnostics(): {
  name: string;
  status: "healthy" | "degraded" | "error";
  stats: Record<string, unknown>;
  checks: Array<{ name: string; ok: boolean; detail?: string | number }>;
} {
  const hasApiKey = !!process.env.JOTFORM_API_KEY;

  return {
    name: "jotform",
    status: hasApiKey ? "healthy" : "degraded",
    stats: {
      totalSyncs: _totalSyncs,
      totalErrors: _totalErrors,
      lastSyncAt: _lastSyncAt?.toISOString() ?? null,
      lastSyncResult: _lastSyncResult
        ? {
            fetched: _lastSyncResult.fetched,
            stored: _lastSyncResult.stored,
            matched: _lastSyncResult.matched,
            errors: _lastSyncResult.errors.length,
          }
        : null,
      formId: DEFAULT_FORM_ID,
      allowedPhotoDomains: [...ALLOWED_PHOTO_DOMAINS],
    },
    checks: [
      {
        name: "api-key",
        ok: hasApiKey,
        detail: hasApiKey ? "configured" : "missing",
      },
      {
        name: "last-sync",
        ok: _lastSyncResult ? _lastSyncResult.errors.length === 0 : true,
        detail: _lastSyncAt?.toISOString() ?? "never",
      },
    ],
  };
}
