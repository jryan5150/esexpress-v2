// v2 has 869 loads to "Logistix IQ Exco DF DGB Little 6-7-8" for week
// 4/19. Sheet has 409 to "Logistix IQ Exco DF DGB Little". 460 over.
// What's the source of the over-count?

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const wk = "2026-04-19";

  console.log(
    "=== Loads matching 'Exco' in well/destination for week 4/19 ===",
  );
  const byField = await sql`
    SELECT
      l.source,
      l.destination_name,
      w.name AS well_name,
      COUNT(*)::int AS n
    FROM loads l
    LEFT JOIN assignments a ON a.load_id = l.id
    LEFT JOIN wells w ON w.id = a.well_id
    WHERE l.delivered_on >= ${wk}::date
      AND l.delivered_on < ${wk}::date + interval '7 days'
      AND (
        w.name ILIKE '%Exco%' OR
        w.name ILIKE '%Little%' OR
        l.destination_name ILIKE '%Exco%' OR
        l.destination_name ILIKE '%Little%'
      )
    GROUP BY l.source, l.destination_name, w.name
    ORDER BY n DESC LIMIT 20`;
  for (const r of byField)
    console.log(
      `  ${(r.source ?? "?").padEnd(10)} | dest=${(r.destination_name ?? "-").slice(0, 40).padEnd(40)} | well=${(r.well_name ?? "-").slice(0, 40)} | ${r.n}`,
    );

  console.log(
    `\n=== Distinct LOADS (no assignment fan-out) by source for Little 6-7-8 well ===`,
  );
  const distinctLoads = await sql`
    SELECT
      l.source,
      COUNT(DISTINCT l.id)::int AS distinct_loads,
      COUNT(*)::int AS row_count
    FROM loads l
    JOIN assignments a ON a.load_id = l.id
    JOIN wells w ON w.id = a.well_id
    WHERE w.name = 'Logistix IQ Exco DF DGB Little 6-7-8'
      AND l.delivered_on >= ${wk}::date
      AND l.delivered_on < ${wk}::date + interval '7 days'
    GROUP BY l.source`;
  for (const r of distinctLoads)
    console.log(
      `  ${r.source}: distinct_loads=${r.distinct_loads}, row_count=${r.row_count}`,
    );

  console.log(
    `\n=== Same load with multiple assignments (fan-out source)? ===`,
  );
  const fanout = await sql`
    SELECT load_id, COUNT(*)::int AS assignment_count
    FROM assignments a
    JOIN loads l ON l.id = a.load_id
    JOIN wells w ON w.id = a.well_id
    WHERE w.name = 'Logistix IQ Exco DF DGB Little 6-7-8'
      AND l.delivered_on >= ${wk}::date
      AND l.delivered_on < ${wk}::date + interval '7 days'
    GROUP BY load_id
    HAVING COUNT(*) > 1
    ORDER BY assignment_count DESC LIMIT 10`;
  console.log(`  loads with >1 assignment to this well: ${fanout.length}`);

  console.log(
    `\n=== Logistiq raw_data — same physical load, different load_no? ===`,
  );
  const dupCheck = await sql`
    SELECT
      raw_data->>'driver_name' AS driver,
      raw_data->>'pickup_date' AS pickup,
      raw_data->>'delivery_date' AS delivery,
      raw_data->>'sand_provider_load_id' AS sand_id,
      COUNT(*)::int AS n
    FROM loads l
    JOIN assignments a ON a.load_id = l.id
    JOIN wells w ON w.id = a.well_id
    WHERE w.name = 'Logistix IQ Exco DF DGB Little 6-7-8'
      AND l.delivered_on >= ${wk}::date
      AND l.delivered_on < ${wk}::date + interval '7 days'
      AND l.source = 'logistiq'
    GROUP BY 1, 2, 3, 4
    HAVING COUNT(*) > 1
    ORDER BY n DESC LIMIT 10`;
  console.log(
    `  potential same-load dups in Logistiq feed: ${dupCheck.length}`,
  );
  for (const r of dupCheck.slice(0, 5))
    console.log(
      `    drv=${r.driver} | pickup=${r.pickup} | delivery=${r.delivery} | sand_id=${r.sand_id} | ${r.n} rows`,
    );

  console.log(`\n=== Sample 5 loads to compare what's in the feed ===`);
  const sample = await sql`
    SELECT
      l.id, l.source, l.load_no, l.bol_no, l.driver_name,
      l.delivered_on::date AS day,
      l.weight_tons,
      l.raw_data->>'sand_provider_load_id' AS sand_id
    FROM loads l
    JOIN assignments a ON a.load_id = l.id
    JOIN wells w ON w.id = a.well_id
    WHERE w.name = 'Logistix IQ Exco DF DGB Little 6-7-8'
      AND l.delivered_on >= ${wk}::date
      AND l.delivered_on < ${wk}::date + interval '7 days'
    ORDER BY l.driver_name, l.delivered_on
    LIMIT 10`;
  for (const r of sample)
    console.log(
      `  id=${r.id} src=${r.source} load=${r.load_no} bol=${r.bol_no} drv=${r.driver_name} day=${r.day} tons=${r.weight_tons} sand_id=${r.sand_id}`,
    );

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
