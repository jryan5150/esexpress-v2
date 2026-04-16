import type {
  PhotoStatus,
  UncertainReason,
  HandlerStage,
} from "../../../db/schema.js";

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
  nowMs: number = Date.now(),
): UncertainReason[] {
  const reasons: UncertainReason[] = [];

  if (input.wellId == null) {
    reasons.push("unassigned_well");
  }

  if (input.autoMapTier != null && input.autoMapTier > 1) {
    reasons.push("fuzzy_match");
  }

  if (
    input.bolNo &&
    input.ocrBolNo &&
    input.bolNo.length >= 4 &&
    input.ocrBolNo.length >= 4
  ) {
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
    const ageHours = (nowMs - input.deliveredOn.getTime()) / (1000 * 60 * 60);
    if (ageHours > PHOTO_GRACE_HOURS) {
      reasons.push("no_photo_48h");
    }
  }

  // Policy: rate of 0 or non-numeric is treated as missing for build purposes.
  // Strict regex rejects values like "125.50/ton" or "$125" that would slip
  // past parseFloat's permissive parsing.
  const rateStr = input.rate?.trim() ?? "";
  const rateNum = /^-?\d+(\.\d+)?$/.test(rateStr) ? parseFloat(rateStr) : 0;
  if (!rateNum || rateNum <= 0) {
    reasons.push("rate_missing");
  }

  return reasons;
}

/**
 * Stage transition rules. Forward edges only, plus flag-back-to-uncertain from any.
 * Uncertain → ready_to_build requires uncertain_reasons be empty.
 */
export function allowedTransition(
  from: HandlerStage,
  to: HandlerStage,
  uncertainReasons: readonly string[],
): boolean {
  // Flag-back is allowed from any non-uncertain stage
  if (to === "uncertain" && from !== "uncertain") return true;

  const forwardEdges: Record<HandlerStage, HandlerStage | null> = {
    uncertain: "ready_to_build",
    ready_to_build: "building",
    building: "entered",
    entered: "cleared",
    cleared: null,
  };

  if (forwardEdges[from] !== to) return false;
  if (from === "uncertain" && uncertainReasons.length > 0) return false;
  return true;
}

/**
 * Router: given a stage, return the user id who should own the load next.
 *
 * V5 uses name-substring matching since the existing users.role enum
 * (admin/dispatcher/viewer) doesn't distinguish Jess/Steph/Katie functionally.
 * Substring matches are case-insensitive. Post-v5, this can be replaced with
 * a proper role field once the users.role enum is expanded.
 *
 * - uncertain  → user whose name contains 'jess'
 * - entered    → user whose name contains 'kati' (matches Katie / Katy / Kathy)
 * - ready_to_build / building → null (claim-based, caller decides)
 * - cleared    → null (terminal)
 */
export function nextHandlerForStage(
  stage: HandlerStage,
  users: ReadonlyArray<{ id: number; name?: string | null; role?: string }>,
): number | null {
  if (stage === "uncertain") {
    const jess = users.find((u) =>
      (u.name ?? "").toLowerCase().includes("jess"),
    );
    return jess?.id ?? null;
  }
  if (stage === "entered") {
    const katie = users.find((u) =>
      (u.name ?? "").toLowerCase().includes("kati"),
    );
    return katie?.id ?? null;
  }
  return null;
}
