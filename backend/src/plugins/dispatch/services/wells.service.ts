import { eq, sql, getTableColumns } from "drizzle-orm";
import { wells, assignments, loads } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";

export interface CreateWellInput {
  name: string;
  aliases?: string[];
  status?: "active" | "standby" | "completed" | "closed";
  dailyTargetLoads?: number;
  dailyTargetTons?: string;
  latitude?: string;
  longitude?: string;
  propxJobId?: string;
  propxDestinationId?: string;
  needsRateInfo?: boolean;
  ratePerTon?: string | null;
  ffcRate?: string | null;
  fscRate?: string | null;
  mileageFromLoader?: string | null;
  customerName?: string | null;
  carrierId?: number | null;
  loaderSandplant?: string | null;
}

export interface UpdateWellInput {
  name?: string;
  aliases?: string[];
  status?: "active" | "standby" | "completed" | "closed";
  dailyTargetLoads?: number;
  dailyTargetTons?: string;
  latitude?: string;
  longitude?: string;
  propxJobId?: string;
  propxDestinationId?: string;
  needsRateInfo?: boolean;
  ratePerTon?: string | null;
  ffcRate?: string | null;
  fscRate?: string | null;
  mileageFromLoader?: string | null;
  customerName?: string | null;
  carrierId?: number | null;
  loaderSandplant?: string | null;
}

export async function listWells(
  db: Database,
  filters?: { status?: string; date?: string },
) {
  const wellColumns = getTableColumns(wells);

  // When date is provided, use conditional aggregation scoped to loads.deliveredOn
  // so counts reflect only loads for that day (CDT timezone).
  const dateGuard = filters?.date
    ? sql`AND ${loads.deliveredOn} >= ${`${filters.date}T00:00:00-05:00`}::timestamptz AND ${loads.deliveredOn} <= ${`${filters.date}T23:59:59.999-05:00`}::timestamptz`
    : sql``;

  // Always exclude historical_complete loads from per-well count tiles —
  // they're archive records that were dispatched during v2's build, not
  // actionable work. Fixed 2026-04-14 after Jessica's home-page screenshot
  // showed inflated Review numbers driven by pre-April loads.
  const guard = sql`${dateGuard} AND coalesce(${loads.historicalComplete}, false) = false`;

  const baseQuery = db
    .select({
      ...wellColumns,
      totalLoads:
        sql<number>`cast(count(case when ${assignments.id} is not null ${guard} then 1 end) as int)`.as(
          "total_loads",
        ),
      ready:
        sql<number>`cast(count(case when ${assignments.status} in ('reconciled', 'dispatch_ready', 'dispatching', 'dispatched', 'delivered', 'completed') ${guard} then 1 end) as int)`.as(
          "ready",
        ),
      validated:
        sql<number>`cast(count(case when ${assignments.status} in ('dispatched', 'delivered', 'completed') ${guard} then 1 end) as int)`.as(
          "validated",
        ),
      review:
        sql<number>`cast(count(case when ${assignments.status} = 'pending' ${guard} then 1 end) as int)`.as(
          "review",
        ),
      assigned:
        sql<number>`cast(count(case when ${assignments.status} = 'assigned' ${guard} then 1 end) as int)`.as(
          "assigned",
        ),
      missing:
        sql<number>`cast(count(case when ${assignments.photoStatus} = 'missing' ${guard} then 1 end) as int)`.as(
          "missing",
        ),
    })
    .from(wells)
    .leftJoin(assignments, eq(wells.id, assignments.wellId))
    .leftJoin(loads, eq(assignments.loadId, loads.id))
    .groupBy(wells.id)
    .orderBy(wells.name);

  if (filters?.status) {
    return baseQuery.where(
      eq(
        wells.status,
        filters.status as (typeof wells.status.enumValues)[number],
      ),
    );
  }
  return baseQuery;
}

export async function getWellById(db: Database, id: number) {
  const [well] = await db.select().from(wells).where(eq(wells.id, id)).limit(1);
  return well ?? null;
}

export async function createWell(db: Database, input: CreateWellInput) {
  const [well] = await db
    .insert(wells)
    .values({
      name: input.name,
      aliases: input.aliases ?? [],
      status: input.status ?? "active",
      dailyTargetLoads: input.dailyTargetLoads,
      dailyTargetTons: input.dailyTargetTons,
      latitude: input.latitude,
      longitude: input.longitude,
      propxJobId: input.propxJobId,
      propxDestinationId: input.propxDestinationId,
      needsRateInfo: input.needsRateInfo,
      ratePerTon: input.ratePerTon ?? undefined,
      ffcRate: input.ffcRate ?? undefined,
      fscRate: input.fscRate ?? undefined,
      mileageFromLoader: input.mileageFromLoader ?? undefined,
      customerName: input.customerName ?? undefined,
      carrierId: input.carrierId ?? undefined,
      loaderSandplant: input.loaderSandplant ?? undefined,
    })
    .returning();
  return well;
}

