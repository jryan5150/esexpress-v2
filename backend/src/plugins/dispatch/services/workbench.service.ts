import { eq, and, sql, inArray, ilike, or } from "drizzle-orm";
import {
  assignments,
  loads,
  wells,
  users,
  photos,
  bolSubmissions,
  driverCrossrefs,
} from "../../../db/schema.js";
import type {
  PhotoStatus,
  UncertainReason,
  HandlerStage,
} from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";
import { ValidationError, NotFoundError } from "../../../lib/errors.js";
import { scoreMatch } from "./match-scorer.service.js";
import { extractMatchFeatures } from "./match-features.service.js";
import { signPhotoUrls } from "./photo-sign.service.js";

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
  driverName: string | null;
  ticketNo: string | null;
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

  // Driver is required for PCS dispatch (Jessica's color key cyan-state).
  if (!input.driverName || input.driverName.trim() === "") {
    reasons.push("missing_driver");
  }

  // Ticket-not-arrived state (purple on Jessica's sheet): load exists but
  // no ticket reference has been recorded yet.
  if (!input.ticketNo || input.ticketNo.trim() === "") {
    reasons.push("missing_tickets");
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
  | "missing_ticket"
  | "missing_driver"
  | "needs_rate"
  | "built_today"
  | "all";

export interface WorkbenchListParams {
  filter: WorkbenchFilter;
  userId: number;
  search?: string;
  /** Inclusive lower bound on loads.delivered_on. YYYY-MM-DD, Chicago-local. */
  dateFrom?: string;
  /** Inclusive upper bound on loads.delivered_on. YYYY-MM-DD, Chicago-local. */
  dateTo?: string;
  /** Substring match on loads.truck_no (ilike). */
  truckNo?: string;
  /** Exact match on assignments.well_id. Takes precedence over wellName. */
  wellId?: number;
  /** Substring match on wells.name (ilike). Ignored if wellId is set. */
  wellName?: string;
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
  loadSource: string;
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
  /** Match confidence score in [0, 1]. Computed per-request in Phase 1. */
  matchScore: number;
  /** Coarse tier for backward-compat UI bucketing. */
  matchTier: "high" | "medium" | "low" | "uncertain";
  /**
   * Per-feature breakdown of the match score. Array is sorted by absolute
   * contribution descending (most impactful first — optimized for tooltip).
   */
  matchDrivers: Array<{
    feature: string;
    value: number;
    weight: number;
    contribution: number;
  }>;
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
      case "missing_ticket":
        return and(
          eq(assignments.handlerStage, "uncertain"),
          sql`${assignments.uncertainReasons} @> '["missing_tickets"]'::jsonb`,
        );
      case "missing_driver":
        return and(
          eq(assignments.handlerStage, "uncertain"),
          sql`${assignments.uncertainReasons} @> '["missing_driver"]'::jsonb`,
        );
      case "needs_rate":
        return and(
          eq(assignments.handlerStage, "uncertain"),
          sql`${assignments.uncertainReasons} @> '["rate_missing"]'::jsonb`,
        );
      case "built_today":
        // Anything advanced through the build pipeline today.
        return and(
          inArray(assignments.handlerStage, ["building", "entered", "cleared"]),
          sql`${assignments.stageChangedAt}::date = CURRENT_DATE`,
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

  // Date range on loads.delivered_on — Chicago-local interpretation so the
  // team doesn't accidentally miss loads that landed in the evening before.
  // Matches the pattern used by dispatch-desk.service.ts.
  const dateConditions = [];
  if (params.dateFrom) {
    dateConditions.push(
      sql`${loads.deliveredOn} >= ${`${params.dateFrom}T00:00:00-05:00`}::timestamptz`,
    );
  }
  if (params.dateTo) {
    dateConditions.push(
      sql`${loads.deliveredOn} <= ${`${params.dateTo}T23:59:59.999-05:00`}::timestamptz`,
    );
  }
  const dateCondition =
    dateConditions.length > 0 ? and(...dateConditions) : undefined;

  const truckCondition = params.truckNo
    ? ilike(loads.truckNo, `%${params.truckNo}%`)
    : undefined;

  // Well filter — wellId takes precedence when both are provided. Names
  // match via ilike so "apache" finds "Apache Gulftex Fred Gawlik" etc.
  // When wellName is used, the count query must also join wells (done
  // unconditionally below to preserve the count/data invariant).
  const wellCondition = params.wellId
    ? eq(assignments.wellId, params.wellId)
    : params.wellName
      ? ilike(wells.name, `%${params.wellName}%`)
      : undefined;

  // Compose all conditions in one place — preserves the count-query
  // invariant that only assignments/loads/wells columns are touched.
  const allConditions = [
    filterCondition,
    searchCondition,
    dateCondition,
    truckCondition,
    wellCondition,
  ].filter(Boolean);
  const whereClause =
    allConditions.length === 0
      ? undefined
      : allConditions.length === 1
        ? allConditions[0]
        : and(...(allConditions as NonNullable<typeof allConditions[number]>[]));

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
      loadSource: loads.source,
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
      autoMapTier: assignments.autoMapTier,
      photoStatus: assignments.photoStatus,
      // Correlated subquery avoids row-multiplication when multiple photos
      // exist per assignment. Orders by id ascending (first submitted wins).
      // Falls back to the corpus-backfilled bol_submissions.photos URL when
      // the photos table has no row for this assignment — covers the
      // historical corpus where photos live in bol_submissions, not photos.
      photoThumbUrl: sql<string | null>`
        COALESCE(
          (SELECT ${photos.sourceUrl} FROM ${photos} WHERE ${photos.assignmentId} = ${assignments.id} ORDER BY ${photos.id} ASC LIMIT 1),
          (SELECT ${bolSubmissions.photos}->0->>'url' FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)
        )
      `,
      rate: loads.rate,
      // Phase 5+6: OCR-extracted fields from the most-recent bol_submission
      // matched to this load. Correlated subqueries avoid row multiplication
      // when a load has multiple submissions over time. The same latest row
      // feeds every OCR-derived feature (keeps the snapshot consistent).
      ocrBolNo: sql<
        string | null
      >`(SELECT ${bolSubmissions.aiExtractedData}->>'bolNo' FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)`,
      ocrWeightLbs: sql<
        number | null
      >`(SELECT (${bolSubmissions.aiExtractedData}->>'weight')::numeric FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)`,
      ocrGrossWeightLbs: sql<
        number | null
      >`(SELECT (${bolSubmissions.aiExtractedData}->>'grossWeight')::numeric FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)`,
      ocrTareWeightLbs: sql<
        number | null
      >`(SELECT (${bolSubmissions.aiExtractedData}->>'tareWeight')::numeric FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)`,
      ocrTruckNo: sql<
        string | null
      >`(SELECT ${bolSubmissions.aiExtractedData}->>'truckNo' FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)`,
      ocrCarrierName: sql<
        string | null
      >`(SELECT ${bolSubmissions.aiExtractedData}->>'carrier' FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)`,
      ocrNotes: sql<
        string | null
      >`(SELECT ${bolSubmissions.aiExtractedData}->>'notes' FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)`,
      ocrOverallConfidence: sql<
        number | null
      >`(SELECT (${bolSubmissions.aiExtractedData}->>'overallConfidence')::numeric FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)`,
      loadWeightLbs: loads.weightLbs,
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

  // Phase 5c: driver roster for fuzzy similarity. Fetched once per request;
  // passed by reference to each row's feature extraction. Empty array when
  // driver_crossrefs is unpopulated (Phase 1 fallback kicks in downstream).
  const rosterRows = await db
    .selectDistinct({ canonicalName: driverCrossrefs.canonicalName })
    .from(driverCrossrefs);
  const driverRoster: readonly string[] = rosterRows.map(
    (r) => r.canonicalName,
  );

  // Count query omits wells/users joins — safe because filterCondition
  // only touches assignments columns and searchCondition only touches
  // loads columns. If a future filter references wells or users, this
  // join chain must be expanded to match the data query.
  // Count query joins wells too so wellName ilike conditions still apply.
  // Kept in sync with the data query's join chain — any future filter that
  // references a new table must be added here as well.
  const totalQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(assignments)
    .leftJoin(loads, eq(loads.id, assignments.loadId))
    .leftJoin(wells, eq(wells.id, assignments.wellId));
  const [{ count }] = await (whereClause
    ? totalQuery.where(whereClause)
    : totalQuery);

  const rows: WorkbenchRow[] = rawRows.map((r) => {
    const uncertainReasons = (r.uncertainReasons ?? []) as string[];
    const features = extractMatchFeatures({
      bolNo: r.bolNo,
      ticketNo: r.ticketNo,
      rate: r.rate,
      wellId: r.wellId,
      driverName: r.driverName,
      photoStatus: r.photoStatus,
      deliveredOn: r.deliveredOn,
      autoMapTier: r.autoMapTier,
      uncertainReasons,
      ocrBolNo: r.ocrBolNo,
      ocrWeightLbs:
        r.ocrWeightLbs != null ? Number(r.ocrWeightLbs) : null,
      loadWeightLbs:
        r.loadWeightLbs != null ? Number(r.loadWeightLbs) : null,
      driverRoster,
      // Phase 6
      loadTruckNo: r.truckNo,
      loadCarrierName: r.carrierName,
      ocrTruckNo: r.ocrTruckNo,
      ocrCarrierName: r.ocrCarrierName,
      ocrGrossWeightLbs:
        r.ocrGrossWeightLbs != null ? Number(r.ocrGrossWeightLbs) : null,
      ocrTareWeightLbs:
        r.ocrTareWeightLbs != null ? Number(r.ocrTareWeightLbs) : null,
      ocrNotes: r.ocrNotes,
      ocrOverallConfidence:
        r.ocrOverallConfidence != null
          ? Number(r.ocrOverallConfidence)
          : null,
    });
    const score = scoreMatch(features);

    return {
      assignmentId: r.assignmentId,
      handlerStage: r.handlerStage,
      currentHandlerId: r.currentHandlerId,
      currentHandlerName: r.currentHandlerName,
      currentHandlerColor: r.currentHandlerColor,
      uncertainReasons,
      stageChangedAt: r.stageChangedAt ? r.stageChangedAt.toISOString() : null,
      enteredOn: r.enteredOn ? String(r.enteredOn) : null,
      loadId: r.loadId!,
      loadNo: r.loadNo!,
      loadSource: r.loadSource ?? "manual",
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
      photoThumbUrl: r.photoThumbUrl,
      rate: r.rate,
      matchScore: score.score,
      matchTier: score.tier,
      matchDrivers: score.drivers.map((d) => ({
        feature: String(d.feature),
        value: d.value,
        weight: d.weight,
        contribution: d.contribution,
      })),
    };
  });

  // Sign GCS URLs so the private bucket's photos load in the browser.
  // No-op for JotForm/PropX URLs (returned as-is).
  const signedRows = await signPhotoUrls(rows);

  return { rows: signedRows, total: count };
}

export interface TransitionContext {
  userId: number;
  userName: string;
  notes?: string;
}

export async function advanceStage(
  db: Database,
  assignmentId: number,
  targetStage: HandlerStage,
  ctx: TransitionContext,
): Promise<void> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .limit(1)
      .for("update");
    if (!row) throw new NotFoundError(`Assignment ${assignmentId} not found`);

    const currentStage = row.handlerStage as HandlerStage;
    const reasons = (row.uncertainReasons ?? []) as string[];
    if (!allowedTransition(currentStage, targetStage, reasons)) {
      throw new ValidationError(
        `Cannot transition ${currentStage} → ${targetStage}` +
          (reasons.length > 0
            ? ` (uncertain reasons: ${reasons.join(", ")})`
            : ""),
      );
    }

    const allUsers = await tx
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users);
    const routedHandler = nextHandlerForStage(
      targetStage,
      allUsers as Array<{ id: number; name: string; role: string }>,
    );
    const nextHandlerId =
      targetStage === "ready_to_build" || targetStage === "building"
        ? ctx.userId
        : routedHandler;

    const now = new Date();
    const historyEntry = {
      status: `stage:${targetStage}`,
      changedAt: now.toISOString(),
      changedBy: ctx.userId,
      changedByName: ctx.userName,
      notes: ctx.notes,
    };

    await tx
      .update(assignments)
      .set({
        handlerStage: targetStage,
        currentHandlerId: nextHandlerId,
        stageChangedAt: now,
        enteredOn:
          targetStage === "entered"
            ? sql`CURRENT_DATE`
            : targetStage === "uncertain"
              ? null
              : row.enteredOn,
        statusHistory: sql`coalesce(${assignments.statusHistory}, '[]'::jsonb) || ${JSON.stringify([historyEntry])}::jsonb`,
        updatedAt: now,
      })
      .where(eq(assignments.id, assignmentId));
  });
}

