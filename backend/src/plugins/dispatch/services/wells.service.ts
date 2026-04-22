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
