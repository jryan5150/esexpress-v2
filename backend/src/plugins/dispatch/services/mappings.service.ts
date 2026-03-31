import { eq } from 'drizzle-orm';
import {
  locationMappings,
  customerMappings,
  productMappings,
  driverCrossrefs,
} from '../../../db/schema.js';
import type { Database } from '../../../db/client.js';

export async function getLocationMappingByName(db: Database, sourceName: string) {
  const [mapping] = await db
    .select()
    .from(locationMappings)
    .where(eq(locationMappings.sourceName, sourceName))
    .limit(1);
  return mapping ?? null;
}

export async function createLocationMapping(
  db: Database,
  input: { sourceName: string; wellId: number; confidence: string; confirmed?: boolean },
) {
  const [mapping] = await db
    .insert(locationMappings)
    .values({
      sourceName: input.sourceName,
      wellId: input.wellId,
      confidence: input.confidence,
      confirmed: input.confirmed ?? false,
    })
    .onConflictDoUpdate({
      target: locationMappings.sourceName,
      set: {
        wellId: input.wellId,
        confidence: input.confidence,
        confirmed: input.confirmed ?? false,
      },
    })
    .returning();
  return mapping;
}

export async function createCustomerMapping(
  db: Database,
  input: { sourceName: string; canonicalName: string; confirmed?: boolean },
) {
  const [mapping] = await db
    .insert(customerMappings)
    .values({
      sourceName: input.sourceName,
      canonicalName: input.canonicalName,
      confirmed: input.confirmed ?? false,
    })
    .onConflictDoUpdate({
      target: customerMappings.sourceName,
      set: {
        canonicalName: input.canonicalName,
        confirmed: input.confirmed ?? false,
      },
    })
    .returning();
  return mapping;
}

export async function createProductMapping(
  db: Database,
  input: { sourceName: string; canonicalName: string; confirmed?: boolean },
) {
  const [mapping] = await db
    .insert(productMappings)
    .values({
      sourceName: input.sourceName,
      canonicalName: input.canonicalName,
      confirmed: input.confirmed ?? false,
    })
    .onConflictDoUpdate({
      target: productMappings.sourceName,
      set: {
        canonicalName: input.canonicalName,
        confirmed: input.confirmed ?? false,
      },
    })
    .returning();
  return mapping;
}

export async function createDriverCrossref(
  db: Database,
  input: { sourceName: string; canonicalName: string; confirmed?: boolean },
) {
  const [mapping] = await db
    .insert(driverCrossrefs)
    .values({
      sourceName: input.sourceName,
      canonicalName: input.canonicalName,
      confirmed: input.confirmed ?? false,
    })
    .onConflictDoUpdate({
      target: driverCrossrefs.sourceName,
      set: {
        canonicalName: input.canonicalName,
        confirmed: input.confirmed ?? false,
      },
    })
    .returning();
  return mapping;
}
