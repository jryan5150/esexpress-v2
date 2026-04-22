/**
 * Apply Jessica's 2026-04-22 wells-ask reply.
 *
 * Jessica confirmed 7 canonical well names. Cross-walk found 2 patterns
 * silently mis-matched to wrong wells (1,304 assignments) and 5 patterns
 * fully orphan (774 loads without assignments). This script:
 *   1. Adds 7 new wells with destination aliases so future ingests match.
 *   2. Reassigns the mis-matched assignment rows to the correct new well,
 *      appending a statusHistory entry attributing the correction.
 *   3. Runs processLoadBatch against the 774 orphan loads so they create
 *      Tier-1 assignments against the new wells.
 *   4. Logs the full operation in data_integrity_runs.
 *
 * Source: jessica reply 2026-04-22 (wells list with load counts + dates).
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/apply-jessica-wells-2026-04-22.ts [--dry-run]
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  assignments,
  dataIntegrityRuns,
  loads,
  users,
  wells,
} from "../src/db/schema.js";
import { processLoadBatch } from "../src/plugins/dispatch/services/auto-mapper.service.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

const pg = postgres(DATABASE_URL, { prepare: false });
// biome-ignore lint/suspicious/noExplicitAny: drizzle type
const db = drizzle(pg) as any;

// 7 new wells per Jessica's 2026-04-22 reply. `aliases` are the exact
// destination_name strings we see from PropX/Logistiq today — covers every
// current orphan. The first entry of `aliases` is the primary one the
// mis-matched loads carry, which we use for the reassignment UPDATE below.
const NEW_WELLS: Array<{
  name: string;
  aliases: string[];
  orphanDestinations: string[]; // for the orphan re-match
  misMatchedFromWell?: string; // name of the existing well mis-holding these
  misMatchedFromDestination?: string; // destination_name of the mis-matched loads
}> = [
  {
    name: "Liberty Apache Formentera Wrangler",
    aliases: ["Apache-Formentera-Wrangler"],
    orphanDestinations: [],
    misMatchedFromWell: "Renegade-Formentera-Pendleton",
    misMatchedFromDestination: "Apache-Formentera-Wrangler",
  },
  {
    name: "Liberty Spectre Crescent Briscoe Cochina",
    aliases: ["Spectre-Crescent-SIMUL Briscoe Cochina"],
    orphanDestinations: [],
    misMatchedFromWell: "Spectre-Crescent-SIMUL Diamond H",
    misMatchedFromDestination: "Spectre-Crescent-SIMUL Briscoe Cochina",
  },
  {
    name: "Liberty HV Nighthawk Rose City Bledsoe",
    aliases: ["Bledsoe"],
    orphanDestinations: ["Bledsoe"],
  },
  {
    name: "Liberty Titan DNR Chili 117X",
    aliases: ["DNR - Chili 117X"],
    orphanDestinations: ["DNR - Chili 117X"],
  },
  {
    name: "Liberty HV Cobra Apex ASJ HC East",
    aliases: ["ASJ 4&16-11-11 HC East"],
    orphanDestinations: ["ASJ 4&16-11-11 HC East"],
  },
  {
    name: "Logistix Comstock Dixon 6HU",
    aliases: ["Comstock Dixon 6HU 1-Alt/2-Alt/Dixon 6-1HU 1-Alt"],
    orphanDestinations: ["Comstock Dixon 6HU 1-Alt/2-Alt/Dixon 6-1HU 1-Alt"],
  },
  {
    name: "Liberty Browning TGNRG07A Ireland Williams",
    aliases: ["G07A IRELAND WILLIAMS 1HH 2HH 3HH"],
    orphanDestinations: ["G07A IRELAND WILLIAMS 1HH 2HH 3HH"],
  },
];

async function main() {
  console.log(
    `Applying Jessica 2026-04-22 wells — dryRun=${DRY_RUN}, count=${NEW_WELLS.length}`,
  );

  // 1. Identify wells already present (avoid dup on re-run)
  const existing = await db
    .select({ id: wells.id, name: wells.name })
    .from(wells)
    .where(
      inArray(
        wells.name,
        NEW_WELLS.map((w) => w.name),
      ),
    );
  const existingMap = new Map<string, number>(
    existing.map((r: { id: number; name: string }) => [r.name, r.id]),
  );
  console.log(`  existing: ${existing.length} / ${NEW_WELLS.length}`);

  const [sysUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);
  if (!sysUser) {
    throw new Error("No admin user found for attribution");
  }
  const systemUserId = sysUser.id;

  // Tally totals for reporting
  let wellsInserted = 0;
  let misMatchedReassigned = 0;
  let orphansMatched = 0;
  let orphansUnmatched = 0;

  // Start run entry
  let runId: number | null = null;
  if (!DRY_RUN) {
    const [entry] = await db
      .insert(dataIntegrityRuns)
      .values({
        scriptName: "apply-jessica-wells-2026-04-22",
        ranBy: "jace",
        rowCountBefore: 0,
        dryRun: false,
        status: "running",
        metadata: { wellsCount: NEW_WELLS.length },
      })
      .returning({ id: dataIntegrityRuns.id });
    runId = entry.id;
    console.log(`data_integrity_runs id=${runId}`);
  }

  const now = new Date();

  for (const wellSpec of NEW_WELLS) {
    console.log(`\n--- ${wellSpec.name}`);
    let wellId = existingMap.get(wellSpec.name);

    // 2. INSERT new well if absent
    if (wellId == null) {
      if (DRY_RUN) {
        console.log(
          `  would INSERT well, aliases=${JSON.stringify(wellSpec.aliases)}`,
        );
      } else {
        const [inserted] = await db
          .insert(wells)
          .values({
            name: wellSpec.name,
            aliases: wellSpec.aliases,
            // normalizedName intentionally NULL — populated by existing
            // normalize trigger / code path on first match
          })
          .returning({ id: wells.id });
        wellId = inserted.id;
        wellsInserted++;
        console.log(`  INSERTED well id=${wellId}`);
      }
    } else {
      console.log(`  well already exists id=${wellId}, skipping INSERT`);
    }

    // 3. Reassign mis-matched assignments (query even in dry-run for preview)
    if (wellSpec.misMatchedFromWell && wellSpec.misMatchedFromDestination) {
      const [oldWell] = await db
        .select({ id: wells.id })
        .from(wells)
        .where(eq(wells.name, wellSpec.misMatchedFromWell))
        .limit(1);
      if (!oldWell) {
        console.log(
          `  [warn] old well "${wellSpec.misMatchedFromWell}" not found, skip reassign`,
        );
      } else {
        const misMatched = await db
          .select({ id: assignments.id, loadId: assignments.loadId })
          .from(assignments)
          .innerJoin(loads, eq(assignments.loadId, loads.id))
          .where(
            and(
              eq(assignments.wellId, oldWell.id),
              eq(loads.destinationName, wellSpec.misMatchedFromDestination),
            ),
          );
        console.log(
          `  mis-matched assignments found: ${misMatched.length} (from "${wellSpec.misMatchedFromWell}")`,
        );

        if (!DRY_RUN && misMatched.length > 0 && wellId != null) {
          const historyEntry = {
            status: "well_reassignment",
            changedAt: now.toISOString(),
            changedBy: null,
            changedByName: "System Backfill Correction",
            notes: `Reassigned well from "${wellSpec.misMatchedFromWell}" to "${wellSpec.name}" per Jessica 2026-04-22 wells-ask reply.`,
          };
          const ids = misMatched.map((r: { id: number }) => r.id);
          const CHUNK = 500;
          for (let i = 0; i < ids.length; i += CHUNK) {
            const slice = ids.slice(i, i + CHUNK);
            await db
              .update(assignments)
              .set({
                wellId,
                statusHistory: sql`coalesce(${assignments.statusHistory}, '[]'::jsonb) || ${JSON.stringify([historyEntry])}::jsonb`,
                updatedAt: now,
              })
              .where(inArray(assignments.id, slice));
          }
          misMatchedReassigned += ids.length;
        }
      }
    }

    // 4. Auto-mapper run on orphan loads for this destination (preview in dry-run)
    if (wellSpec.orphanDestinations.length > 0) {
      const orphanLoads = await db
        .select({ id: loads.id })
        .from(loads)
        .leftJoin(assignments, eq(loads.id, assignments.loadId))
        .where(
          and(
            isNull(assignments.id),
            inArray(loads.destinationName, wellSpec.orphanDestinations),
          ),
        );
      console.log(`  orphan loads for this well: ${orphanLoads.length}`);

      if (!DRY_RUN && orphanLoads.length > 0) {
        const ids = orphanLoads.map((r: { id: number }) => r.id);
        const CHUNK = 500;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const slice = ids.slice(i, i + CHUNK);
          const results = await processLoadBatch(db, slice, systemUserId);
          for (const r of results as Array<{
            assignmentId: number | null;
            tier: number;
          }>) {
            if (r.assignmentId) orphansMatched++;
            else orphansUnmatched++;
          }
        }
      }
    }
  }

  console.log(`\n====================`);
  console.log(`wells inserted:         ${wellsInserted}`);
  console.log(`mis-matched reassigned: ${misMatchedReassigned}`);
  console.log(`orphans matched:        ${orphansMatched}`);
  console.log(`orphans unmatched:      ${orphansUnmatched}`);

  if (!DRY_RUN && runId != null) {
    await db
      .update(dataIntegrityRuns)
      .set({
        completedAt: new Date(),
        rowCountAfter: misMatchedReassigned + orphansMatched,
        status: "completed",
        notes: `wells_inserted=${wellsInserted} reassigned=${misMatchedReassigned} orphans_matched=${orphansMatched} orphans_unmatched=${orphansUnmatched}`,
      })
      .where(eq(dataIntegrityRuns.id, runId));
  }
}

try {
  await main();
} catch (err) {
  console.error("Apply failed:", err instanceof Error ? err.stack : err);
  process.exitCode = 1;
} finally {
  await pg.end();
}
