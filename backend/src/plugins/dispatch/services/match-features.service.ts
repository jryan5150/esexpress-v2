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
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isRecent(iso: string | Date | null, nowMs: number = Date.now()): boolean {
  if (iso === null) return false;
  const ms = iso instanceof Date ? iso.getTime() : Date.parse(iso);
  if (Number.isNaN(ms)) return false;
  return nowMs - ms <= THIRTY_DAYS_MS;
}

/**
 * Translate the BOL state into the tri-value signal the scorer expects.
 * - no BOL on the row → "none"  (missing data → negative contribution)
 * - BOL present AND reconciliation flagged bol_mismatch → "none" too,
 *   because a flagged mismatch should NOT score as a partial match —
 *   the matcher wasn't confident in the BOL's correctness
 * - BOL present with no mismatch flag → "exact"
 *
 * Phase 5 replaces this with an actual comparison against OCR-extracted BOL,
 * at which point "last4" becomes a real intermediate state (BOL present, OCR
 * agrees on last-4 digits only).
 */
function deriveBolMatch(src: FeatureSource): BolMatch {
  if (!src.bolNo) return "none";
  if (src.uncertainReasons.includes("bol_mismatch")) return "none";
  return "exact";
}

/**
 * Approximate weight delta percentage from the uncertain_reasons flag.
 *   - flagged with weight_mismatch → 30 (in the >20% hard-penalty band)
 *   - not flagged + BOL present → 2 (in the "<=5%" green band, implies OCR
 *     extraction succeeded and agreed)
 *   - no BOL → null (no OCR, no signal)
 *
 * Phase 5 replaces with actual computed delta from bol_submissions.
 */
function deriveWeightDelta(src: FeatureSource): number | null {
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
