// Why does v2 over-count vs the sheet by 369-668 loads in recent weeks?
// Test 4 hypotheses:
//   1. Same load ingested by both PropX + Logistiq (paired duplicates)
//   2. Same load_no appearing twice in v2 (pure duplicate rows)
//   3. Logistiq backfill from 4/22 sync-resume created copies
//   4. Sheet excludes categories v2 counts (truck_pusher, equipment_move...)
// Focus on week of 2026-04-19 (sheet=1287, v2=1955, +668 over).

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const wk = "2026-04-19";
  const wkEnd = "2026-04-26";

  const totalRow = await sql`
    SELECT COUNT(*)::int AS n FROM loads
    WHERE delivered_on >= ${wk}::date AND delivered_on < ${wkEnd}::date`;
  console.log(`v2 total for ${wk}–${wkEnd}: ${totalRow[0].n}`);

  console.log(
    "\n=== H1: paired duplicates (same load on both PropX & Logistiq) ===",
  );
  // A "pair" = two load rows with same load_no but different sources.
  const pairs = await sql`
    SELECT COUNT(DISTINCT load_no)::int AS dup_load_nos
    FROM (
      SELECT load_no
      FROM loads
      WHERE delivered_on >= ${wk}::date AND delivered_on < ${wkEnd}::date
        AND load_no IS NOT NULL AND load_no <> ''
      GROUP BY load_no
      HAVING COUNT(DISTINCT source) > 1
    ) x`;
  console.log(
    `  load_nos appearing in BOTH propx and logistiq: ${pairs[0].dup_load_nos}`,
  );

  console.log("\n=== H2: pure duplicate rows (same load_no twice) ===");
  const dupes = await sql`
    SELECT COUNT(*)::int AS dup_count, SUM(extras)::int AS extra_rows
    FROM (
      SELECT load_no, COUNT(*) - 1 AS extras
      FROM loads
      WHERE delivered_on >= ${wk}::date AND delivered_on < ${wkEnd}::date
        AND load_no IS NOT NULL AND load_no <> ''
      GROUP BY load_no
      HAVING COUNT(*) > 1
    ) x`;
  console.log(
    `  load_nos with >1 row: ${dupes[0].dup_count}, extra rows: ${dupes[0].extra_rows ?? 0}`,
  );

  console.log("\n=== H3: load distribution by source for the week ===");
  const bySrc = await sql`
    SELECT source, COUNT(*)::int AS n
    FROM loads
    WHERE delivered_on >= ${wk}::date AND delivered_on < ${wkEnd}::date
    GROUP BY source ORDER BY n DESC`;
  for (const r of bySrc) console.log(`  ${r.source ?? "(null)"}: ${r.n}`);

  console.log(
    "\n=== H4: by job_category (sheet probably excludes non-standard) ===",
  );
  const byCat = await sql`
    SELECT COALESCE(job_category, 'standard') AS cat, COUNT(*)::int AS n
    FROM loads
    WHERE delivered_on >= ${wk}::date AND delivered_on < ${wkEnd}::date
    GROUP BY cat ORDER BY n DESC`;
  for (const r of byCat) console.log(`  ${r.cat}: ${r.n}`);

  console.log("\n=== H5: ingest timing — when were these rows imported? ===");
  const byImportDate = await sql`
    SELECT
      DATE_TRUNC('day', created_at)::date::text AS import_day,
      source,
      COUNT(*)::int AS n
    FROM loads
    WHERE delivered_on >= ${wk}::date AND delivered_on < ${wkEnd}::date
    GROUP BY 1, source
    ORDER BY 1, n DESC`;
  for (const r of byImportDate)
    console.log(`  ${r.import_day} | ${r.source ?? "(null)"} | ${r.n}`);

  console.log("\n=== H6: sample paired duplicates (if any) ===");
  const samples = await sql`
    SELECT l1.load_no, l1.source AS src1, l2.source AS src2,
           l1.bol_no AS bol1, l2.bol_no AS bol2,
           l1.driver_name AS drv1, l2.driver_name AS drv2,
           l1.delivered_on::date AS day
    FROM loads l1
    JOIN loads l2 ON l1.load_no = l2.load_no AND l1.id < l2.id
    WHERE l1.delivered_on >= ${wk}::date AND l1.delivered_on < ${wkEnd}::date
    LIMIT 5`;
  for (const r of samples)
    console.log(
      `  ${r.load_no} | ${r.src1}/${r.src2} | bol=${r.bol1}/${r.bol2} | drv=${r.drv1}/${r.drv2} | ${r.day}`,
    );

  console.log(
    "\n=== H7: per-customer breakdown (which customer accounts for the over-count?) ===",
  );
  const byCust = await sql`
    SELECT COALESCE(c.name, '(NULL)') AS bill_to, COUNT(*)::int AS n
    FROM loads l
    LEFT JOIN customers c ON c.id = l.customer_id
    WHERE l.delivered_on >= ${wk}::date AND l.delivered_on < ${wkEnd}::date
    GROUP BY c.name ORDER BY n DESC`;
  for (const r of byCust) console.log(`  ${r.bill_to}: ${r.n}`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
