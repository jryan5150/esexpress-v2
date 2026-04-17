/**
 * Reconciliation Service -- Track 6.2
 * =====================================
 *
 * 3-source reconciliation: matches BOL submissions (extracted from photos)
 * against loads and JotForm data, then detects field-level discrepancies.
 *
 * Matching cascade (stops on first hit):
 *   1. ticket_no exact — bolSubmission.ticketNo matches loads.ticketNo or loads.bolNo
 *   2. load_no exact — bolSubmission.loadNumber matches loads.loadNo
 *   3. driver+date+weight fuzzy — case-insensitive driver substring,
 *      delivery_date within 1-day window, weight within 5% tolerance
 *
 * Discrepancy severity:
 *   - Weight >10% diff → critical | 5–10% → warning
 *   - Ticket number mismatch → warning
 *   - Delivery date mismatch (>1 day) → warning
 *   - Driver name mismatch → info
 */

import { eq, or, and, between, ilike, isNull, count } from "drizzle-orm";
import { loads, bolSubmissions, assignments } from "../../../db/schema.js";
import type { PhotoStatus } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";
import type { ExtractedBolData } from "./bol-extraction.service.js";

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

export const RECONCILIATION_STATUSES = [
  "pending_bol", // load exists, no BOL yet
  "pending_confirmation", // BOL extracted, driver hasn't confirmed
  "critical_discrepancy", // matched but critical discrepancy
  "needs_review", // matched but warnings present
  "reconciled", // matched, no discrepancies or resolved
  "ready_for_review", // ready for dispatcher review
] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Discrepancy {
  field: string;
  bolValue: unknown;
  loadValue: unknown;
  severity: "critical" | "warning" | "info";
  message: string;
}

export interface MatchResult {
  matched: boolean;
  loadId: number | null;
  matchStrategy: "ticket_no" | "load_no" | "driver_date_weight" | null;
  confidence: number;
  discrepancies: Discrepancy[];
  reconciliationStatus: ReconciliationStatus;
}

export interface BatchMatchResult {
  total: number;
  matched: number;
  unmatched: number;
  results: Array<{ submissionId: number } & MatchResult>;
}

/** Shape of an extracted BOL data row from the bolSubmissions table. */
interface BolExtractedRow {
  ticketNo?: string | null;
  loadNumber?: string | null;
  weight?: number | null;
  deliveryDate?: string | null;
  driverName?: string | null;
}

/** Shape of a load row used by discrepancy detection. */
export interface LoadRow {
  ticketNo: string | null;
  bolNo: string | null;
  loadNo: string;
  driverName: string | null;
  weightTons: string | null; // numeric columns come as strings from Drizzle
  netWeightTons: string | null;
  deliveredOn: Date | null;
}

export interface QueueFilters {
  status?: ReconciliationStatus;
  limit?: number;
  offset?: number;
}

export interface QueueItem {
  submissionId: number;
  loadNumber: string | null;
  driverName: string | null;
  status: string | null;
  matchedLoadId: number | null;
  matchMethod: string | null;
  matchScore: number | null;
  discrepancies: unknown[];
  aiConfidence: number | null;
  createdAt: Date | null;
}

export interface ReconciliationStats {
  totalSubmissions: number;
  matched: number;
  unmatched: number;
  criticalDiscrepancies: number;
  needsReview: number;
  reconciled: number;
}

// ---------------------------------------------------------------------------
// Diagnostics state (module-level, zero-cost until queried)
// ---------------------------------------------------------------------------

let _totalMatches = 0;
let _totalMisses = 0;
let _lastMatchAt: Date | null = null;
let _totalDiscrepancies = 0;

// ---------------------------------------------------------------------------
// Pure functions — discrepancy detection & classification
// ---------------------------------------------------------------------------

/**
 * Detect discrepancies between BOL-extracted data and the matched load record.
 *
 * Compares weight, ticket number, delivery date, and driver name.
 * Returns an empty array when all fields agree (or are missing on both sides).
 */
