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

import type {
  MatchFeatures,
  BolMatch,
  TruckMatch,
} from "./match-scorer.service.js";
import {
  bestRosterMatch,
  jaroWinkler,
  normalizeName,
} from "../../../lib/string-similarity.js";

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
  /**
   * Phase 5c: canonical driver names from driver_crossrefs (one per
   * distinct canonical_name). When provided + non-empty, driverSimilarity
   * is computed via Jaro-Winkler against the roster. When null/empty,
   * falls back to Phase 1 flag-based derivation.
   *
   * Callers (listWorkbenchRows, snapshotAssignmentScore) fetch this once
   * per request and pass the same reference to every row's extractor call.
   */
  driverRoster?: readonly string[];

  // ── Phase 6 (2026-04-19): additional OCR fields from bol_submissions.ai_extracted_data ──
  /** Canonical truck number on the load record. */
  loadTruckNo?: string | null;
  /** Canonical carrier name on the load record. */
  loadCarrierName?: string | null;
  /** Truck number extracted from the BOL photo. */
  ocrTruckNo?: string | null;
  /** Carrier name extracted from the BOL photo. */
  ocrCarrierName?: string | null;
  /** Gross weight (lbs) from OCR for gross/tare/net consistency check. */
  ocrGrossWeightLbs?: number | null;
  /** Tare weight (lbs) from OCR for gross/tare/net consistency check. */
  ocrTareWeightLbs?: number | null;
  /** Free-form notes field from OCR (anomaly-keyword parse target). */
  ocrNotes?: string | null;
  /** Overall extraction confidence reported by Claude Vision (0-100 or 0-1). */
  ocrOverallConfidence?: number | null;
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
 * Phase 5c: compute real driver fuzzy similarity when a canonical roster
 * is provided. Falls back to Phase 1 flag-based derivation when no roster.
 *
 * Roster source of truth is driver_crossrefs (canonical_name distinct
 * values). Caller fetches the roster once per request and passes by ref.
 */
function deriveDriverSimilarityValue(src: FeatureSource): number | null {
  if (!src.driverName || src.driverName.trim().length === 0) return null;

  // Phase 5c path: real Jaro-Winkler against canonical roster
  if (src.driverRoster && src.driverRoster.length > 0) {
    return bestRosterMatch(src.driverName, src.driverRoster);
  }

  // Phase 1 fallback: flag-based approximation
  if (src.uncertainReasons.includes("driver_mismatch")) return 0.3;
  if (src.uncertainReasons.includes("fuzzy_match")) return 0.6;
  return 1.0;
}

// ──────────────────────────────────────────────────────────────────────────
// Phase 6 derivations: truck / carrier / weights / notes / confidence
// ──────────────────────────────────────────────────────────────────────────

const ANOMALY_KEYWORDS = [
  "short",
  "spill",
  "reject",
  "rejected",
  "damage",
  "damaged",
  "reweigh",
  "reweighed",
  "overage",
  "shortage",
  "contaminat",
  "refused",
  "dispute",
];

function deriveTruckOcrMatch(src: FeatureSource): TruckMatch | null {
  const load = src.loadTruckNo?.trim();
  const ocr = src.ocrTruckNo?.trim();
  if (!load || !ocr) return null;
  const loadN = load.replace(/[^0-9a-z]/gi, "").toLowerCase();
  const ocrN = ocr.replace(/[^0-9a-z]/gi, "").toLowerCase();
  if (loadN === ocrN) return "exact";
  // Partial: one is a suffix/prefix of the other (e.g., "1456" vs "T-1456")
  if (loadN.length >= 3 && ocrN.length >= 3) {
    if (loadN.endsWith(ocrN) || ocrN.endsWith(loadN)) return "partial";
    if (loadN.startsWith(ocrN) || ocrN.startsWith(loadN)) return "partial";
  }
  return "none";
}

function deriveCarrierSimilarity(src: FeatureSource): number | null {
  const load = src.loadCarrierName?.trim();
  const ocr = src.ocrCarrierName?.trim();
  if (!load || !ocr) return null;
  return jaroWinkler(load, ocr);
}

/**
 * BOL math sanity: does (gross - tare) ≈ the load's declared weight?
 * Returns 1.0 when within 1% tolerance, scales down with larger divergence.
 * Null when gross, tare, or load weight is missing.
 */
function deriveGrossTareConsistency(src: FeatureSource): number | null {
  const gross = src.ocrGrossWeightLbs;
  const tare = src.ocrTareWeightLbs;
  const load = src.loadWeightLbs;
  if (gross == null || tare == null || load == null || load <= 0) return null;
  const computedNet = gross - tare;
  if (computedNet <= 0) return 0; // nonsensical — treat as failed check
  const pctDiff = Math.abs(computedNet - load) / load;
  if (pctDiff <= 0.01) return 1.0;
  if (pctDiff <= 0.05) return 0.9;
  if (pctDiff <= 0.1) return 0.7;
  if (pctDiff <= 0.2) return 0.4;
  return 0;
}

function deriveHasAnomalyNote(src: FeatureSource): boolean | null {
  if (src.ocrNotes == null) return null;
  const normalized = normalizeName(src.ocrNotes);
  if (normalized.length === 0) return false;
  for (const kw of ANOMALY_KEYWORDS) {
    if (normalized.includes(kw)) return true;
  }
  return false;
}

/**
 * Claude Vision reports overallConfidence as 0-100 in the prompt contract;
 * we normalize to 0-1 for scorer consumption. Accepts both scales defensively.
 */
function deriveOcrOverallConfidence(src: FeatureSource): number | null {
  const v = src.ocrOverallConfidence;
  if (v == null) return null;
  if (v > 1) return Math.min(1, v / 100);
  return Math.max(0, Math.min(1, v));
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
    // Phase 6
    truckOcrMatch: deriveTruckOcrMatch(src),
    carrierSimilarity: deriveCarrierSimilarity(src),
    grossTareConsistency: deriveGrossTareConsistency(src),
    hasAnomalyNote: deriveHasAnomalyNote(src),
    ocrOverallConfidence: deriveOcrOverallConfidence(src),
  };
}
