import { eq } from "drizzle-orm";
import { carriers } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";

/**
 * Carriers are the trucking companies we coordinate dispatch for
 * (Liberty / Logistiq / JRT at launch). The `phase` column drives the
 * Phase 1 / Phase 2 validation-rollout dial:
 *   - phase1: Jessica validates all loads for this carrier
 *   - phase2: the builder (Scout / Steph / Keli) self-validates inline
 * This module is read-write by design; tonight's scope is wiring the
 * data model + listing. The per-carrier phase flip UX is a follow-up.
 */

export interface CarrierRow {
  id: number;
  name: string;
  phase: "phase1" | "phase2";
  active: boolean;
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface UpdateCarrierInput {
  name?: string;
  phase?: "phase1" | "phase2";
  active?: boolean;
  notes?: string | null;
}

export async function listCarriers(db: Database): Promise<CarrierRow[]> {
  const rows = await db.select().from(carriers).orderBy(carriers.name);
  return rows as CarrierRow[];
}

export async function getCarrierById(
  db: Database,
  id: number,
): Promise<CarrierRow | null> {
  const [row] = await db
    .select()
    .from(carriers)
    .where(eq(carriers.id, id))
    .limit(1);
  return (row as CarrierRow | undefined) ?? null;
}

export async function updateCarrier(
  db: Database,
  id: number,
  input: UpdateCarrierInput,
): Promise<CarrierRow | null> {
  const [row] = await db
    .update(carriers)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(carriers.id, id))
    .returning();
  return (row as CarrierRow | undefined) ?? null;
}