export function detectDiscrepancies(
  bolData: ExtractedBolData,
  loadData: LoadRow,
): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];

  // --- Weight comparison ---
  // BOL weight is in lbs; load weight_tons is in tons. Convert to common unit (lbs).
  const bolWeight = bolData.weight ?? bolData.grossWeight;
  const loadWeightLbs = loadData.weightTons
    ? parseFloat(loadData.weightTons) * 2000
    : loadData.netWeightTons
      ? parseFloat(loadData.netWeightTons) * 2000
      : null;

  if (bolWeight != null && loadWeightLbs != null && loadWeightLbs > 0) {
    const diffPercent =
      (Math.abs(bolWeight - loadWeightLbs) / loadWeightLbs) * 100;

    if (diffPercent > 10) {
      discrepancies.push({
        field: "weight",
        bolValue: bolWeight,
        loadValue: loadWeightLbs,
        severity: "critical",
        message: `Weight difference ${diffPercent.toFixed(1)}% exceeds 10% threshold (BOL: ${bolWeight} lbs, Load: ${loadWeightLbs.toFixed(0)} lbs)`,
      });
    } else if (diffPercent > 5) {
      discrepancies.push({
        field: "weight",
        bolValue: bolWeight,
        loadValue: loadWeightLbs,
        severity: "warning",
        message: `Weight difference ${diffPercent.toFixed(1)}% exceeds 5% threshold (BOL: ${bolWeight} lbs, Load: ${loadWeightLbs.toFixed(0)} lbs)`,
      });
    }
  }

  // --- Ticket number comparison ---
  const bolTicket = bolData.ticketNo;
  const loadTicket = loadData.ticketNo ?? loadData.bolNo;

  if (bolTicket && loadTicket && bolTicket !== loadTicket) {
    discrepancies.push({
      field: "ticket_no",
      bolValue: bolTicket,
      loadValue: loadTicket,
      severity: "warning",
      message: `Ticket number mismatch: BOL "${bolTicket}" vs Load "${loadTicket}"`,
    });
  }

  // --- Delivery date comparison ---
  const bolDateStr = bolData.deliveryDate;
  const loadDate = loadData.deliveredOn;

  if (bolDateStr && loadDate) {
    const bolDate = new Date(bolDateStr);
    const diffMs = Math.abs(bolDate.getTime() - loadDate.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays > 1) {
      discrepancies.push({
        field: "delivery_date",
        bolValue: bolDateStr,
        loadValue: loadDate.toISOString().split("T")[0],
        severity: "warning",
        message: `Delivery date mismatch: BOL "${bolDateStr}" vs Load "${loadDate.toISOString().split("T")[0]}" (${diffDays.toFixed(1)} days apart)`,
      });
    }
  }

  // --- Driver name comparison ---
  const bolDriver = bolData.driverName?.toLowerCase().trim();
  const loadDriver = loadData.driverName?.toLowerCase().trim();

  if (bolDriver && loadDriver) {
    // Case-insensitive substring match — if neither contains the other, flag it
    const namesMatch =
      bolDriver.includes(loadDriver) || loadDriver.includes(bolDriver);

    if (!namesMatch) {
      discrepancies.push({
        field: "driver_name",
        bolValue: bolData.driverName,
        loadValue: loadData.driverName,
        severity: "info",
        message: `Driver name mismatch: BOL "${bolData.driverName}" vs Load "${loadData.driverName}"`,
      });
    }
  }

  return discrepancies;
}

/**
 * Classify the reconciliation status based on detected discrepancies.
 *
 * - No discrepancies → reconciled
 * - Any critical → critical_discrepancy
 * - Warnings (no critical) → needs_review
 */
export function classifyReconciliationStatus(
  discrepancies: Discrepancy[],
): ReconciliationStatus {
  if (discrepancies.length === 0) {
    return "reconciled";
  }

  const hasCritical = discrepancies.some((d) => d.severity === "critical");
  if (hasCritical) {
    return "critical_discrepancy";
  }

  // Has warnings or info-level discrepancies
  const hasWarning = discrepancies.some((d) => d.severity === "warning");
  if (hasWarning) {
    return "needs_review";
  }

  // Info-only discrepancies are not actionable — treat as reconciled
  return "reconciled";
}

// ---------------------------------------------------------------------------
// Auto-matching (DB-dependent)
// ---------------------------------------------------------------------------

/**
 * Auto-match a single BOL submission against loads using the 3-strategy cascade.
 *
 * Updates the bol_submissions row with match results and discrepancies.
 */
