// Quantify the Logistiq triplicate bug. Group by (bol_no, driver_name,
// delivered_on, source) and count how many rows are extras.
//
// Also confirm Liberty (PropX) is clean.

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  console.log("=== Logistiq dup population (lifetime) ===");
  const dupAll = await sql`
    SELECT
      COUNT(*)::int AS dup_groups,
      SUM(extras)::int AS extra_rows,
      SUM(occurrences)::int AS total_rows_involved
    FROM (
      SELECT bol_no, driver_name, delivered_on::date AS day,
             COUNT(*) AS occurrences,
             COUNT(*) - 1 AS extras
      FROM loads
      WHERE source = 'logistiq'
        AND bol_no IS NOT NULL AND bol_no <> ''
        AND driver_name IS NOT NULL
      GROUP BY bol_no, driver_name, delivered_on::date
      HAVING COUNT(*) > 1
    ) x`;
  console.log(`  groups (unique loads with dups): ${dupAll[0].dup_groups}`);
  console.log(`  total extra rows (overcount): ${dupAll[0].extra_rows ?? 0}`);
  console.log(
    `  total rows in dup groups: ${dupAll[0].total_rows_involved ?? 0}`,
  );

  console.log("\n=== PropX dup population (lifetime, same key) ===");
  const propxDup = await sql`
    SELECT
      COUNT(*)::int AS dup_groups,
      SUM(extras)::int AS extra_rows
    FROM (
      SELECT bol_no, driver_name, delivered_on::date AS day,
             COUNT(*) - 1 AS extras
      FROM loads
      WHERE source = 'propx'
        AND bol_no IS NOT NULL AND bol_no <> ''
        AND driver_name IS NOT NULL
      GROUP BY bol_no, driver_name, delivered_on::date
      HAVING COUNT(*) > 1
    ) x`;
  console.log(
    `  groups: ${propxDup[0].dup_groups}, extras: ${propxDup[0].extra_rows ?? 0}`,
  );

  console.log("\n=== Logistiq dup distribution by occurrence count ===");
  const dist = await sql`
    SELECT occurrences::int, COUNT(*)::int AS group_count
    FROM (
      SELECT bol_no, driver_name, delivered_on::date AS day,
             COUNT(*) AS occurrences
      FROM loads
      WHERE source = 'logistiq' AND bol_no IS NOT NULL AND driver_name IS NOT NULL
      GROUP BY bol_no, driver_name, delivered_on::date
    ) x
    GROUP BY occurrences ORDER BY occurrences`;
  for (const r of dist)
    console.log(`  ${r.occurrences} copies/load: ${r.group_count} loads`);

  console.log(
    "\n=== Logistiq dup spread by ingest week (when did dups arrive?) ===",
  );
  const byWk = await sql`
    SELECT
      DATE_TRUNC('week', l.created_at)::date AS ingest_week,
      COUNT(*)::int AS dup_rows
    FROM loads l
    WHERE l.source = 'logistiq'
      AND EXISTS (
        SELECT 1 FROM loads l2
        WHERE l2.source = 'logistiq'
          AND l2.bol_no = l.bol_no
          AND l2.driver_name = l.driver_name
          AND l2.delivered_on::date = l.delivered_on::date
          AND l2.id <> l.id
      )
    GROUP BY 1 ORDER BY 1`;
  for (const r of byWk)
    console.log(`  week ${r.ingest_week}: ${r.dup_rows} dup rows ingested`);

  console.log("\n=== Sample of one duplicated load (full row context) ===");
  const sample = await sql`
    SELECT id, source, load_no, bol_no, driver_name,
           delivered_on::date AS day, weight_tons,
           created_at::text AS ingested_at
    FROM loads
    WHERE source = 'logistiq'
      AND bol_no = 'AU2604192554264'
      AND driver_name = 'Andre Bruton'
    ORDER BY id`;
  for (const r of sample)
    console.log(
      `  id=${r.id} bol=${r.bol_no} ingested=${r.ingested_at} day=${r.day} tons=${r.weight_tons}`,
    );

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