export async function claimAssignment(
  db: Database,
  assignmentId: number,
  userId: number,
): Promise<void> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: assignments.id })
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .limit(1);
    if (!row) throw new NotFoundError(`Assignment ${assignmentId} not found`);

    await tx
      .update(assignments)
      .set({ currentHandlerId: userId, updatedAt: new Date() })
      .where(eq(assignments.id, assignmentId));
  });
}

export async function flagToUncertain(
  db: Database,
  assignmentId: number,
  ctx: TransitionContext & { reason: string },
): Promise<void> {
  return advanceStage(db, assignmentId, "uncertain", {
    ...ctx,
    notes: `flag-back: ${ctx.reason}${ctx.notes ? ` — ${ctx.notes}` : ""}`,
  });
}

/**
 * Route an uncertain row via the granular Resolve modal.
 *
 * Actions:
 * - confirm          — human override: clear uncertain_reasons + advance to ready_to_build
 * - needs_rate       — tag with rate_missing (stays in uncertain)
 * - missing_ticket   — tag with missing_tickets
 * - missing_driver   — tag with missing_driver
 * - flag_other       — tag with an open-ended note (no reason tag; reason held in notes)
 * - reject           — bad row: status='cancelled', handler_stage='cleared',
 *                      assignment drops out of every active queue. Audit
 *                      trail preserved in status_history.
 *
 * All writes go through a transaction with FOR UPDATE to avoid races with
 * the reconciliation refresher.
 */