export async function autoMatch(
  db: Database,
  bolSubmissionId: number,
): Promise<MatchResult> {
  // Load the submission
  const [submission] = await db
    .select()
    .from(bolSubmissions)
    .where(eq(bolSubmissions.id, bolSubmissionId))
    .limit(1);

  if (!submission) {
    throw new Error(`BOL submission ${bolSubmissionId} not found`);
  }

  // Already matched?
  if (submission.matchedLoadId) {
    return {
      matched: true,
      loadId: submission.matchedLoadId,
      matchStrategy:
        (submission.matchMethod as MatchResult["matchStrategy"]) ?? null,
      confidence: submission.matchScore ?? 0,
      discrepancies: (submission.discrepancies ?? []) as Discrepancy[],
      reconciliationStatus: classifyReconciliationStatus(
        (submission.discrepancies ?? []) as Discrepancy[],
      ),
    };
  }

  const extracted = (submission.aiExtractedData ?? {}) as BolExtractedRow;

  // --- Strategy 1: ticket_no exact match ---
  if (extracted.ticketNo) {
    const [hit] = await db
      .select()
      .from(loads)
      .where(
        or(
          eq(loads.ticketNo, extracted.ticketNo),
          eq(loads.bolNo, extracted.ticketNo),
        ),
      )
      .limit(1);

    if (hit) {
      return finalizeMatch(db, submission.id, hit, "ticket_no", 95, extracted);
    }
  }

  // --- Strategy 2: load_no exact match ---
  const loadNumber = extracted.loadNumber ?? submission.loadNumber;
  if (loadNumber) {
    const [hit] = await db
      .select()
      .from(loads)
      .where(eq(loads.loadNo, loadNumber))
      .limit(1);

    if (hit) {
      return finalizeMatch(db, submission.id, hit, "load_no", 85, extracted);
    }
  }

  // --- Strategy 3: driver + date + weight fuzzy ---
  const driverName = extracted.driverName ?? submission.driverName;
  const deliveryDateStr = extracted.deliveryDate;

  if (driverName && deliveryDateStr) {
    const deliveryDate = new Date(deliveryDateStr);
    const dayBefore = new Date(deliveryDate);
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setHours(0, 0, 0, 0);

    const dayAfter = new Date(deliveryDate);
    dayAfter.setDate(dayAfter.getDate() + 1);
    dayAfter.setHours(23, 59, 59, 999);

    const candidates = await db
      .select()
      .from(loads)
      .where(
        and(
          ilike(loads.driverName, `%${escapeLikePattern(driverName)}%`),
          between(loads.deliveredOn, dayBefore, dayAfter),
        ),
      );

    // Narrow by weight if available
    const bolWeight = extracted.weight;
    if (candidates.length > 0 && bolWeight != null) {
      const tolerance = bolWeight * 0.05;
      const weightMatch = candidates.find((c) => {
        const loadWeightLbs = c.weightTons
          ? parseFloat(c.weightTons) * 2000
          : c.netWeightTons
            ? parseFloat(c.netWeightTons) * 2000
            : null;
        if (loadWeightLbs == null) return false;
        return Math.abs(bolWeight - loadWeightLbs) <= tolerance;
      });

      if (weightMatch) {
        return finalizeMatch(
          db,
          submission.id,
          weightMatch,
          "driver_date_weight",
          70,
          extracted,
        );
      }
    } else if (candidates.length === 1) {
      // Single match on driver + date (no weight to compare)
      return finalizeMatch(
        db,
        submission.id,
        candidates[0],
        "driver_date_weight",
        60,
        extracted,
      );
    }
  }

  // No match found
  _totalMisses++;

  return {
    matched: false,
    loadId: null,
    matchStrategy: null,
    confidence: 0,
    discrepancies: [],
    reconciliationStatus: "pending_bol",
  };
}

/**
 * Finalize a successful match: detect discrepancies, update DB, return result.
 */
