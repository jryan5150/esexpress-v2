import { eq } from 'drizzle-orm';
import { wells } from '../../../db/schema.js';
import type { Database } from '../../../db/client.js';

export interface CreateWellInput {
  name: string;
  aliases?: string[];
  status?: 'active' | 'standby' | 'completed' | 'closed';
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
  status?: 'active' | 'standby' | 'completed' | 'closed';
  dailyTargetLoads?: number;
  dailyTargetTons?: string;
  latitude?: string;
  longitude?: string;
  propxJobId?: string;
  propxDestinationId?: string;
}

export async function listWells(db: Database, filters?: { status?: string }) {
  if (filters?.status) {
    return db.select().from(wells).where(eq(wells.status, filters.status)).orderBy(wells.name);
  }
  return db.select().from(wells).orderBy(wells.name);
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
      status: input.status ?? 'active',
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

export async function updateWell(db: Database, id: number, input: UpdateWellInput) {
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