export type ResolveAction =
  | "confirm"
  | "needs_rate"
  | "missing_ticket"
  | "missing_driver"
  | "flag_other"
  | "reject";

const ACTION_TO_REASON: Record<
  Exclude<ResolveAction, "confirm" | "flag_other" | "reject">,
  string
> = {
  needs_rate: "rate_missing",
  missing_ticket: "missing_tickets",
  missing_driver: "missing_driver",
};

export async function routeUncertain(
  db: Database,
  assignmentId: number,
  action: ResolveAction,
  ctx: TransitionContext,
): Promise<void> {
  if (action === "confirm") {
    // Human override path: clear open reasons, then advance through the
    // normal state machine. Clearing reasons BEFORE advanceStage lets
    // allowedTransition's gate succeed (reasons.length === 0 required).
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(assignments)
        .where(eq(assignments.id, assignmentId))
        .limit(1)
        .for("update");
      if (!row) throw new NotFoundError(`Assignment ${assignmentId} not found`);
      if (row.handlerStage !== "uncertain") {
        throw new ValidationError(
          `Cannot confirm: assignment is in stage ${row.handlerStage}, not uncertain`,
        );
      }

      const now = new Date();
      const historyEntry = {
        status: "confirm-override",
        changedAt: now.toISOString(),
        changedBy: ctx.userId,
        changedByName: ctx.userName,
        notes: ctx.notes ?? "confirmed via resolve modal (override)",
      };

      await tx
        .update(assignments)
        .set({
          uncertainReasons: [],
          statusHistory: sql`coalesce(${assignments.statusHistory}, '[]'::jsonb) || ${JSON.stringify([historyEntry])}::jsonb`,
          updatedAt: now,
        })
        .where(eq(assignments.id, assignmentId));
    }).then(() =>
      advanceStage(db, assignmentId, "ready_to_build", {
        ...ctx,
        notes: ctx.notes ?? "confirmed via resolve modal",
      }),
    );
  }

  // Reject path: cancel + clear. Drops the assignment from every active
  // queue. Audit kept in statusHistory.
  if (action === "reject") {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: assignments.id })
        .from(assignments)
        .where(eq(assignments.id, assignmentId))
        .limit(1)
        .for("update");
      if (!row) throw new NotFoundError(`Assignment ${assignmentId} not found`);

      const now = new Date();
      const historyEntry = {
        status: "reject",
        changedAt: now.toISOString(),
        changedBy: ctx.userId,
        changedByName: ctx.userName,
        notes: ctx.notes ?? "rejected via resolve modal",
      };

      await tx
        .update(assignments)
        .set({
          status: "cancelled",
          handlerStage: "cleared",
          uncertainReasons: [],
          stageChangedAt: now,
          statusHistory: sql`coalesce(${assignments.statusHistory}, '[]'::jsonb) || ${JSON.stringify([historyEntry])}::jsonb`,
          updatedAt: now,
        })
        .where(eq(assignments.id, assignmentId));
    });
  }

  // Re-tag path: replace uncertain_reasons with a single specific reason
  // (needs_rate / missing_ticket / missing_driver) or a free-form "flag_other".
  // Does NOT change handler_stage — row stays in uncertain.
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: assignments.id, handlerStage: assignments.handlerStage })
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .limit(1)
      .for("update");
    if (!row) throw new NotFoundError(`Assignment ${assignmentId} not found`);
    if (row.handlerStage !== "uncertain") {
      throw new ValidationError(
        `Cannot re-tag: assignment is in stage ${row.handlerStage}, not uncertain`,
      );
    }

    const reasonTag: UncertainReason[] =
      action === "flag_other"
        ? []
        : [ACTION_TO_REASON[action] as UncertainReason];

    const now = new Date();
    const historyEntry = {
      status: `route:${action}`,
      changedAt: now.toISOString(),
      changedBy: ctx.userId,
      changedByName: ctx.userName,
      notes: ctx.notes,
    };

    await tx
      .update(assignments)
      .set({
        uncertainReasons: reasonTag,
        statusHistory: sql`coalesce(${assignments.statusHistory}, '[]'::jsonb) || ${JSON.stringify([historyEntry])}::jsonb`,
        updatedAt: now,
      })
      .where(eq(assignments.id, assignmentId));
  });
}