async function finalizeMatch(
  db: Database,
  submissionId: number,
  loadRow: typeof loads.$inferSelect,
  strategy: MatchResult["matchStrategy"] & string,
  confidence: number,
  extracted: BolExtractedRow,
): Promise<MatchResult> {
  // Build ExtractedBolData-compatible shape for detectDiscrepancies
  const bolData: ExtractedBolData = {
    ticketNo: extracted.ticketNo ?? null,
    loadNumber: extracted.loadNumber ?? null,
    weight: extracted.weight ?? null,
    grossWeight: null,
    tareWeight: null,
    pickupDate: null,
    deliveryDate: extracted.deliveryDate ?? null,
    shipper: null,
    consignee: null,
    product: null,
    truckNo: null,
    trailerNo: null,
    carrier: null,
    driverName: extracted.driverName ?? null,
    notes: null,
    fieldConfidences: {},
    overallConfidence: 0,
  };

  const loadRowData: LoadRow = {
    ticketNo: loadRow.ticketNo,
    bolNo: loadRow.bolNo,
    loadNo: loadRow.loadNo,
    driverName: loadRow.driverName,
    weightTons: loadRow.weightTons,
    netWeightTons: loadRow.netWeightTons,
    deliveredOn: loadRow.deliveredOn,
  };

  const discrepancies = detectDiscrepancies(bolData, loadRowData);
  const reconciliationStatus = classifyReconciliationStatus(discrepancies);

  // Persist match results
  await db
    .update(bolSubmissions)
    .set({
      matchedLoadId: loadRow.id,
      matchMethod: strategy,
      matchScore: confidence,
      discrepancies: discrepancies as Array<{
        field: string;
        expected: unknown;
        actual: unknown;
        severity: string;
      }>,
      status:
        reconciliationStatus === "critical_discrepancy"
          ? "discrepancy"
          : "matched",
    })
    .where(eq(bolSubmissions.id, submissionId));

  _totalMatches++;
  _lastMatchAt = new Date();
  _totalDiscrepancies += discrepancies.length;

  await refreshAssignmentUncertainReasons(db, loadRow.id, extracted);

  return {
    matched: true,
    loadId: loadRow.id,
    matchStrategy: strategy,
    confidence,
    discrepancies,
    reconciliationStatus,
  };
}

/**
 * V5 Workbench: after a BOL-to-load match is persisted, recompute
 * assignments.uncertain_reasons for any assignment that references the load.
 * Keeps Jessica's Uncertain filter in sync with reconciliation outcomes —
 * e.g. a BOL-vs-load mismatch surfaces as 'bol_mismatch', weight deltas as
 * 'weight_mismatch'. Auto-advance is deliberately not done here; the stage
 * state machine owns transitions. A later sweep can promote clean rows.
 *
 * Must not throw: reconciliation must complete even if the dispatch-side
 * refresh fails. Errors are logged and swallowed.
 */
