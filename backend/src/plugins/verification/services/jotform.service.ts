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

import { eq, or, and, between, ilike, sql } from "drizzle-orm";
import {
  loads,
  jotformImports,
  assignments,
  bolSubmissions,
} from "../../../db/schema.js";
import { validateTicketNumber } from "../lib/field-validators.js";
import type { Database } from "../../../db/client.js";
import {
  extractFromPhotos,
  validateExtraction,
  type ExtractedBolData,
} from "./bol-extraction.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape LIKE wildcards to prevent injection via user-supplied strings. */
function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

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
  /** Number of submissions where Vision extraction was attempted. */
  visionAttempted: number;
  /** Extractions that passed post-extraction validation. */
  visionSucceeded: number;
  /** Matches where Vision-extracted fields drove the match (not driver-typed). */
  visionDrovenMatches: number;
}

// ---------------------------------------------------------------------------
// Diagnostics state (module-level counters — zero-cost until queried)
// ---------------------------------------------------------------------------

let _lastSyncAt: Date | null = null;
let _lastSyncResult: SyncResult | null = null;
let _totalSyncs = 0;
let _totalErrors = 0;

// Vision-extraction counters. Populated by the live JotForm path below.
// Tracked separately from _totalErrors because Vision failures are
// non-fatal — the sync falls back to driver-typed fields and still stores
// the submission.
let _visionAttempts = 0;
let _visionSuccesses = 0;
let _visionFailures = 0;
let _visionFieldsUsed = 0; // count of matches that used Vision fields (vs typed)

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
  // Gate on deterministic validator (2026-04-14, ported from bol-ocr-pipeline).
  // Trusting a malformed BOL — a date, an address fragment, fewer than 3
  // digits — would cause a false-positive match and cascade into bad
  // discrepancy flags. Skip Tier 1 when the value doesn't look like a real
  // ticket number; fall through to Tier 2 (load_no) and Tier 3 (fuzzy).
  const bolValidation = fields.bolNo
    ? validateTicketNumber(fields.bolNo)
    : null;
  if (fields.bolNo && bolValidation?.valid) {
    // Case-insensitive match — Vision often extracts uppercase ('C10698116')
    // while DB stores lowercase ('c10698116') depending on ingest source.
    // sql`LOWER(...)` lets postgres use the lower-cased index path; without
    // this, ~half of the alpha-prefixed PropX tickets (Hairpin C-prefix
    // format) fail to match despite existing as identical strings modulo
    // case. Verified empirically 2026-04-24: 5 of 8 sampled unmatched
    // bol_submissions had this exact symptom.
    const lowered = fields.bolNo.toLowerCase();
    const [hit] = await db
      .select({ id: loads.id })
      .from(loads)
      .where(
        or(
          sql`LOWER(${loads.ticketNo}) = ${lowered}`,
          sql`LOWER(${loads.bolNo}) = ${lowered}`,
        ),
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

  // --- Tier 2: load_no match (also case-insensitive) ---
  const loadNoCandidate = fields.loadNo ?? fields.bolNo;
  if (loadNoCandidate) {
    const lowered = loadNoCandidate.toLowerCase();
    const [hit] = await db
      .select({ id: loads.id })
      .from(loads)
      .where(sql`LOWER(${loads.loadNo}) = ${lowered}`)
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
          ilike(loads.driverName, `%${escapeLikePattern(fields.driverName)}%`),
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

    // Feedback loop (2026-04-14): tie-break using prior manual matches.
    // If this driver has been manually assigned to a specific well before,
    // prefer candidates going to that well. Every manual match in the BOL
    // Queue compounds — corrections tonight improve auto-match tomorrow.
    if (candidates.length > 1) {
      const historyMatch = await matchFromFeedbackHistory(
        db,
        fields.driverName,
        candidates.map((c) => c.id),
      );
      if (historyMatch) {
        return {
          matched: true,
          loadId: historyMatch,
          matchMethod: "driver_date_weight",
          confidence: 72,
        };
      }
    }
    // Multiple candidates with no weight or history disambiguation — ambiguous.
  }

  return noMatch;
}

/**
 * Feedback loop tie-breaker. Looks up wells whose match_feedback history
 * contains a manual_assign for this driver name, then picks whichever
 * candidate load is assigned to that well.
 *
 * Returns the winning loadId, or null when no confirmed history applies.
 */
async function matchFromFeedbackHistory(
  db: Database,
  driverName: string,
  candidateLoadIds: number[],
): Promise<number | null> {
  if (candidateLoadIds.length === 0) return null;
  const { wells, assignments: a } = await import("../../../db/schema.js");
  const { inArray } = await import("drizzle-orm");

  // Fetch the wells each candidate load is currently assigned to
  const candidateAssignments = await db
    .select({ loadId: a.loadId, wellId: a.wellId })
    .from(a)
    .where(inArray(a.loadId, candidateLoadIds));
  if (candidateAssignments.length === 0) return null;

  const candidateWellIds = [
    ...new Set(candidateAssignments.map((c) => c.wellId)),
  ];

  // Pull match_feedback for those wells and score by how many manual
  // assignments match this driver name (case-insensitive exact after trim)
  const wellRows = await db
    .select({ id: wells.id, matchFeedback: wells.matchFeedback })
    .from(wells)
    .where(inArray(wells.id, candidateWellIds));

  const target = driverName.trim().toLowerCase();
  const scoreByWellId = new Map<number, number>();
  for (const w of wellRows) {
    const fb = Array.isArray(w.matchFeedback) ? w.matchFeedback : [];
    const score = fb.filter(
      (f) =>
        f.action === "manual_assign" &&
        typeof f.sourceName === "string" &&
        f.sourceName.trim().toLowerCase() === target,
    ).length;
    if (score > 0) scoreByWellId.set(w.id, score);
  }
  if (scoreByWellId.size === 0) return null;

  // Pick the well with the highest score; tie → the smaller well id (stable)
  const bestWellId = [...scoreByWellId.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0] - b[0];
  })[0][0];

  const winner = candidateAssignments.find((c) => c.wellId === bestWellId);
  return winner?.loadId ?? null;
}

