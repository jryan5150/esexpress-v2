import { eq, and, sql, desc } from "drizzle-orm";
import { loads } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";

export interface LoadFilters {
  source?: "propx" | "logistiq" | "manual";
  status?: string;
  driverName?: string;
  destinationName?: string;
  page?: number;
  limit?: number;
}

export async function queryLoads(db: Database, filters: LoadFilters) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (filters.source) conditions.push(eq(loads.source, filters.source));
  if (filters.status) conditions.push(eq(loads.status, filters.status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db
      .select()
      .from(loads)
      .where(where)
      .orderBy(desc(loads.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(loads)
      .where(where),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return {
    data,
    meta: { total, page, pages: Math.ceil(total / limit) },
  };
}

export async function getLoadById(db: Database, id: number) {
  const [load] = await db.select().from(loads).where(eq(loads.id, id)).limit(1);
  return load ?? null;
}

/** Editable load fields — these can be corrected before PCS dispatch. */
export interface LoadUpdate {
  driverName?: string | null;
  truckNo?: string | null;
  trailerNo?: string | null;
  carrierName?: string | null;
  weightTons?: string | null;
  netWeightTons?: string | null;
  bolNo?: string | null;
  ticketNo?: string | null;
}

const ALLOWED_FIELDS = new Set<keyof LoadUpdate>([
  "driverName",
  "truckNo",
  "trailerNo",
  "carrierName",
  "weightTons",
  "netWeightTons",
  "bolNo",
  "ticketNo",
]);

export async function updateLoad(
  db: Database,
  id: number,
  updates: LoadUpdate,
) {
  // Only allow known fields
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (ALLOWED_FIELDS.has(key as keyof LoadUpdate)) {
      clean[key] = value;
    }
  }
  if (Object.keys(clean).length === 0) return null;

  clean.updatedAt = new Date();

  const [updated] = await db
    .update(loads)
    .set(clean)
    .where(eq(loads.id, id))
    .returning();

  return updated ?? null;
}
