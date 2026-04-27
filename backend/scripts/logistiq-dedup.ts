// One-time Logistiq dedup. Same physical load was ingested 2-4x because
// generateSourceId() falls through to the unstable hash fallback when
// the bol_no field name doesn't match the known list (or another reason
// — see logistiq-sync.service.ts:341 comment).
//
// Strategy:
//   1. Identify dup groups by (source='logistiq', bol_no, driver_name, delivered_on::date)
//   2. Canonical = min(id) per group; dup_ids = the rest
//   3. Re-point every FK that references the dup load_ids to the canonical
//   4. DELETE the dup loads
//   5. Whole thing in ONE transaction
//
// Tables that reference loads.id (audited from schema.ts):
//   - assignments.load_id (NOT NULL)            → re-point
//   - load_comments.load_id (NOT NULL)          → re-point
//   - photos.load_id (nullable)                 → re-point
//   - bol_submissions.matched_load_id (cascade) → re-point (nullable)
//   - ingestion_conflicts.propx_load_id (nullable)   → re-point
//   - ingestion_conflicts.logistiq_load_id (nullable) → re-point
//   - payment_batch_loads.load_id (PK part)     → re-point or skip on conflict
//   - discrepancies.load_id (nullable)          → re-point
//   - sync_runs (cascade)                        → cascades on delete
//
// Run modes:
//   tsx backend/scripts/logistiq-dedup.ts             # DRY-RUN by default
//   tsx backend/scripts/logistiq-dedup.ts --execute   # Actually delete

import postgres from "postgres";

const EXECUTE = process.argv.includes("--execute");

