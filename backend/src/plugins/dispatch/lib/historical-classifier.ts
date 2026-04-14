import { ERA_CUTOFF } from "./era-filter.js";

/**
 * Fields considered "core" for determining if a historical load is complete.
 * A pre-cutoff load with all of these populated is treated as already-dispatched
 * and auto-classified as historical_complete — it bypasses the validation queue.
 */
export interface ClassifiableLoad {
  deliveredOn: Date | string | null;
  bolNo: string | null;
  ticketNo: string | null;
  driverName: string | null;
  weightTons: string | null;
  weightLbs: string | null;
}

export interface ClassificationResult {
  isComplete: boolean;
  reason: string;
}

/**
 * Determine whether a load should be auto-classified as historical_complete.
 *
 * Criteria (all must be true):
 *   1. deliveredOn is populated AND before ERA_CUTOFF
 *   2. At least one BOL-like identifier (bolNo OR ticketNo)
 *   3. driverName populated
 *   4. Some weight measurement (weightTons OR weightLbs)
 *
 * Rationale: pre-cutoff loads with this shape are loads that were already built
 * in PCS and dispatched in the team's prior manual workflow. They exist in v2
 * as searchable historical data, not as validation work.
 *
 * Returns { isComplete: false, reason: "..." } when a criterion fails — the
 * reason is stored on the load for audit so anyone can see WHY a load was (or
 * wasn't) auto-classified.
 */
export function classifyHistoricalLoad(
  load: ClassifiableLoad,
): ClassificationResult {
  if (!load.deliveredOn) {
    return { isComplete: false, reason: "no delivered_on" };
  }

  const deliveredMs =
    load.deliveredOn instanceof Date
      ? load.deliveredOn.getTime()
      : new Date(load.deliveredOn).getTime();

  if (Number.isNaN(deliveredMs)) {
    return { isComplete: false, reason: "invalid delivered_on" };
  }

  const cutoffMs = new Date(ERA_CUTOFF).getTime();
  if (deliveredMs >= cutoffMs) {
    return { isComplete: false, reason: "post-cutoff (live era)" };
  }

  const hasIdentifier = Boolean(load.bolNo?.trim() || load.ticketNo?.trim());
  if (!hasIdentifier) {
    return { isComplete: false, reason: "no BOL or ticket number" };
  }

  if (!load.driverName?.trim()) {
    return { isComplete: false, reason: "no driver name" };
  }

  const hasWeight = Boolean(load.weightTons || load.weightLbs);
  if (!hasWeight) {
    return { isComplete: false, reason: "no weight measurement" };
  }

  return {
    isComplete: true,
    reason: "pre-cutoff with core fields (bol/ticket + driver + weight)",
  };
}
