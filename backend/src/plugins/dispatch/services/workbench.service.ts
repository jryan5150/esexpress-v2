import { eq, and, sql, inArray, ilike, or } from "drizzle-orm";
import { assignments, loads, wells, users } from "../../../db/schema.js";
import type {
  PhotoStatus,
  UncertainReason,
  HandlerStage,
} from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";

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

export type WorkbenchFilter =
  | "uncertain"
  | "ready_to_build"
  | "mine"
  | "ready_to_clear"
  | "entered_today"
  | "all";

export interface WorkbenchListParams {
  filter: WorkbenchFilter;
  userId: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface WorkbenchRow {
  assignmentId: number;
  handlerStage: string;
  currentHandlerId: number | null;
  currentHandlerName: string | null;
  currentHandlerColor: string | null;
  uncertainReasons: string[];
  stageChangedAt: string | null;
  enteredOn: string | null;
  loadId: number;
  loadNo: string;
  driverName: string | null;
  carrierName: string | null;
  bolNo: string | null;
  ticketNo: string | null;
  weightTons: string | null;
  truckNo: string | null;
  deliveredOn: string | null;
  pickupState: string | null;
  deliveryState: string | null;
  wellId: number | null;
  wellName: string | null;
  photoStatus: string | null;
  photoThumbUrl: string | null;
  rate: string | null;
}

export async function listWorkbenchRows(
  db: Database,
  params: WorkbenchListParams,
): Promise<{ rows: WorkbenchRow[]; total: number }> {
  const limit = Math.min(params.limit ?? 100, 500);
  const offset = params.offset ?? 0;

  const filterCondition = (() => {
    switch (params.filter) {
      case "uncertain":
        return eq(assignments.handlerStage, "uncertain");
      case "ready_to_build":
        return eq(assignments.handlerStage, "ready_to_build");
      case "mine":
        return eq(assignments.currentHandlerId, params.userId);
      case "ready_to_clear":
        return eq(assignments.handlerStage, "entered");
      case "entered_today":
        // CURRENT_DATE is UTC (Railway default). Loads entered after midnight
        // Chicago but before midnight UTC will be included incorrectly.
        // Post-v5: swap for (now() AT TIME ZONE 'America/Chicago')::date.
        return and(
          inArray(assignments.handlerStage, ["entered", "cleared"]),
          sql`${assignments.enteredOn} = CURRENT_DATE`,
        );
      case "all":
      default:
        return undefined;
    }
  })();

  const searchCondition = params.search
    ? or(
        ilike(loads.bolNo, `%${params.search}%`),
        ilike(loads.loadNo, `%${params.search}%`),
        ilike(loads.ticketNo, `%${params.search}%`),
        ilike(loads.driverName, `%${params.search}%`),
        ilike(loads.truckNo, `%${params.search}%`),
      )
    : undefined;

  const whereClause =
    filterCondition && searchCondition
      ? and(filterCondition, searchCondition)
      : (filterCondition ?? searchCondition);

  const baseQuery = db
    .select({
      assignmentId: assignments.id,
      handlerStage: assignments.handlerStage,
      currentHandlerId: assignments.currentHandlerId,
      currentHandlerName: users.name,
      currentHandlerColor: users.color,
      uncertainReasons: assignments.uncertainReasons,
      stageChangedAt: assignments.stageChangedAt,
      enteredOn: assignments.enteredOn,
      loadId: loads.id,
      loadNo: loads.loadNo,
      driverName: loads.driverName,
      carrierName: loads.carrierName,
      bolNo: loads.bolNo,
      ticketNo: loads.ticketNo,
      weightTons: loads.weightTons,
      truckNo: loads.truckNo,
      deliveredOn: loads.deliveredOn,
      pickupState: loads.pickupState,
      deliveryState: loads.deliveryState,
      wellId: wells.id,
      wellName: wells.name,
      photoStatus: assignments.photoStatus,
      rate: loads.rate,
    })
    .from(assignments)
    .leftJoin(loads, eq(loads.id, assignments.loadId))
    .leftJoin(wells, eq(wells.id, assignments.wellId))
    .leftJoin(users, eq(users.id, assignments.currentHandlerId));

  const query = whereClause ? baseQuery.where(whereClause) : baseQuery;

  const rawRows = await query
    .orderBy(sql`${assignments.stageChangedAt} DESC NULLS LAST`)
    .limit(limit)
    .offset(offset);

  // Count query omits wells/users joins — safe because filterCondition
  // only touches assignments columns and searchCondition only touches
  // loads columns. If a future filter references wells or users, this
  // join chain must be expanded to match the data query.
  const totalQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(assignments)
    .leftJoin(loads, eq(loads.id, assignments.loadId));
  const [{ count }] = await (whereClause
    ? totalQuery.where(whereClause)
    : totalQuery);

  const rows: WorkbenchRow[] = rawRows.map((r) => ({
    assignmentId: r.assignmentId,
    handlerStage: r.handlerStage,
    currentHandlerId: r.currentHandlerId,
    currentHandlerName: r.currentHandlerName,
    currentHandlerColor: r.currentHandlerColor,
    uncertainReasons: (r.uncertainReasons ?? []) as string[],
    stageChangedAt: r.stageChangedAt ? r.stageChangedAt.toISOString() : null,
    enteredOn: r.enteredOn ? String(r.enteredOn) : null,
    loadId: r.loadId!,
    loadNo: r.loadNo!,
    driverName: r.driverName,
    carrierName: r.carrierName,
    bolNo: r.bolNo,
    ticketNo: r.ticketNo,
    weightTons: r.weightTons,
    truckNo: r.truckNo,
    deliveredOn: r.deliveredOn ? r.deliveredOn.toISOString() : null,
    pickupState: r.pickupState,
    deliveryState: r.deliveryState,
    wellId: r.wellId,
    wellName: r.wellName,
    photoStatus: r.photoStatus,
    photoThumbUrl: null,
    rate: r.rate,
  }));

  return { rows, total: count };
}