async function main() {
  const url = process.env.DATABASE_URL!;
  if (url.includes("interchange.proxy.rlwy.net"))
    throw new Error("Refusing phantom DB");
  const sql = postgres(url, { prepare: false, max: 1 });

  console.log(`Mode: ${EXECUTE ? "EXECUTE (will modify prod)" : "DRY-RUN"}\n`);

  // ── Step 1 — discover dup groups ──────────────────────────────────
  const dupGroups = (await sql`
    SELECT
      bol_no,
      driver_name,
      delivered_on::date AS day,
      MIN(id) AS canonical_id,
      ARRAY_AGG(id ORDER BY id) AS all_ids,
      COUNT(*)::int AS occurrences
    FROM loads
    WHERE source = 'logistiq'
      AND bol_no IS NOT NULL AND bol_no <> ''
      AND driver_name IS NOT NULL
    GROUP BY bol_no, driver_name, delivered_on::date
    HAVING COUNT(*) > 1
  `) as unknown as Array<{
    bol_no: string;
    driver_name: string;
    day: Date;
    canonical_id: number;
    all_ids: number[];
    occurrences: number;
  }>;

  const totalGroups = dupGroups.length;
  const totalExtras = dupGroups.reduce((a, g) => a + (g.all_ids.length - 1), 0);
  const dupIds = dupGroups.flatMap((g) =>
    g.all_ids.filter((id) => id !== g.canonical_id),
  );

  console.log(
    `Found ${totalGroups} dup groups → ${totalExtras} extra rows to delete`,
  );
  console.log(`Sample 3 groups:`);
  for (const g of dupGroups.slice(0, 3)) {
    console.log(
      `  bol=${g.bol_no} drv=${g.driver_name} day=${g.day.toISOString().slice(0, 10)} canonical=${g.canonical_id} dups=${g.all_ids.filter((i) => i !== g.canonical_id).join(",")}`,
    );
  }

  if (dupIds.length === 0) {
    console.log("\nNo dups. Exiting.");
    await sql.end();
    return;
  }

  // ── Step 2 — count FK rows that need re-pointing ──────────────────
  console.log(`\n=== FK row counts (rows referencing dup load_ids) ===`);
  const fkCounts: Record<string, number> = {};
  for (const t of [
    "assignments",
    "load_comments",
    "photos",
    "bol_submissions",
    "ingestion_conflicts",
    "payment_batch_loads",
    "discrepancies",
  ]) {
    const col =
      t === "bol_submissions"
        ? "matched_load_id"
        : t === "ingestion_conflicts"
          ? "logistiq_load_id"
          : "load_id";
    const r = (await sql.unsafe(
      `SELECT COUNT(*)::int AS n FROM ${t} WHERE ${col} = ANY($1)`,
      [dupIds],
    )) as unknown as Array<{ n: number }>;
    fkCounts[`${t}.${col}`] = r[0]?.n ?? 0;
    console.log(`  ${t}.${col}: ${r[0]?.n ?? 0}`);
  }

  // ── Step 3 — execute (or dry-run summary) ─────────────────────────
  if (!EXECUTE) {
    console.log(`\nDRY-RUN: pass --execute to actually delete.`);
    console.log(
      `Would re-point ${Object.values(fkCounts).reduce((a, b) => a + b, 0)} FK rows and delete ${dupIds.length} load rows.`,
    );
    await sql.end();
    return;
  }

  console.log(`\n=== EXECUTING in transaction ===`);
  await sql.begin(async (tx) => {
    // Build a temp mapping table: dup_id → canonical_id
    await tx.unsafe(`
      CREATE TEMP TABLE dup_to_canonical (dup_id int PRIMARY KEY, canonical_id int NOT NULL)
      ON COMMIT DROP
    `);
    for (const g of dupGroups) {
      const dups = g.all_ids.filter((id) => id !== g.canonical_id);
      if (dups.length === 0) continue;
      await tx.unsafe(
        `INSERT INTO dup_to_canonical (dup_id, canonical_id) SELECT unnest($1::int[]), $2`,
        [dups, g.canonical_id],
      );
    }

    // Re-point each FK table.
    // For tables with a unique constraint that COULD collide on the canonical,
    // we DELETE the dup row instead of UPDATE (assignments has unique
    // (well_id, load_id); payment_batch_loads has (batch_id, load_id) PK).
    console.log(`  re-pointing assignments...`);
    // Drop FK rows that would collide; keep one per (well_id, canonical_id).
    await tx.unsafe(`
      DELETE FROM assignments a
      USING dup_to_canonical d
      WHERE a.load_id = d.dup_id
        AND EXISTS (
          SELECT 1 FROM assignments a2
          WHERE a2.load_id = d.canonical_id
            AND a2.well_id = a.well_id
        )
    `);
    const aRes = await tx.unsafe(`
      UPDATE assignments SET load_id = d.canonical_id
      FROM dup_to_canonical d WHERE assignments.load_id = d.dup_id
    `);
    console.log(`    updated ${aRes.count} assignments`);

    console.log(`  re-pointing load_comments...`);
    const lcRes = await tx.unsafe(`
      UPDATE load_comments SET load_id = d.canonical_id
      FROM dup_to_canonical d WHERE load_comments.load_id = d.dup_id
    `);
    console.log(`    updated ${lcRes.count} load_comments`);

    console.log(`  re-pointing photos...`);
    const pRes = await tx.unsafe(`
      UPDATE photos SET load_id = d.canonical_id
      FROM dup_to_canonical d WHERE photos.load_id = d.dup_id
    `);
    console.log(`    updated ${pRes.count} photos`);

    console.log(`  re-pointing bol_submissions.matched_load_id...`);
    const bRes = await tx.unsafe(`
      UPDATE bol_submissions SET matched_load_id = d.canonical_id
      FROM dup_to_canonical d WHERE bol_submissions.matched_load_id = d.dup_id
    `);
    console.log(`    updated ${bRes.count} bol_submissions`);

    console.log(`  re-pointing ingestion_conflicts.logistiq_load_id...`);
    const icRes = await tx.unsafe(`
      UPDATE ingestion_conflicts SET logistiq_load_id = d.canonical_id
      FROM dup_to_canonical d WHERE ingestion_conflicts.logistiq_load_id = d.dup_id
    `);
    console.log(`    updated ${icRes.count} ingestion_conflicts`);

    console.log(`  re-pointing payment_batch_loads...`);
    // PK is (batch_id, load_id) — collide-safe via DELETE-then-UPDATE
    await tx.unsafe(`
      DELETE FROM payment_batch_loads pbl
      USING dup_to_canonical d
      WHERE pbl.load_id = d.dup_id
        AND EXISTS (
          SELECT 1 FROM payment_batch_loads pbl2
          WHERE pbl2.load_id = d.canonical_id
            AND pbl2.batch_id = pbl.batch_id
        )
    `);
    const pblRes = await tx.unsafe(`
      UPDATE payment_batch_loads SET load_id = d.canonical_id
      FROM dup_to_canonical d WHERE payment_batch_loads.load_id = d.dup_id
    `);
    console.log(`    updated ${pblRes.count} payment_batch_loads`);

    console.log(`  re-pointing discrepancies.load_id...`);
    const dRes = await tx.unsafe(`
      UPDATE discrepancies SET load_id = d.canonical_id
      FROM dup_to_canonical d WHERE discrepancies.load_id = d.dup_id
    `);
    console.log(`    updated ${dRes.count} discrepancies`);

    // Finally — delete the dup loads
    console.log(`\n  deleting ${dupIds.length} dup load rows...`);
    const delRes = await tx.unsafe(
      `DELETE FROM loads WHERE id = ANY($1::int[])`,
      [dupIds],
    );
    console.log(`    deleted ${delRes.count} loads`);
  });

  console.log(`\n✓ Transaction committed.`);

  // Verify
  const after = (await sql`
    SELECT COUNT(*)::int AS n
    FROM (
      SELECT bol_no, driver_name, delivered_on::date
      FROM loads
      WHERE source = 'logistiq'
        AND bol_no IS NOT NULL AND bol_no <> ''
        AND driver_name IS NOT NULL
      GROUP BY bol_no, driver_name, delivered_on::date
      HAVING COUNT(*) > 1
    ) x`) as unknown as Array<{ n: number }>;
  console.log(`Remaining dup groups after: ${after[0].n}`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