// ---------------------------------------------------------------------------
// Vision extraction integration (live pivot, 2026-04-20)
// ---------------------------------------------------------------------------

/**
 * Result of the Vision extraction attempt for a single JotForm submission.
 * `visionFields` is null when Vision wasn't attempted, failed, or produced
 * output that didn't pass validation — callers fall back to driver-typed
 * fields in that case.
 */
interface VisionEnhancement {
  bolSubmissionId: number | null;
  visionFields: Partial<ExtractedFields> | null;
  /** True if an Anthropic call was made (success OR failure). Drives the
   *  visionAttempted counter separately from success. */
  visionAttempted: boolean;
  visionSucceeded: boolean;
}

/**
 * Runs Claude Vision on a submission's photos, persists the extraction to
 * `bol_submissions` (for workbench OCR surfacing + training-data durability),
 * and returns fields ready to merge into the matcher's input.
 *
 * Never throws: any failure resolves to `{ bolSubmissionId, visionFields: null,
 * visionSucceeded: false }` so the sync falls back to driver-typed fields.
 *
 * Tier 0 gate: the Vision-extracted ticket number must pass
 * `validateTicketNumber` before we trust it. Same gate the JotForm path uses
 * against driver-typed input. Prevents OCR junk (dates, addresses, stray
 * digits) from driving false-positive matches.
 */
