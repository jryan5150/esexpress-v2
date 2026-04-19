/**
 * Match Features Extractor — Phase 1 of matching-v2
 * ==================================================
 *
 * Derives MatchFeatures from the data already available on a workbench row.
 * Phase 1 uses approximations based on uncertainReasons + existing columns;
 * Phase 5+ will upgrade to full OCR-based signals pulled from bol_submissions
 * and reconciliation service output.
 *
 * Pure function — no DB lookups. Accepts a plain feature-source shape so it
 * stays easy to call from listWorkbenchRows's mapping step.
 */

import type { MatchFeatures, BolMatch } from "./match-scorer.service.js";

export interface FeatureSource {
  bolNo: string | null;
  ticketNo: string | null;
  rate: string | null;
  wellId: number | null;
  driverName: string | null;
  photoStatus: string | null; // "attached" | "pending" | "missing" | null
  deliveredOn: string | Date | null;
  autoMapTier: number | null;
  uncertainReasons: readonly string[];
  /**
   * Phase 5: OCR-extracted BOL from the matched bol_submissions row. When
   * present, enables real last-4 comparison vs. the load's bol_no. When
   * null, derive* functions fall back to Phase 1 flag-based signal.
   */
  ocrBolNo?: string | null;
  /**
   * Phase 5: OCR-extracted weight in pounds. When present, computes real
   * weight delta percentage vs. loadWeightLbs (or weightTons * 2000).
   */
  ocrWeightLbs?: number | null;
  /**
   * Phase 5: load's canonical weight in pounds for delta calculation.
   * Passed separately from weightTons to avoid string parsing in the hot path.
   */
  loadWeightLbs?: number | null;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isRecent(iso: string | Date | null, nowMs: number = Date.now()): boolean {
  if (iso === null) return false;
  const ms = iso instanceof Date ? iso.getTime() : Date.parse(iso);
  if (Number.isNaN(ms)) return false;
  return nowMs - ms <= THIRTY_DAYS_MS;
}

/**
 * Phase 5: when OCR data is available, compare the last 4 characters of the
 * load's bol_no against the OCR-extracted value. When OCR isn't available,
 * fall back to Phase 1 flag-based derivation.
 *
 * Last-4 (vs full string) because real-world BOLs often have carrier prefixes
 * ("BOL-71023" vs "71023") that drop in/out at different pipeline steps.
 * The last 4 digits are the stable identity portion.
 */
function last4(v: string): string {
  const digits = v.replace(/\s+/g, "");
  return digits.slice(-4);
}

function deriveBolMatch(src: FeatureSource): BolMatch {
  if (!src.bolNo) return "none";

  // Phase 5 path: real OCR comparison when extraction is available
  if (src.ocrBolNo && src.ocrBolNo.trim().length > 0) {
    const loadTail = last4(src.bolNo);
    const ocrTail = last4(src.ocrBolNo);
    if (loadTail === ocrTail) return "exact";
    // Different last-4 digits = true mismatch; not a partial match
    return "none";
  }

  // Phase 1 fallback: flag-based approximation
  if (src.uncertainReasons.includes("bol_mismatch")) return "none";
  return "exact";
}

/**
 * Phase 5: compute real weight delta from OCR extraction when available.
 * Phase 1 fallback: map flag state to representative band value.
 *
 * Delta formula: abs(loadWeightLbs - ocrWeightLbs) / loadWeightLbs * 100.
 * Returns null when inputs make the calculation impossible.
 */
function deriveWeightDelta(src: FeatureSource): number | null {
  // Phase 5 path: real calculation when both weights present
  if (
    src.ocrWeightLbs != null &&
    src.loadWeightLbs != null &&
    src.loadWeightLbs > 0
  ) {
    const pct =
      (Math.abs(src.loadWeightLbs - src.ocrWeightLbs) / src.loadWeightLbs) *
      100;
    return pct;
  }

  // Phase 1 fallback: flag-based approximation
  if (src.uncertainReasons.includes("weight_mismatch")) return 30;
  if (!src.bolNo) return null;
  return 2;
}

/**
 * Approximate driver fuzzy similarity.
 * - driver name missing → null (no signal)
 * - driver_mismatch flag → 0.3 (clearly failed fuzzy match)
 * - fuzzy_match flag → 0.6 (cascade hit on fuzzy, lower confidence than
 *   ticket_no/load_no exact matches)
 * - otherwise present → 1.0 (assume match)
 */
function deriveDriverSimilarityValue(src: FeatureSource): number | null {
  if (!src.driverName || src.driverName.trim().length === 0) return null;
  if (src.uncertainReasons.includes("driver_mismatch")) return 0.3;
  if (src.uncertainReasons.includes("fuzzy_match")) return 0.6;
  return 1.0;
}

export function extractMatchFeatures(
  src: FeatureSource,
  nowMs: number = Date.now(),
): MatchFeatures {
  // no_photo_48h reason is load-blocking even when photoStatus contradicts
  // (seed/data inconsistencies); trust the reason flag over the raw column
  // for Phase 1's approximation layer.
  const flaggedNoPhoto = src.uncertainReasons.includes("no_photo_48h");
  const hasPhoto = !flaggedNoPhoto && src.photoStatus === "attached";

  return {
    bolMatch: deriveBolMatch(src),
    weightDeltaPct: deriveWeightDelta(src),
    hasPhoto,
    driverSimilarity: deriveDriverSimilarityValue(src),
    autoMapTier: src.autoMapTier ?? 0,
    wellAssigned: src.wellId !== null,
    hasTicket: !!src.ticketNo && src.ticketNo.trim().length > 0,
    hasRate: !!src.rate && src.rate.trim().length > 0,
    deliveredRecent: isRecent(src.deliveredOn, nowMs),
  };
}