export async function updateWell(
  db: Database,
  id: number,
  input: UpdateWellInput,
) {
  const [well] = await db
    .update(wells)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(wells.id, id))
    .returning();
  return well ?? null;
}

/**
 * Absorb an orphan destination into this well.
 *
 * Three actions performed in sequence (idempotent across all three):
 *  1. Append `destinationName` to `wells.aliases` (idempotent — won't
 *     duplicate if the alias is already present, case-insensitive).
 *  2. Re-map every existing assignment whose load.destination_name matches
 *     `destinationName` AND has no wellId yet, to point at this well.
 *     Never overwrites an existing wellId.
 *  3. Create new assignments for loads with matching destination_name that
 *     have NO assignment row at all. These are the loads the matcher
 *     skipped because the alias didn't exist yet.
 *
 * The orphan_destination discrepancy sweep counts BOTH cases (LEFT JOIN
 * with assignments.well_id IS NULL covers no-assignment-at-all AND
 * assignment-with-null-wellId), so the resolver has to handle both.
 *
 * Designed for the "Closest existing well: X (100% match)" workflow on
 * orphan_destination discrepancies — single click, all three fixes
 * applied. Returns granular counts so admin UI / agent can report
 * cleanly to dispatch.
 *
 * `actorId` and `actorName` are recorded on any newly-created assignments
 * for audit trail. Pass the request's authenticated user.
 */
export async function absorbDestination(
  db: Database,
  wellId: number,
  destinationName: string,
  actorId: number,
  actorName: string,
): Promise<{
  wellExists: boolean;
  aliasAdded: boolean;
  assignmentsRemapped: number;
  assignmentsCreated: number;
}> {
  const trimmed = destinationName.trim();
  if (!trimmed) {
    return {
      wellExists: false,
      aliasAdded: false,
      assignmentsRemapped: 0,
      assignmentsCreated: 0,
    };
  }

  const [well] = await db
    .select({ id: wells.id, aliases: wells.aliases })
    .from(wells)
    .where(eq(wells.id, wellId))
    .limit(1);

  if (!well) {
    return {
      wellExists: false,
      aliasAdded: false,
      assignmentsRemapped: 0,
      assignmentsCreated: 0,
    };
  }

  const existingAliases = Array.isArray(well.aliases) ? well.aliases : [];
  const lowered = existingAliases.map((a) =>
    typeof a === "string" ? a.toLowerCase() : "",
  );
  const aliasAlreadyPresent = lowered.includes(trimmed.toLowerCase());

  let aliasAdded = false;
  if (!aliasAlreadyPresent) {
    await db
      .update(wells)
      .set({
        aliases: [...existingAliases, trimmed],
        updatedAt: new Date(),
      })
      .where(eq(wells.id, wellId));
    aliasAdded = true;
  }

  // (2) Re-map existing assignments where well_id IS NULL.
  const remapped = await db
    .update(assignments)
    .set({
      wellId,
      updatedAt: new Date(),
    })
    .where(
      sql`${assignments.wellId} IS NULL AND ${assignments.loadId} IN (SELECT ${loads.id} FROM ${loads} WHERE ${loads.destinationName} = ${trimmed})`,
    )
    .returning({ id: assignments.id });

  // (3) Create assignments for loads with destination match but NO
  // assignment row yet (the LEFT-JOIN-NULL case in the orphan sweep).
  // We use the same createAssignment path so status_history, uncertain
  // reasons, etc. are populated identically to matcher-created rows.
  const orphanLoadIds = await db
    .select({ id: loads.id })
    .from(loads)
    .leftJoin(assignments, eq(assignments.loadId, loads.id))
    .where(
      sql`${loads.destinationName} = ${trimmed} AND ${assignments.id} IS NULL`,
    );

  let assignmentsCreated = 0;
  if (orphanLoadIds.length > 0) {
    const { createAssignment } = await import("./assignments.service.js");
    for (const { id } of orphanLoadIds) {
      try {
        await createAssignment(db, {
          wellId,
          loadId: id,
          assignedBy: actorId,
          assignedByName: actorName,
        });
        assignmentsCreated += 1;
      } catch {
        // skip on per-row failure (likely a unique constraint or load gone);
        // the bulk operation still succeeds for the other rows
      }
    }
  }

  return {
    wellExists: true,
    aliasAdded,
    assignmentsRemapped: remapped.length,
    assignmentsCreated,
  };
}