async function enhanceWithVision(
  db: Database,
  fields: ExtractedFields,
): Promise<VisionEnhancement> {
  const empty: VisionEnhancement = {
    bolSubmissionId: null,
    visionFields: null,
    visionAttempted: false,
    visionSucceeded: false,
  };

  if (!process.env.ANTHROPIC_API_KEY) return empty;
  if (fields.imageUrls.length === 0) return empty;

  _visionAttempts++;

  // Insert bol_submissions row first so the Vision output has a durable home
  // even if the extract call itself fails mid-flight. `photos` carries the
  // JotForm CDN URLs; cloudinaryId/filename are empty (not a Cloudinary pipeline).
  let bolSubmissionId: number | null = null;
  try {
    const [inserted] = await db
      .insert(bolSubmissions)
      .values({
        driverName: fields.driverName,
        photos: fields.imageUrls.map((url) => ({
          url,
          cloudinaryId: "",
          filename: "",
        })),
        status: "pending",
      })
      .returning({ id: bolSubmissions.id });
    bolSubmissionId = inserted?.id ?? null;
  } catch (err) {
    console.warn(
      `[JotForm+Vision] Failed to create bol_submissions row: ${
        err instanceof Error ? err.message : err
      }`,
    );
    // Fall through — Vision can still run and merge fields without persistence.
  }

  let extraction: ExtractedBolData;
  try {
    extraction = await extractFromPhotos(fields.imageUrls);
  } catch (err) {
    _visionFailures++;
    console.warn(
      `[JotForm+Vision] Extraction failed: ${
        err instanceof Error ? err.message : err
      }`,
    );
    if (bolSubmissionId != null) {
      await db
        .update(bolSubmissions)
        .set({
          status: "failed",
          lastError: err instanceof Error ? err.message : String(err),
        })
        .where(eq(bolSubmissions.id, bolSubmissionId))
        .catch(() => undefined);
    }
    // Attempt counts even though the extract threw — Anthropic was called.
    return { ...empty, bolSubmissionId, visionAttempted: true };
  }

  const validation = validateExtraction(extraction);

  if (bolSubmissionId != null) {
    await db
      .update(bolSubmissions)
      .set({
        aiExtractedData: extraction as unknown as Record<string, unknown>,
        aiConfidence: extraction.overallConfidence,
        aiMetadata: {
          extractedAt: new Date().toISOString(),
          photoCount: fields.imageUrls.length,
          fieldConfidences: extraction.fieldConfidences,
          validationErrors: validation.errors.length,
          validationWarnings: validation.warnings.length,
        },
        status: validation.isValid ? "extracted" : "failed",
        lastError: validation.isValid
          ? null
          : validation.errors.map((e) => e.message).join("; "),
      })
      .where(eq(bolSubmissions.id, bolSubmissionId))
      .catch((err) => {
        console.warn(
          `[JotForm+Vision] Failed to persist extraction: ${
            err instanceof Error ? err.message : err
          }`,
        );
      });
  }

  if (!validation.isValid) {
    // Critical errors from validator (no identifier, no weight) — Vision
    // output isn't usable for matching. Fall back to driver-typed. Still
    // counts as an attempt since Anthropic was called.
    return {
      bolSubmissionId,
      visionFields: null,
      visionAttempted: true,
      visionSucceeded: false,
    };
  }

  _visionSuccesses++;

  // Tier 0 gate on the Vision-extracted ticket number. Matches JotForm path.
  const ticketValid = extraction.ticketNo
    ? validateTicketNumber(extraction.ticketNo).valid
    : false;

  // Build merge candidates. Every field prefers Vision when present + the
  // Tier 0 gate passed for the ticket. Weight and driver info come through
  // unconditionally when Vision produced them — they aren't under Tier 0's
  // jurisdiction.
  const visionFields: Partial<ExtractedFields> = {
    bolNo: ticketValid ? extraction.ticketNo : fields.bolNo,
    loadNo: extraction.loadNumber ?? fields.loadNo,
    weight: extraction.weight ?? fields.weight,
    driverName: extraction.driverName ?? fields.driverName,
    truckNo: extraction.truckNo ?? fields.truckNo,
  };

  return {
    bolSubmissionId,
    visionFields,
    visionAttempted: true,
    visionSucceeded: true,
  };
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
    visionAttempted: 0,
    visionSucceeded: 0,
    visionDrovenMatches: 0,
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

      // Claude Vision extraction on the photo. Source of truth for fields
      // when it succeeds — driver-typed values are the fallback, not the
      // lead. Persists a `bol_submissions` row as a durable training-data
      // artifact regardless of match outcome.
      const vision = await enhanceWithVision(db, fields);
      // Count every Anthropic call (success OR failure) toward attempts so
      // the metadata accurately reflects API hit rate. Success bucket stays
      // tied to extraction + validation passing, drivenMatches to the match
      // actually landing on Vision-extracted fields.
      if (vision.visionAttempted) result.visionAttempted++;
      if (vision.visionSucceeded) result.visionSucceeded++;

      const matchFields: ExtractedFields = vision.visionFields
        ? { ...fields, ...vision.visionFields }
        : fields;

      // Attempt match using the merged field set (Vision where available,
      // driver-typed where not).
      const match = await matchSubmissionToLoad(db, matchFields);

      if (match.matched && vision.visionFields) {
        result.visionDrovenMatches++;
        _visionFieldsUsed++;
      }

      // Insert into jotform_imports. `bolNo`, `weight`, `driverName`,
      // `truckNo` reflect what drove the match — Vision-extracted when
      // Vision was authoritative, driver-typed otherwise. Preserving both
      // is valuable: `original_ocr_bol_no` will capture any later operator
      // correction for retraining.
      await db.insert(jotformImports).values({
        jotformSubmissionId: String(submission.id),
        driverName: matchFields.driverName,
        truckNo: matchFields.truckNo,
        bolNo: matchFields.bolNo,
        weight: matchFields.weight != null ? String(matchFields.weight) : null,
        photoUrl: fields.photoUrl,
        imageUrls: fields.imageUrls,
        submittedAt: fields.submittedAt,
        matchedLoadId: match.loadId,
        matchMethod: match.matchMethod,
        matchedAt: match.matched ? new Date() : null,
        status: match.matched ? "matched" : "pending",
      });

      // Link Vision extraction row to the matched load so the workbench's
      // OCR-derived columns (ocrBolNo, ocrWeightLbs, etc.) surface the
      // extraction data immediately. Also flips bol_submissions.status
      // from 'extracted' to 'matched' for accurate pipeline diagnostics.
      if (vision.bolSubmissionId != null && match.matched && match.loadId) {
        await db
          .update(bolSubmissions)
          .set({
            matchedLoadId: match.loadId,
            matchMethod: match.matchMethod ?? null,
            matchScore: match.confidence,
            status: "matched",
          })
          .where(eq(bolSubmissions.id, vision.bolSubmissionId))
          .catch(() => undefined);
      }

      // 2026-04-14: Bridge JotForm match → assignment.photo_status. Without
      // this, a matched submission would still leave the assignment showing
      // "missing photo" and block the dispatch_ready transition (P-03).
      if (
        match.matched &&
        match.loadId &&
        (fields.photoUrl || (fields.imageUrls?.length ?? 0) > 0)
      ) {
        await db
          .update(assignments)
          .set({ photoStatus: "attached", updatedAt: new Date() })
          .where(eq(assignments.loadId, match.loadId));
      }

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
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const visionEnabled = hasAnthropicKey;
  const visionSuccessRate =
    _visionAttempts > 0
      ? Math.round((_visionSuccesses / _visionAttempts) * 1000) / 10
      : null;

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
            visionAttempted: _lastSyncResult.visionAttempted,
            visionSucceeded: _lastSyncResult.visionSucceeded,
            visionDrovenMatches: _lastSyncResult.visionDrovenMatches,
          }
        : null,
      formId: DEFAULT_FORM_ID,
      allowedPhotoDomains: [...ALLOWED_PHOTO_DOMAINS],
      vision: {
        enabled: visionEnabled,
        totalAttempts: _visionAttempts,
        totalSuccesses: _visionSuccesses,
        totalFailures: _visionFailures,
        totalFieldsUsed: _visionFieldsUsed,
        successRatePct: visionSuccessRate,
      },
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
      {
        name: "vision-extraction",
        ok: visionEnabled,
        detail: visionEnabled
          ? `ANTHROPIC_API_KEY configured (success=${visionSuccessRate ?? "n/a"}%)`
          : "ANTHROPIC_API_KEY missing — falling back to driver-typed fields",
      },
    ],
  };
}
