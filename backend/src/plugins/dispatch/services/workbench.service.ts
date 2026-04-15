import type { PhotoStatus, UncertainReason } from "../../../db/schema.js";

export interface UncertainReasonInput {
  wellId: number | null;
  photoStatus: PhotoStatus | null;
  autoMapTier: number | null;
  bolNo: string | null;
  ocrBolNo: string | null;
  loadWeightLbs: number | null;
  ocrWeightLbs: number | null;
  rate: string | null;
  deliveredOn: Date | null;
}

const WEIGHT_TOLERANCE = 0.05; // 5%
const PHOTO_GRACE_HOURS = 48;

/**
 * Pure function: given the pipeline-derived facts for an assignment,
 * return the list of uncertain reasons that should be stored in
 * assignments.uncertain_reasons.
 *
 * Called on: ingestion, reconciliation run, manual edit, rate edit.
 * Result: if empty, assignment is eligible for 'ready_to_build' stage.
 */
export function computeUncertainReasons(
  input: UncertainReasonInput,
): UncertainReason[] {
  const reasons: UncertainReason[] = [];

  if (input.wellId == null) {
    reasons.push("unassigned_well");
  }

  if (input.autoMapTier != null && input.autoMapTier > 1) {
    reasons.push("fuzzy_match");
  }

  if (input.bolNo && input.ocrBolNo) {
    const loadLast4 = input.bolNo.slice(-4);
    const ocrLast4 = input.ocrBolNo.slice(-4);
    if (loadLast4 !== ocrLast4) {
      reasons.push("bol_mismatch");
    }
  }

  if (
    input.loadWeightLbs != null &&
    input.ocrWeightLbs != null &&
    input.loadWeightLbs > 0
  ) {
    const delta =
      Math.abs(input.loadWeightLbs - input.ocrWeightLbs) / input.loadWeightLbs;
    if (delta > WEIGHT_TOLERANCE) {
      reasons.push("weight_mismatch");
    }
  }

  if (input.photoStatus === "missing" && input.deliveredOn) {
    const ageHours =
      (Date.now() - input.deliveredOn.getTime()) / (1000 * 60 * 60);
    if (ageHours > PHOTO_GRACE_HOURS) {
      reasons.push("no_photo_48h");
    }
  }

  const rateNum = input.rate == null ? 0 : parseFloat(input.rate);
  if (!rateNum || rateNum <= 0) {
    reasons.push("rate_missing");
  }

  return reasons;
}
