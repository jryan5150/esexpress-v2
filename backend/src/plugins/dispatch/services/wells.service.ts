import { eq, sql, getTableColumns } from "drizzle-orm";
import { wells, assignments } from "../../../db/schema.js";
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
}

export async function listWells(db: Database, filters?: { status?: string }) {
  const wellColumns = getTableColumns(wells);
  const baseQuery = db
    .select({
      ...wellColumns,
      // Total assignments for this well
      totalLoads: sql<number>`cast(count(${assignments.id}) as int)`.as(
        "total_loads",
      ),
      // dispatch_ready or beyond = "ready"
      ready:
        sql<number>`cast(count(case when ${assignments.status} in ('dispatch_ready', 'dispatching', 'dispatched', 'delivered', 'completed') then 1 end) as int)`.as(
          "ready",
        ),
      // pending = needs review
      review:
        sql<number>`cast(count(case when ${assignments.status} = 'pending' then 1 end) as int)`.as(
          "review",
        ),
      // assigned = confirmed but not yet dispatch-ready
      assigned:
        sql<number>`cast(count(case when ${assignments.status} = 'assigned' then 1 end) as int)`.as(
          "assigned",
        ),
      // missing photo status
      missing:
        sql<number>`cast(count(case when ${assignments.photoStatus} = 'missing' then 1 end) as int)`.as(
          "missing",
        ),
    })
    .from(wells)
    .leftJoin(assignments, eq(wells.id, assignments.wellId))
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
