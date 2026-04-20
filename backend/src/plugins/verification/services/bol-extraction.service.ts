/**
 * BOL Extraction Service -- Track 6.1
 * =====================================
 *
 * AI-powered extraction of structured data from Bill of Lading / weight ticket
 * photos using Claude vision API. Rate-limited via PQueue to stay within
 * Anthropic API limits.
 *
 * Extraction flow:
 *   1. Receive photo URL(s) for a BOL submission
 *   2. Build Claude vision prompt with all images in a single call
 *   3. Parse structured JSON response into ExtractedBolData
 *   4. Run post-extraction validation (critical errors + warnings)
 *   5. Persist results on the bol_submissions row
 *
 * Rate limiting:
 *   - PQueue concurrency=2, interval=5000ms, intervalCap=2
 *   - Prevents burst-overloading the Anthropic API
 *
 * Retry:
 *   - MAX_RETRY_COUNT=3 per submission (prevents infinite Claude calls on
 *     corrupt/unreadable images -- pass 2 fix #31)
 */

import Anthropic from "@anthropic-ai/sdk";
import PQueue from "p-queue";
import { eq } from "drizzle-orm";
import { bolSubmissions } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum extraction retries per submission (pass 2 fix #31). */
export const MAX_RETRY_COUNT = 3;

/** The 15 fields extracted from BOL/weight ticket photos. */
export const BOL_EXTRACTION_FIELDS = [
  "ticketNo",
  "loadNumber",
  "weight",
  "grossWeight",
  "tareWeight",
  "pickupDate",
  "deliveryDate",
  "shipper",
  "consignee",
  "product",
  "truckNo",
  "trailerNo",
  "carrier",
  "driverName",
  "notes",
] as const;

// Phase 6 (matching-v2, 2026-04-19): upgrade to Opus for higher precision on
// BOL field extraction. Opus handles multi-page BOLs + handwritten annotations
// + ambiguous layouts better than Sonnet. Override via BOL_EXTRACTION_MODEL
// env var if we need to A/B test or roll back.
const DEFAULT_MODEL = process.env.BOL_EXTRACTION_MODEL ?? "claude-opus-4-7";
const MAX_TOKENS = 2_000;

// ---------------------------------------------------------------------------
// Rate-limited queue (module-level singleton)
// ---------------------------------------------------------------------------

const queue = new PQueue({
  concurrency: parseInt(process.env.BOL_CONCURRENCY ?? "2", 10),
  interval: parseInt(process.env.BOL_INTERVAL_MS ?? "5000", 10),
  intervalCap: parseInt(process.env.BOL_INTERVAL_CAP ?? "2", 10),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedBolData {
  ticketNo: string | null;
  loadNumber: string | null;
  weight: number | null; // lbs
  grossWeight: number | null;
  tareWeight: number | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  shipper: string | null;
  consignee: string | null;
  product: string | null;
  truckNo: string | null;
  trailerNo: string | null;
  carrier: string | null;
  driverName: string | null;
  notes: string | null;
  fieldConfidences: Record<string, number>; // per-field 0-100
  overallConfidence: number; // 0-100
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: "critical" | "warning";
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationIssue[]; // critical -- blocks matching
  warnings: ValidationIssue[]; // informational -- flags for review
}

// ---------------------------------------------------------------------------
// Diagnostics state (module-level, zero-cost until queried)
// ---------------------------------------------------------------------------

let _totalExtractions = 0;
let _totalFailures = 0;
let _lastExtractionAt: Date | null = null;
let _lastModel: string | null = null;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  "You are an expert at extracting structured data from trucking documents " +
  "including Bills of Lading, scale tickets, and delivery receipts. " +
  "Always return data in valid JSON format.";

function buildExtractionPrompt(): string {
  return `You are analyzing weight ticket / bill of lading photos from oilfield trucking operations.

Extract the following fields from the document(s):
- ticket_no: The ticket or receipt number
- load_number: The load number or haul number
- weight: Net weight in pounds (lbs) -- look for "Net Weight", "Net Wt", or calculated from gross - tare
- gross_weight: Gross weight in pounds before tare deduction
- tare_weight: Tare weight (truck empty weight)
- pickup_date: Date of pickup/loading (format: YYYY-MM-DD)
- delivery_date: Date of delivery (format: YYYY-MM-DD)
- shipper: Origin location, quarry, or shipper name
- consignee: Destination, delivery location, or receiver name
- product: Material type (sand, gravel, rock, aggregate, etc.)
- truck_no: Truck number or unit number
- trailer_no: Trailer number if visible
- carrier: Carrier or trucking company name
- driver_name: Driver name if visible
- notes: Any additional relevant notes or comments

Return a JSON object with these fields. For each field, also provide a confidence score (0-100).
If a field is not visible or unclear, set it to null with confidence 0.

Return ONLY valid JSON, no explanation. Use this exact shape:
{
  "extracted_data": {
    "ticket_no": "12345",
    "load_number": "L-2025-001",
    "weight": 45000,
    "gross_weight": 80000,
    "tare_weight": 35000,
    "pickup_date": "2025-02-04",
    "delivery_date": "2025-02-04",
    "shipper": "ABC Quarry",
    "consignee": "XYZ Construction Site",
    "product": "Crushed Stone #57",
    "truck_no": "T-101",
    "trailer_no": null,
    "carrier": "Fast Haul Trucking",
    "driver_name": "John Smith",
    "notes": null
  },
  "field_confidence": {
    "ticket_no": 95,
    "load_number": 88,
    "weight": 92,
    "gross_weight": 90,
    "tare_weight": 90,
    "pickup_date": 85,
    "delivery_date": 85,
    "shipper": 80,
    "consignee": 75,
    "product": 90,
    "truck_no": 95,
    "trailer_no": 0,
    "carrier": 70,
    "driver_name": 60,
    "notes": 0
  },
  "overall_confidence": 82
}`;
}

// ---------------------------------------------------------------------------
// Image content builder
// ---------------------------------------------------------------------------

type ImageBlock = {
  type: "image";
  source:
    | { type: "base64"; media_type: string; data: string }
    | { type: "url"; url: string };
};

function buildImageContent(url: string): ImageBlock {
  if (url.startsWith("data:")) {
    const commaIdx = url.indexOf(",");
    const header = url.slice(0, commaIdx);
    const data = url.slice(commaIdx + 1);
    const mediaType = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
    return {
      type: "image",
      source: { type: "base64", media_type: mediaType, data },
    };
  }
  return {
    type: "image",
    source: { type: "url", url },
  };
}

// ---------------------------------------------------------------------------
// JSON response parsing
// ---------------------------------------------------------------------------

function parseApiResponse(raw: string): {
  extractedData: Record<string, unknown>;
  fieldConfidence: Record<string, number>;
  overallConfidence: number;
} {
  // Strip markdown code fences if present
  let json = raw;
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) json = fenceMatch[1];

  const parsed = JSON.parse(json);

  return {
    extractedData: parsed.extracted_data ?? {},
    fieldConfidence: parsed.field_confidence ?? {},
    overallConfidence:
      typeof parsed.overall_confidence === "number"
        ? parsed.overall_confidence
        : 0,
  };
}

/**
 * Maps the snake_case API response into camelCase ExtractedBolData.
 */
function toExtractedBolData(
  data: Record<string, unknown>,
  fieldConf: Record<string, number>,
  overallConf: number,
): ExtractedBolData {
  const str = (key: string): string | null => {
    const v = data[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  };

  const num = (key: string): number | null => {
    const v = data[key];
    if (typeof v === "number" && !isNaN(v)) return v;
    if (typeof v === "string") {
      const parsed = parseFloat(v.replace(/[,\s]/g, ""));
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  };

  // Build camelCase field confidences from snake_case API response
  const fieldConfidences: Record<string, number> = {};
  const snakeToCamel: Record<string, string> = {
    ticket_no: "ticketNo",
    load_number: "loadNumber",
    weight: "weight",
    gross_weight: "grossWeight",
    tare_weight: "tareWeight",
    pickup_date: "pickupDate",
    delivery_date: "deliveryDate",
    shipper: "shipper",
    consignee: "consignee",
    product: "product",
    truck_no: "truckNo",
    trailer_no: "trailerNo",
    carrier: "carrier",
    driver_name: "driverName",
    notes: "notes",
  };

  for (const [snake, camel] of Object.entries(snakeToCamel)) {
    fieldConfidences[camel] =
      typeof fieldConf[snake] === "number" ? fieldConf[snake] : 0;
  }

  return {
    ticketNo: str("ticket_no"),
    loadNumber: str("load_number"),
    weight: num("weight"),
    grossWeight: num("gross_weight"),
    tareWeight: num("tare_weight"),
    pickupDate: str("pickup_date"),
    deliveryDate: str("delivery_date"),
    shipper: str("shipper"),
    consignee: str("consignee"),
    product: str("product"),
    truckNo: str("truck_no"),
    trailerNo: str("trailer_no"),
    carrier: str("carrier"),
    driverName: str("driver_name"),
    notes: str("notes"),
    fieldConfidences,
    overallConfidence: overallConf,
  };
}

// ---------------------------------------------------------------------------
// Extraction (Claude Vision API)
// ---------------------------------------------------------------------------

/**
 * Extract structured BOL data from one or more photo URLs.
 *
 * All images are sent in a single Claude API call so the model can
 * reason across pages (e.g. front + back of a weight ticket).
 *
 * Rate-limited via PQueue (concurrency=2, 2 requests/5s).
 */
export async function extractFromPhotos(
  photoUrls: string[],
  config?: { model?: string },
): Promise<ExtractedBolData> {
  if (!photoUrls || photoUrls.length === 0) {
    throw new Error("No photo URLs provided");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not configured -- cannot perform BOL extraction",
    );
  }

  const model =
    config?.model ?? process.env.BOL_EXTRACTION_MODEL ?? DEFAULT_MODEL;

  return queue.add(async () => {
    const clientOpts: ConstructorParameters<typeof Anthropic>[0] = {
      apiKey,
    };

    // Optional Helicone proxy for cost tracking
    const heliconeKey = process.env.HELICONE_API_KEY;
    if (heliconeKey) {
      clientOpts.baseURL = "https://anthropic.helicone.ai";
      clientOpts.defaultHeaders = {
        "Helicone-Auth": `Bearer ${heliconeKey}`,
      };
    }

    const anthropic = new Anthropic(clientOpts);

    const userContent: Array<{ type: "text"; text: string } | ImageBlock> = [
      { type: "text", text: buildExtractionPrompt() },
      ...photoUrls.map(buildImageContent),
    ];

    const response = await anthropic.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "user", content: userContent as any }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : null;
    if (!text) {
      throw new Error("No text content in Claude API response");
    }

    const { extractedData, fieldConfidence, overallConfidence } =
      parseApiResponse(text);

    _totalExtractions++;
    _lastExtractionAt = new Date();
    _lastModel = model;

    return toExtractedBolData(
      extractedData,
      fieldConfidence,
      overallConfidence,
    );
  }) as Promise<ExtractedBolData>;
}

// ---------------------------------------------------------------------------
// Post-extraction validation (pure function -- pass 2 fix #26)
// ---------------------------------------------------------------------------

/**
 * Validates extracted BOL data against domain rules for oilfield trucking.
 *
 * Critical errors block load matching (can't proceed without identification
 * or weight). Warnings flag outlier values for human review.
 */
export function validateExtraction(data: ExtractedBolData): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // --- Critical: must have at least one identifier ---
  if (!data.ticketNo && !data.loadNumber) {
    errors.push({
      field: "identification",
      message:
        "Neither ticket number nor load number could be extracted -- cannot match to a load",
      severity: "critical",
    });
  }

  // --- Critical: must have some weight ---
  if (data.weight == null && data.grossWeight == null) {
    errors.push({
      field: "weight",
      message:
        "No weight or gross weight extracted -- cannot reconcile without weight data",
      severity: "critical",
    });
  }

  // --- Warning: weight outliers ---
  const effectiveWeight = data.weight ?? data.grossWeight;
  if (effectiveWeight != null) {
    if (effectiveWeight > 120_000) {
      warnings.push({
        field: "weight",
        message: `Weight ${effectiveWeight} lbs exceeds 120,000 lbs -- outlier for oilfield trucking`,
        severity: "warning",
      });
    }
    if (effectiveWeight < 100) {
      warnings.push({
        field: "weight",
        message: `Weight ${effectiveWeight} lbs is suspiciously low (< 100 lbs)`,
        severity: "warning",
      });
    }
  }

  // --- Warning: ticket number format ---
  if (data.ticketNo != null && !/^\d{4,10}$/.test(data.ticketNo)) {
    warnings.push({
      field: "ticketNo",
      message: `Ticket number "${data.ticketNo}" does not match expected numeric pattern (4-10 digits)`,
      severity: "warning",
    });
  }

  // --- Warning: date sanity ---
  const now = new Date();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  for (const [fieldName, dateStr] of [
    ["pickupDate", data.pickupDate],
    ["deliveryDate", data.deliveryDate],
  ] as const) {
    if (dateStr != null) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        if (parsed < ninetyDaysAgo) {
          warnings.push({
            field: fieldName,
            message: `Date ${dateStr} is more than 90 days in the past`,
            severity: "warning",
          });
        }
        if (parsed > now) {
          warnings.push({
            field: fieldName,
            message: `Date ${dateStr} is in the future`,
            severity: "warning",
          });
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Submission processing pipeline
// ---------------------------------------------------------------------------

/**
 * Full extraction pipeline for a single BOL submission:
 *   1. Load submission from DB (check retry count)
 *   2. Extract data from photos via Claude
 *   3. Validate extraction results
 *   4. Persist extraction + validation on the submission row
 *
 * Respects MAX_RETRY_COUNT to prevent infinite API calls on corrupt images.
 */
export async function processSubmission(
  db: Database,
  submissionId: number,
): Promise<{ extraction: ExtractedBolData; validation: ValidationResult }> {
  // Load submission
  const [submission] = await db
    .select()
    .from(bolSubmissions)
    .where(eq(bolSubmissions.id, submissionId))
    .limit(1);

  if (!submission) {
    throw new Error(`BOL submission ${submissionId} not found`);
  }

  // Check retry count (pass 2 fix #31)
  const currentRetries = submission.retryCount ?? 0;
  if (currentRetries >= MAX_RETRY_COUNT) {
    throw new Error(
      `BOL submission ${submissionId} has exceeded max retry count (${MAX_RETRY_COUNT})`,
    );
  }

  // Extract photo URLs from the submission
  const photos = (submission.photos ?? []) as Array<{
    url: string;
    cloudinaryId?: string;
    filename?: string;
  }>;
  const photoUrls = photos.map((p) => p.url).filter(Boolean);

  if (photoUrls.length === 0) {
    throw new Error(`BOL submission ${submissionId} has no photo URLs`);
  }

  // Mark as extracting + increment retry count
  await db
    .update(bolSubmissions)
    .set({
      status: "extracting",
      retryCount: currentRetries + 1,
    })
    .where(eq(bolSubmissions.id, submissionId));

  try {
    const extraction = await extractFromPhotos(photoUrls);
    const validation = validateExtraction(extraction);

    // Persist results
    await db
      .update(bolSubmissions)
      .set({
        aiExtractedData: extraction as unknown as Record<string, unknown>,
        aiConfidence: extraction.overallConfidence,
        aiMetadata: {
          extractedAt: new Date().toISOString(),
          photoCount: photoUrls.length,
          fieldConfidences: extraction.fieldConfidences,
          validationErrors: validation.errors.length,
          validationWarnings: validation.warnings.length,
        },
        status: validation.isValid ? "extracted" : "failed",
        lastError: validation.isValid
          ? null
          : validation.errors.map((e) => e.message).join("; "),
      })
      .where(eq(bolSubmissions.id, submissionId));

    return { extraction, validation };
  } catch (err) {
    _totalFailures++;

    const message = err instanceof Error ? err.message : String(err);

    // Mark as failed
    await db
      .update(bolSubmissions)
      .set({
        status: "failed",
        lastError: message,
      })
      .where(eq(bolSubmissions.id, submissionId));

    throw err;
  }
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
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  const model = process.env.BOL_EXTRACTION_MODEL ?? DEFAULT_MODEL;

  return {
    name: "bol-extraction",
    status: hasApiKey ? "healthy" : "degraded",
    stats: {
      totalExtractions: _totalExtractions,
      totalFailures: _totalFailures,
      lastExtractionAt: _lastExtractionAt?.toISOString() ?? null,
      lastModel: _lastModel,
      configuredModel: model,
      maxRetryCount: MAX_RETRY_COUNT,
      fieldCount: BOL_EXTRACTION_FIELDS.length,
      queueSize: queue.size,
      queuePending: queue.pending,
    },
    checks: [
      {
        name: "anthropic-api-key",
        ok: hasApiKey,
        detail: hasApiKey ? "configured" : "missing",
      },
      {
        name: "model",
        ok: true,
        detail: model,
      },
      {
        name: "queue-health",
        ok: queue.size < 50,
        detail: `size=${queue.size} pending=${queue.pending}`,
      },
    ],
  };
}
