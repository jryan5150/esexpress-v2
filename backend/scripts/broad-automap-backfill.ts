/**
 * Broad auto-mapper backfill — resolves orphan loads across full history.
 *
 * Background: auto-mapper's default scheduled run uses fromDate=30 days ago.
 * Any load that didn't get matched in its first 30 days stays orphan forever
 * even after wells are added. This script runs against the full corpus
 * (fromDate=2026-01-01) so historical orphans that NOW have matching wells
 * get their Tier 1 assignments.
 *
 * Expected impact: ~20K loads resolved (full-match orphans). The ~1.5K true-
 * alias-needed orphans stay until Jessica corroborates the 9-destination list
 * in her reply email.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/broad-automap-backfill.ts [fromDate]
 *
 * Default fromDate: 2026-01-01
 *
 * Logs progress + writes a data_integrity_runs row for the operation.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import {
  loads,
  assignments,
  users,
  dataIntegrityRuns,
} from "../src/db/schema.js";
import { processLoadBatch } from "../src/plugins/dispatch/services/auto-mapper.service.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const fromDateStr = process.argv[2] ?? "2026-01-01";
const fromDate = new Date(`${fromDateStr}T00:00:00-05:00`);
const BATCH_SIZE = 500;

const pg = postgres(DATABASE_URL, { prepare: false });
// biome-ignore lint/suspicious/noExplicitAny: drizzle type
const db = drizzle(pg) as any;

async function main() {
  console.log(
    `Broad auto-mapper backfill starting — fromDate=${fromDateStr}, batch=${BATCH_SIZE}`,
  );

  // Use the system user (auto-mapper's usual actor) — pick the first admin
  const [sysUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);
  if (!sysUser) {
    console.error("No admin user found — cannot attribute auto-mapper runs");
    process.exit(1);
  }
  const systemUserId = sysUser.id;

  // Count orphans first (row_count_before)
  const [{ orphansBefore }] = await db
    .select({ orphansBefore: sql<number>`cast(count(*) as int)` })
    .from(loads)
    .leftJoin(assignments, eq(loads.id, assignments.loadId))
    .where(and(isNull(assignments.id), gte(loads.createdAt, fromDate)));

  console.log(`Orphan loads before run: ${orphansBefore}`);

  // Log the run start
  const [runEntry] = await db
    .insert(dataIntegrityRuns)
    .values({
      scriptName: "broad-automap-backfill",
      ranBy: "jace",
      rowCountBefore: orphansBefore,
      dryRun: false,
      status: "running",
      metadata: { fromDate: fromDateStr, batchSize: BATCH_SIZE },
    })
    .returning({ id: dataIntegrityRuns.id });
  const runId = runEntry.id;
  console.log(`data_integrity_runs id=${runId} — running`);

  let totalProcessed = 0;
  let totalTier1 = 0;
  let totalTier2 = 0;
  let totalTier3 = 0;
  let totalAssignmentsCreated = 0;
  let totalErrors = 0;
  let lastBatchFirstId = -1;
  const start = Date.now();

  while (true) {
    const batch = await db
      .select({ id: loads.id })
      .from(loads)
      .leftJoin(assignments, eq(loads.id, assignments.loadId))
      .where(and(isNull(assignments.id), gte(loads.createdAt, fromDate)))
      .orderBy(loads.id)
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    // Loop guard — same ID twice means we're stuck on Tier 3 with no assignments created
    if (batch[0].id === lastBatchFirstId) {
      // Advance past the stuck batch
      const skipped = await db
        .select({ id: loads.id })
        .from(loads)
        .leftJoin(assignments, eq(loads.id, assignments.loadId))
        .where(and(isNull(assignments.id), gte(loads.createdAt, fromDate)))
        .orderBy(loads.id)
        .limit(BATCH_SIZE)
        .offset(BATCH_SIZE);
      if (skipped.length === 0) break;
      const skipIds = skipped.map((r: { id: number }) => r.id);
      const skipResults = await processLoadBatch(db, skipIds, systemUserId);
      for (const r of skipResults) {
        totalProcessed++;
        if (r.tier === 1) totalTier1++;
        else if (r.tier === 2) totalTier2++;
        else totalTier3++;
        if (r.assignmentId) totalAssignmentsCreated++;
        if (r.error) totalErrors++;
      }
      lastBatchFirstId = -1;
      if (totalProcessed % 1000 < BATCH_SIZE) {
        console.log(
          `processed=${totalProcessed} tier1=${totalTier1} tier2=${totalTier2} tier3=${totalTier3} created=${totalAssignmentsCreated} errors=${totalErrors}`,
        );
      }
      continue;
    }

    lastBatchFirstId = batch[0].id;
    const loadIds = batch.map((r: { id: number }) => r.id);
    const results = await processLoadBatch(db, loadIds, systemUserId);

    for (const r of results) {
      totalProcessed++;
      if (r.tier === 1) totalTier1++;
      else if (r.tier === 2) totalTier2++;
      else totalTier3++;
      if (r.assignmentId) totalAssignmentsCreated++;
      if (r.error) totalErrors++;
    }

    if (totalProcessed % 1000 < BATCH_SIZE) {
      console.log(
        `processed=${totalProcessed} tier1=${totalTier1} tier2=${totalTier2} tier3=${totalTier3} created=${totalAssignmentsCreated} errors=${totalErrors} (${Math.floor((Date.now() - start) / 1000)}s)`,
      );
    }

    // Reset guard if this batch produced assignments
    const created = results.filter(
      (r: { assignmentId: number | null }) => r.assignmentId,
    ).length;
    if (created > 0) lastBatchFirstId = -1;
  }

  const elapsed = Math.floor((Date.now() - start) / 1000);

  // Count orphans after
  const [{ orphansAfter }] = await db
    .select({ orphansAfter: sql<number>`cast(count(*) as int)` })
    .from(loads)
    .leftJoin(assignments, eq(loads.id, assignments.loadId))
    .where(and(isNull(assignments.id), gte(loads.createdAt, fromDate)));

  console.log(`\nDONE in ${elapsed}s`);
  console.log(
    `processed=${totalProcessed}  tier1=${totalTier1}  tier2=${totalTier2}  tier3=${totalTier3}`,
  );
  console.log(`assignments created: ${totalAssignmentsCreated}`);
  console.log(`errors: ${totalErrors}`);
  console.log(`orphans before: ${orphansBefore}  after: ${orphansAfter}`);

  await db
    .update(dataIntegrityRuns)
    .set({
      completedAt: new Date(),
      rowCountAfter: orphansAfter,
      status: "completed",
      notes: `processed=${totalProcessed} created=${totalAssignmentsCreated} tier1=${totalTier1} tier2=${totalTier2} tier3=${totalTier3} errors=${totalErrors} elapsed=${elapsed}s`,
    })
    .where(eq(dataIntegrityRuns.id, runId));
}

try {
  await main();
} catch (err) {
  console.error("Backfill failed:", err instanceof Error ? err.stack : err);
  process.exitCode = 1;
} finally {
  await pg.end();
}
