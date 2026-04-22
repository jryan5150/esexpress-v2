/**
 * Apr-20 mass-clear targeted revert.
 *
 * On 2026-04-20 at 13:01 UTC (28,108 rows) and 18:32 UTC (540 rows), something
 * set assignments.handler_stage = 'cleared' for a massive batch of rows.
 * Migration 0011's legitimate backfill only clears rows where
 *   status IN ('completed','cancelled','failed')
 * but the Apr-20 clear affected 28,355 rows with status='pending' — still
 * active. Whatever ran was broader than the documented migration.
 *
 * This script reverts the WRONGLY-cleared subset. Scope:
 *   - stage_changed_at in the two clearing windows
 *   - handler_stage = 'cleared' (still cleared — we don't touch already-corrected rows)
 *   - status NOT IN ('completed','cancelled','failed') (the never-legit-to-clear set)
 *
 * Target stage per migration 0011's original rules:
 *   - photo_status != 'missing' AND auto_map_tier = 1 AND status = 'pending' → 'ready_to_build'
 *   - otherwise → 'uncertain'
 *
 * Each reverted row gets a statusHistory entry attributing the revert to a
 * "system backfill correction" so the drawer's audit trail shows what happened.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/revert-apr20-mass-clear.ts [--dry-run]
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql, and, eq, inArray } from "drizzle-orm";
import { assignments, dataIntegrityRuns } from "../src/db/schema.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

const pg = postgres(DATABASE_URL, { prepare: false });
// biome-ignore lint/suspicious/noExplicitAny: drizzle type
const db = drizzle(pg) as any;

const WINDOW_13_START = "2026-04-20 13:00:00+00";
const WINDOW_13_END = "2026-04-20 13:05:00+00";
const WINDOW_18_START = "2026-04-20 18:30:00+00";
const WINDOW_18_END = "2026-04-20 18:35:00+00";

async function main() {
  console.log(`Apr-20 mass-clear revert starting — dryRun=${DRY_RUN}`);

  // Scope query: affected rows
  const affected = await db.execute(sql`
    SELECT
      id, status, photo_status, auto_map_tier, stage_changed_at
    FROM assignments
    WHERE (
      (stage_changed_at >= ${WINDOW_13_START} AND stage_changed_at < ${WINDOW_13_END})
      OR
      (stage_changed_at >= ${WINDOW_18_START} AND stage_changed_at < ${WINDOW_18_END})
    )
      AND handler_stage = 'cleared'
      AND status NOT IN ('completed', 'cancelled', 'failed')
    ORDER BY id
  `);

  console.log(`Affected rows (to be reverted): ${affected.length}`);

  // Bucket by target stage
  const toReadyToBuild: number[] = [];
  const toUncertain: number[] = [];

  for (const r of affected as Array<{
    id: number;
    status: string;
    photo_status: string | null;
    auto_map_tier: number | null;
  }>) {
    if (
      r.photo_status !== "missing" &&
      r.auto_map_tier === 1 &&
      r.status === "pending"
    ) {
      toReadyToBuild.push(r.id);
    } else {
      toUncertain.push(r.id);
    }
  }

  console.log(`  → ready_to_build: ${toReadyToBuild.length}`);
  console.log(`  → uncertain:      ${toUncertain.length}`);

  if (DRY_RUN) {
    console.log("\nDry-run — no writes. Sample IDs:");
    console.log("  ready_to_build sample:", toReadyToBuild.slice(0, 5));
    console.log("  uncertain sample:     ", toUncertain.slice(0, 5));
    await pg.end();
    return;
  }

  // Log the run start
  const [runEntry] = await db
    .insert(dataIntegrityRuns)
    .values({
      scriptName: "revert-apr20-mass-clear",
      ranBy: "jace",
      rowCountBefore: affected.length,
      dryRun: false,
      status: "running",
      metadata: {
        windows: [
          { start: WINDOW_13_START, end: WINDOW_13_END },
          { start: WINDOW_18_START, end: WINDOW_18_END },
        ],
        breakdown: {
          toReadyToBuild: toReadyToBuild.length,
          toUncertain: toUncertain.length,
        },
      },
    })
    .returning({ id: dataIntegrityRuns.id });
  const runId = runEntry.id;
  console.log(`data_integrity_runs id=${runId} — running`);

  const now = new Date();
  const historyEntry = {
    status: "stage:revert",
    changedAt: now.toISOString(),
    changedBy: null,
    changedByName: "System Backfill Correction",
    notes:
      "Apr-20 mass-clear revert — originally cleared by batch-update, returning to legitimate stage per migration 0011 rules.",
  };

  let revertedCount = 0;
  const CHUNK = 1000;

  async function applyRevert(ids: number[], targetStage: string) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      await db
        .update(assignments)
        .set({
          handlerStage: targetStage,
          stageChangedAt: now,
          statusHistory: sql`coalesce(${assignments.statusHistory}, '[]'::jsonb) || ${JSON.stringify([{ ...historyEntry, notes: `${historyEntry.notes} Reverted to '${targetStage}'.` }])}::jsonb`,
          updatedAt: now,
        })
        .where(inArray(assignments.id, chunk));
      revertedCount += chunk.length;
      console.log(`  applied ${revertedCount}/${affected.length}…`);
    }
  }

  await applyRevert(toReadyToBuild, "ready_to_build");
  await applyRevert(toUncertain, "uncertain");

  // Verify
  const [{ stillCleared }] = await db.execute(sql`
    SELECT COUNT(*)::int AS "stillCleared"
    FROM assignments
    WHERE (
      (stage_changed_at >= ${WINDOW_13_START} AND stage_changed_at < ${WINDOW_13_END})
      OR
      (stage_changed_at >= ${WINDOW_18_START} AND stage_changed_at < ${WINDOW_18_END})
    )
      AND handler_stage = 'cleared'
      AND status NOT IN ('completed', 'cancelled', 'failed')
  `);

  console.log(
    `\nDONE. reverted=${revertedCount}  stillCleared(should be 0)=${stillCleared}`,
  );

  await db
    .update(dataIntegrityRuns)
    .set({
      completedAt: new Date(),
      rowCountAfter: affected.length - revertedCount,
      status: "completed",
      notes: `reverted=${revertedCount} toReadyToBuild=${toReadyToBuild.length} toUncertain=${toUncertain.length} residual=${stillCleared}`,
    })
    .where(eq(dataIntegrityRuns.id, runId));
}

try {
  await main();
} catch (err) {
  console.error("Revert failed:", err instanceof Error ? err.stack : err);
  process.exitCode = 1;
} finally {
  await pg.end();
}