async function refreshAssignmentUncertainReasons(
  db: Database,
  loadId: number,
  extracted: BolExtractedRow,
): Promise<void> {
  try {
    const { computeUncertainReasons } = await import(
      "../../dispatch/services/workbench.service.js"
    );

    const rows = await db
      .select({
        id: assignments.id,
        wellId: assignments.wellId,
        photoStatus: assignments.photoStatus,
        autoMapTier: assignments.autoMapTier,
        loadBolNo: loads.bolNo,
        loadWeightLbs: loads.weightLbs,
        loadWeightTons: loads.weightTons,
        loadRate: loads.rate,
        loadDeliveredOn: loads.deliveredOn,
      })
      .from(assignments)
      .leftJoin(loads, eq(loads.id, assignments.loadId))
      .where(eq(assignments.loadId, loadId));

    for (const r of rows) {
      // Prefer the weight_lbs column (Round 4 M2); fallback to tons*2000.
      const loadWeightLbs = r.loadWeightLbs
        ? parseFloat(r.loadWeightLbs as unknown as string)
        : r.loadWeightTons
          ? parseFloat(r.loadWeightTons as unknown as string) * 2000
          : null;

      const reasons = computeUncertainReasons({
        wellId: r.wellId ?? null,
        photoStatus: r.photoStatus as PhotoStatus | null,
        autoMapTier: r.autoMapTier,
        bolNo: r.loadBolNo,
        ocrBolNo: extracted.ticketNo ?? null,
        loadWeightLbs,
        ocrWeightLbs: extracted.weight ?? null,
        rate: r.loadRate as string | null,
        deliveredOn: r.loadDeliveredOn,
      });

      await db
        .update(assignments)
        .set({ uncertainReasons: reasons })
        .where(eq(assignments.id, r.id));
    }
  } catch (err) {
    console.warn(
      "[reconciliation] refreshAssignmentUncertainReasons failed",
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// Batch auto-match
// ---------------------------------------------------------------------------

/**
 * Run autoMatch on multiple submissions. Processes sequentially to avoid
 * overwhelming the database with concurrent queries.
 */
export async function batchAutoMatch(
  db: Database,
  submissionIds: number[],
): Promise<BatchMatchResult> {
  const results: BatchMatchResult["results"] = [];
  let matched = 0;
  let unmatched = 0;

  for (const id of submissionIds) {
    try {
      const result = await autoMatch(db, id);
      results.push({ submissionId: id, ...result });
      if (result.matched) matched++;
      else unmatched++;
    } catch {
      // Skip submissions that error (e.g. not found)
      results.push({
        submissionId: id,
        matched: false,
        loadId: null,
        matchStrategy: null,
        confidence: 0,
        discrepancies: [],
        reconciliationStatus: "pending_bol",
      });
      unmatched++;
    }
  }

  return {
    total: submissionIds.length,
    matched,
    unmatched,
    results,
  };
}

// ---------------------------------------------------------------------------
// Manual matching
// ---------------------------------------------------------------------------

/**
 * Manually match a BOL submission to a load. Used when auto-match fails
 * or a dispatcher overrides the auto-match result.
 */
export async function manualMatch(
  db: Database,
  submissionId: number,
  loadId: number,
  userId: number,
): Promise<void> {
  // Verify submission exists
  const [submission] = await db
    .select()
    .from(bolSubmissions)
    .where(eq(bolSubmissions.id, submissionId))
    .limit(1);

  if (!submission) {
    throw new Error(`BOL submission ${submissionId} not found`);
  }

  // Verify load exists
  const [load] = await db
    .select()
    .from(loads)
    .where(eq(loads.id, loadId))
    .limit(1);

  if (!load) {
    throw new Error(`Load ${loadId} not found`);
  }

  // Detect discrepancies using extracted data
  const extracted = (submission.aiExtractedData ?? {}) as BolExtractedRow;
  const bolData: ExtractedBolData = {
    ticketNo: extracted.ticketNo ?? null,
    loadNumber: extracted.loadNumber ?? null,
    weight: extracted.weight ?? null,
    grossWeight: null,
    tareWeight: null,
    pickupDate: null,
    deliveryDate: extracted.deliveryDate ?? null,
    shipper: null,
    consignee: null,
    product: null,
    truckNo: null,
    trailerNo: null,
    carrier: null,
    driverName: extracted.driverName ?? null,
    notes: null,
    fieldConfidences: {},
    overallConfidence: 0,
  };

  const loadRowData: LoadRow = {
    ticketNo: load.ticketNo,
    bolNo: load.bolNo,
    loadNo: load.loadNo,
    driverName: load.driverName,
    weightTons: load.weightTons,
    netWeightTons: load.netWeightTons,
    deliveredOn: load.deliveredOn,
  };

  const discrepancies = detectDiscrepancies(bolData, loadRowData);

  await db
    .update(bolSubmissions)
    .set({
      matchedLoadId: loadId,
      matchMethod: "manual",
      matchScore: 100,
      discrepancies: discrepancies as Array<{
        field: string;
        expected: unknown;
        actual: unknown;
        severity: string;
      }>,
      status: discrepancies.some((d) => d.severity === "critical")
        ? "discrepancy"
        : "matched",
    })
    .where(eq(bolSubmissions.id, submissionId));

  _totalMatches++;
  _lastMatchAt = new Date();

  await refreshAssignmentUncertainReasons(db, loadId, extracted);
}

// ---------------------------------------------------------------------------
// Reconciliation queue
// ---------------------------------------------------------------------------

/**
 * Get the reconciliation queue — all BOL submissions ordered by status priority.
 */
export async function getReconciliationQueue(
  db: Database,
  filters?: QueueFilters,
): Promise<QueueItem[]> {
  const limit = filters?.limit ?? 100;
  const offset = filters?.offset ?? 0;

  let query = db
    .select({
      submissionId: bolSubmissions.id,
      loadNumber: bolSubmissions.loadNumber,
      driverName: bolSubmissions.driverName,
      status: bolSubmissions.status,
      matchedLoadId: bolSubmissions.matchedLoadId,
      matchMethod: bolSubmissions.matchMethod,
      matchScore: bolSubmissions.matchScore,
      discrepancies: bolSubmissions.discrepancies,
      aiConfidence: bolSubmissions.aiConfidence,
      createdAt: bolSubmissions.createdAt,
    })
    .from(bolSubmissions)
    .orderBy(bolSubmissions.createdAt)
    .limit(limit)
    .offset(offset);

  // Apply status filter via reconciliation status mapping
  if (filters?.status) {
    const statusMap: Record<ReconciliationStatus, string[]> = {
      pending_bol: ["pending", "extracting"],
      pending_confirmation: ["extracted"],
      critical_discrepancy: ["discrepancy"],
      needs_review: ["matched"], // matched with discrepancies — filtered in-memory
      reconciled: ["confirmed"],
      ready_for_review: ["matched"],
    };
    const dbStatuses = statusMap[filters.status];
    if (dbStatuses && dbStatuses.length > 0) {
      const conditions = dbStatuses.map((s) => eq(bolSubmissions.status, s));
      query = query.where(
        conditions.length === 1 ? conditions[0] : or(...conditions),
      ) as typeof query;
    }
  }

  const rows = await query;

  return rows.map((r) => ({
    submissionId: r.submissionId,
    loadNumber: r.loadNumber,
    driverName: r.driverName,
    status: r.status,
    matchedLoadId: r.matchedLoadId,
    matchMethod: r.matchMethod,
    matchScore: r.matchScore,
    discrepancies: (r.discrepancies ?? []) as unknown[],
    aiConfidence: r.aiConfidence,
    createdAt: r.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * Get reconciliation statistics — aggregate counts across all BOL submissions.
 */
export async function getReconciliationStats(
  db: Database,
): Promise<ReconciliationStats> {
  const [totals] = await db.select({ count: count() }).from(bolSubmissions);

  const [matchedCount] = await db
    .select({ count: count() })
    .from(bolSubmissions)
    .where(
      or(
        eq(bolSubmissions.status, "matched"),
        eq(bolSubmissions.status, "confirmed"),
      ),
    );

  const [unmatchedCount] = await db
    .select({ count: count() })
    .from(bolSubmissions)
    .where(isNull(bolSubmissions.matchedLoadId));

  const [criticalCount] = await db
    .select({ count: count() })
    .from(bolSubmissions)
    .where(eq(bolSubmissions.status, "discrepancy"));

  const [confirmedCount] = await db
    .select({ count: count() })
    .from(bolSubmissions)
    .where(eq(bolSubmissions.status, "confirmed"));

  return {
    totalSubmissions: totals?.count ?? 0,
    matched: matchedCount?.count ?? 0,
    unmatched: unmatchedCount?.count ?? 0,
    criticalDiscrepancies: criticalCount?.count ?? 0,
    needsReview: (matchedCount?.count ?? 0) - (confirmedCount?.count ?? 0),
    reconciled: confirmedCount?.count ?? 0,
  };
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
  const matchRate =
    _totalMatches + _totalMisses > 0
      ? ((_totalMatches / (_totalMatches + _totalMisses)) * 100).toFixed(1)
      : "N/A";

  return {
    name: "reconciliation",
    status: "healthy",
    stats: {
      totalMatches: _totalMatches,
      totalMisses: _totalMisses,
      matchRate: `${matchRate}%`,
      totalDiscrepancies: _totalDiscrepancies,
      lastMatchAt: _lastMatchAt?.toISOString() ?? null,
      matchStrategies: ["ticket_no", "load_no", "driver_date_weight"],
      reconciliationStatuses: [...RECONCILIATION_STATUSES],
    },
    checks: [
      {
        name: "matching-engine",
        ok: true,
        detail: "3-strategy cascade active",
      },
      {
        name: "discrepancy-detection",
        ok: true,
        detail: "weight/ticket/date/driver checks active",
      },
      {
        name: "match-rate",
        ok:
          _totalMisses === 0 ||
          _totalMatches / (_totalMatches + _totalMisses) > 0.5,
        detail: matchRate,
      },
    ],
  };
}
