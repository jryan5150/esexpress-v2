/**
 * Deterministic re-run on bol_submissions with ai_extracted_data.
 *
 * After the broad auto-mapper backfill finishes, this script re-matches
 * every bol_submission that has AI-extracted data but no matched_load_id.
 * Picks up loads that were previously unmatched under the old rule set
 * but now match under the current one (post Phase 5/6 work).
 *
 * Queue this to run sequentially AFTER the broad automap backfill —
 * simultaneous runs compete for DB connections via public proxy.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/rerun-deterministic-bol-match.ts
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, isNull, isNotNull, eq, sql } from "drizzle-orm";
import { bolSubmissions, dataIntegrityRuns } from "../src/db/schema.js";
import { batchAutoMatch } from "../src/plugins/verification/services/reconciliation.service.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const BATCH_SIZE = 100;
const pg = postgres(DATABASE_URL, { prepare: false });
// biome-ignore lint/suspicious/noExplicitAny: drizzle type
const db = drizzle(pg) as any;

async function main() {
  console.log(`Deterministic BOL re-match starting — batch=${BATCH_SIZE}`);

  const [{ count: before }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(bolSubmissions)
    .where(
      and(
        isNull(bolSubmissions.matchedLoadId),
        isNotNull(bolSubmissions.aiExtractedData),
      ),
    );
  console.log(`Unmatched submissions with AI data: ${before}`);

  const [run] = await db
    .insert(dataIntegrityRuns)
    .values({
      scriptName: "rerun-deterministic-bol-match",
      ranBy: "jace",
      rowCountBefore: before,
      dryRun: false,
      status: "running",
    })
    .returning({ id: dataIntegrityRuns.id });

  let totalProcessed = 0;
  let totalMatched = 0;
  const start = Date.now();

  while (true) {
    const batch = await db
      .select({ id: bolSubmissions.id })
      .from(bolSubmissions)
      .where(
        and(
          isNull(bolSubmissions.matchedLoadId),
          isNotNull(bolSubmissions.aiExtractedData),
        ),
      )
      .orderBy(bolSubmissions.id)
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    const ids = batch.map((r: { id: number }) => r.id);
    const result = await batchAutoMatch(db, ids);
    totalProcessed += result.total;
    totalMatched += result.matched;

    if (totalProcessed % 500 < BATCH_SIZE) {
      console.log(
        `processed=${totalProcessed} matched=${totalMatched} (${Math.floor((Date.now() - start) / 1000)}s)`,
      );
    }

    // If this batch produced zero matches and zero un-matches (everything erroring), bail
    if (result.matched === 0 && result.unmatched === batch.length) {
      // Still processed them; loop continues until no rows remain
    }
  }

  const elapsed = Math.floor((Date.now() - start) / 1000);

  const [{ count: after }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(bolSubmissions)
    .where(
      and(
        isNull(bolSubmissions.matchedLoadId),
        isNotNull(bolSubmissions.aiExtractedData),
      ),
    );

  console.log(
    `\nDONE in ${elapsed}s. processed=${totalProcessed} matched=${totalMatched}`,
  );
  console.log(`unmatched before: ${before}  after: ${after}`);

  await db
    .update(dataIntegrityRuns)
    .set({
      completedAt: new Date(),
      rowCountAfter: after,
      status: "completed",
      notes: `processed=${totalProcessed} matched=${totalMatched} elapsed=${elapsed}s`,
    })
    .where(eq(dataIntegrityRuns.id, run.id));
}

try {
  await main();
} catch (err) {
  console.error("Re-run failed:", err instanceof Error ? err.stack : err);
  process.exitCode = 1;
} finally {
  await pg.end();
}
