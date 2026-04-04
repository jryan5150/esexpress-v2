import { eq, and, sql, desc } from "drizzle-orm";
import { loads, assignments, wells } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";
import { ValidationError } from "../../../lib/errors.js";
import { eraFilter } from "../lib/era-filter.js";

export interface LoadFilters {
  source?: "propx" | "logistiq" | "manual";
  status?: string;
  driverName?: string;
  destinationName?: string;
  era?: string;
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
  conditions.push(eraFilter(filters.era));

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
  rate?: string | null;
  mileage?: string | null;
  deliveredOn?: string | null;
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
  "rate",
  "mileage",
  "deliveredOn",
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
      // Convert deliveredOn string to Date for timestamp column
      if (key === "deliveredOn" && typeof value === "string") {
        clean[key] = new Date(value);
      } else {
        clean[key] = value;
      }
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

// ─── LOAD CREATION ─────────────────────────────────────────────────

export interface CreateLoadInput {
  loadNo: string;
  driverName?: string | null;
  truckNo?: string | null;
  trailerNo?: string | null;
  carrierName?: string | null;
  productDescription?: string | null;
  originName?: string | null;
  destinationName?: string | null;
  weightTons?: string | null;
  netWeightTons?: string | null;
  bolNo?: string | null;
  ticketNo?: string | null;
  rate?: string | null;
  mileage?: string | null;
  deliveredOn?: string | null;
  wellId: number;
}

export async function createLoad(
  db: Database,
  input: CreateLoadInput,
  userId: number,
) {
  // Validate well exists before inserting
  const [well] = await db
    .select({ id: wells.id })
    .from(wells)
    .where(eq(wells.id, input.wellId))
    .limit(1);
  if (!well) {
    throw new ValidationError(`Well with id ${input.wellId} not found`);
  }

  return db.transaction(async (tx) => {
    const sourceId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [load] = await tx
      .insert(loads)
      .values({
        source: "manual",
        sourceId,
        loadNo: input.loadNo,
        driverName: input.driverName ?? null,
        truckNo: input.truckNo ?? null,
        trailerNo: input.trailerNo ?? null,
        carrierName: input.carrierName ?? null,
        productDescription: input.productDescription ?? null,
        originName: input.originName ?? null,
        destinationName: input.destinationName ?? null,
        weightTons: input.weightTons ?? null,
        netWeightTons: input.netWeightTons ?? null,
        bolNo: input.bolNo ?? null,
        ticketNo: input.ticketNo ?? null,
        rate: input.rate ?? null,
        mileage: input.mileage ?? null,
        deliveredOn: input.deliveredOn ? new Date(input.deliveredOn) : null,
      })
      .returning();

    const [assignment] = await tx
      .insert(assignments)
      .values({
        wellId: input.wellId,
        loadId: load.id,
        status: "assigned",
        assignedBy: userId,
        statusHistory: [
          {
            status: "assigned",
            changedAt: new Date().toISOString(),
            changedBy: userId,
            notes: "Manual load creation",
          },
        ],
      })
      .returning();

    return { load, assignment };
  });
}

export interface DuplicateLoadInput {
  count: number;
  dateOffset?: number; // days to add to deliveredOn per copy
}

export async function duplicateLoad(
  db: Database,
  sourceLoadId: number,
  input: DuplicateLoadInput,
  userId: number,
) {
  const source = await getLoadById(db, sourceLoadId);
  if (!source) return null;

  // Find the assignment to get the wellId
  const [sourceAssignment] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.loadId, sourceLoadId))
    .limit(1);

  if (!sourceAssignment) return null;

  // All-or-nothing: wrap batch in a transaction
  return db.transaction(async (tx) => {
    const results: Array<{ load: typeof source; assignmentId: number }> = [];

    for (let i = 0; i < input.count; i++) {
      let deliveredOn = source.deliveredOn;
      if (deliveredOn && input.dateOffset) {
        const d = new Date(deliveredOn);
        d.setDate(d.getDate() + input.dateOffset * (i + 1));
        deliveredOn = d;
      }

      const sourceId = `manual-dup-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;

      const [load] = await tx
        .insert(loads)
        .values({
          source: "manual",
          sourceId,
          loadNo: `${source.loadNo}-D${i + 1}`,
          driverName: source.driverName,
          truckNo: source.truckNo,
          trailerNo: source.trailerNo,
          carrierName: source.carrierName,
          productDescription: source.productDescription,
          originName: source.originName,
          destinationName: source.destinationName,
          weightTons: source.weightTons,
          netWeightTons: source.netWeightTons,
          bolNo: null, // Duplicates get fresh BOL/ticket
          ticketNo: null,
          rate: source.rate,
          mileage: source.mileage,
          deliveredOn,
        })
        .returning();

      const [assignment] = await tx
        .insert(assignments)
        .values({
          wellId: sourceAssignment.wellId,
          loadId: load.id,
          status: "assigned",
          assignedBy: userId,
          statusHistory: [
            {
              status: "assigned",
              changedAt: new Date().toISOString(),
              changedBy: userId,
              notes: `Duplicated from load #${source.loadNo}`,
            },
          ],
        })
        .returning();

      results.push({ load, assignmentId: assignment.id });
    }

    return results;
  });
}
