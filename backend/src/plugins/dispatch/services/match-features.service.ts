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
 * - no BOL on the row → "none"
 * - BOL present AND reconciliation flagged bol_mismatch → "last4" (partial)
 * - BOL present with no mismatch flag → "exact"
 *
 * Phase 5 replaces this with an actual comparison against OCR-extracted BOL.
 */
function deriveBolMatch(src: FeatureSource): BolMatch {
  if (!src.bolNo) return "none";
  if (src.uncertainReasons.includes("bol_mismatch")) return "last4";
  return "exact";
}

/**
 * Approximate weight delta percentage from the uncertain_reasons flag.
 * When we don't know the actual delta, pick a representative value from
 * the band so the scorer's threshold logic treats the row correctly:
 *   - flagged with weight_mismatch → 15 (in the 5-20% "soft" penalty band)
 *   - not flagged → 2 (in the "<=5%" green band)
 *   - no load weight / no OCR weight → null (no signal)
 *
 * Phase 5 replaces with actual computed delta from bol_submissions.
 */
function deriveWeightDelta(src: FeatureSource): number | null {
  if (src.uncertainReasons.includes("weight_mismatch")) return 15;
  // No BOL → no OCR weight extraction → no signal
  if (!src.bolNo) return null;
  return 2;
}

/**
 * Approximate driver fuzzy similarity. Phase 1 is binary:
 *   - driver name present → 1.0 (assume match)
 *   - driver name missing → null (no signal)
 *
 * Phase 5 replaces with actual fuzzy score vs. PropX/Logistiq roster.
 */
function deriveDriverSimilarity(src: FeatureSource): number | null {
  if (!src.driverName || src.driverName.trim().length === 0) return null;
  // Poor-quality driver flagged via uncertain_reasons
  if (src.uncertainReasons.includes("driver_mismatch")) return 0.4;
  return 1.0;
}

export function extractMatchFeatures(
  src: FeatureSource,
  nowMs: number = Date.now(),
): MatchFeatures {
  return {
    bolMatch: deriveBolMatch(src),
    weightDeltaPct: deriveWeightDelta(src),
    hasPhoto: src.photoStatus === "attached",
    driverSimilarity: deriveDriverSimilarity(src),
    autoMapTier: src.autoMapTier ?? 0,
    wellAssigned: src.wellId !== null,
    hasTicket: !!src.ticketNo && src.ticketNo.trim().length > 0,
    hasRate: !!src.rate && src.rate.trim().length > 0,
    deliveredRecent: isRecent(src.deliveredOn, nowMs),
  };
}
