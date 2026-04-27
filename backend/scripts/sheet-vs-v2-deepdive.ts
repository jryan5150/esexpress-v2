// Sheet says 1287 for 4/19, v2 says 1955. Where does the 668 delta
// come from? Check:
//   1. Which sheet snapshot row(s) sum to 1287?
//   2. Per-well comparison: sheet rows vs v2 rows for the same well
//   3. Definitional: maybe sheet counts only "built" while v2 counts
//      all delivered.

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const wk = "2026-04-19";

  console.log(`=== Sheet snapshots for week ${wk} ===`);
  const snaps = await sql`
    SELECT sheet_tab_name, well_name, bill_to,
           week_total, total_built, total_to_build, loads_left_over,
           captured_at::text
    FROM sheet_load_count_snapshots
    WHERE week_start = ${wk}
    ORDER BY captured_at DESC, well_name NULLS FIRST
    LIMIT 30`;
  console.log(`  rows returned: ${snaps.length}`);
  for (const r of snaps.slice(0, 25)) {
    const w = (r.well_name ?? "(BALANCE TOTAL)").slice(0, 35);
    console.log(
      `  ${r.sheet_tab_name} | ${w.padEnd(35)} | wk=${r.week_total ?? "-"} built=${r.total_built ?? "-"} to_build=${r.total_to_build ?? "-"} leftover=${r.loads_left_over ?? "-"}`,
    );
  }

  console.log(`\n=== Sheet — distinct (tab, captured_at) pairs for ${wk} ===`);
  const tabs = await sql`
    SELECT sheet_tab_name, captured_at::text AS captured,
           COUNT(*)::int AS rows,
           MAX(total_built) AS max_built
    FROM sheet_load_count_snapshots
    WHERE week_start = ${wk}
    GROUP BY sheet_tab_name, captured_at
    ORDER BY captured DESC`;
  for (const r of tabs)
    console.log(
      `  tab=${r.sheet_tab_name} | captured=${r.captured} | rows=${r.rows} | max_total_built=${r.max_built}`,
    );

  console.log(`\n=== v2 — per-well count for ${wk} ===`);
  const v2Wells = await sql`
    SELECT
      COALESCE(w.name, '(NO WELL)') AS well_name,
      COUNT(l.id)::int AS v2_count
    FROM loads l
    LEFT JOIN assignments a ON a.load_id = l.id
    LEFT JOIN wells w ON w.id = a.well_id
    WHERE l.delivered_on >= ${wk}::date
      AND l.delivered_on < ${wk}::date + interval '7 days'
    GROUP BY w.name
    ORDER BY v2_count DESC`;
  for (const r of v2Wells)
    console.log(`  ${r.well_name.slice(0, 50).padEnd(50)} | ${r.v2_count}`);

  console.log(`\n=== Sheet vs v2 well-level join ===`);
  // Match on well_name. Sheet wells may not match v2 well names exactly.
  // Resolve sheet well names through BOTH wells.name AND wells.aliases.
  // The aliases jsonb array holds known short-form / source-form variants
  // (seeded 2026-04-27 via seed-aliases.ts). PostgreSQL `?` operator
  // tests if a JSONB array contains a given text element.
  // Sheet stores BOTH "Current" and "Previous" tab rows per week, so
  // joining sheet → wells fan-outs and double-counts v2 loads. Use
  // COUNT(DISTINCT l.id) to dedupe across the fan-out. MAX(s.week_total)
  // over the duplicated sheet rows already returns the same value, so
  // the sheet column stays correct.
  const joined = await sql`
    SELECT
      COALESCE(w.name, s.well_name) AS well,
      MAX(s.week_total) AS sheet_count,
      COUNT(DISTINCT l.id)::int AS v2_count
    FROM sheet_load_count_snapshots s
    LEFT JOIN wells w
      ON LOWER(TRIM(w.name)) = LOWER(TRIM(s.well_name))
      OR (w.aliases IS NOT NULL AND w.aliases ? s.well_name)
    LEFT JOIN assignments a ON a.well_id = w.id
    LEFT JOIN loads l ON l.id = a.load_id
      AND l.delivered_on >= ${wk}::date
      AND l.delivered_on < ${wk}::date + interval '7 days'
    WHERE s.week_start = ${wk} AND s.well_name IS NOT NULL
    GROUP BY COALESCE(w.name, s.well_name)
    ORDER BY (MAX(s.week_total) - COUNT(DISTINCT l.id)) DESC`;
  console.log(`  sheet_well | sheet | v2 | delta`);
  for (const r of joined.slice(0, 25)) {
    const w = (r.well ?? "?").slice(0, 45);
    const d = (r.sheet_count ?? 0) - (r.v2_count ?? 0);
    console.log(
      `  ${w.padEnd(45)} | ${String(r.sheet_count ?? "-").padStart(4)} | ${String(r.v2_count ?? 0).padStart(4)} | ${d > 0 ? "+" : ""}${d}`,
    );
  }

  console.log(`\n=== v2 wells NOT in sheet (alias-aware) ===`);
  const v2Only = await sql`
    SELECT
      COALESCE(w.name, '(NO WELL)') AS well_name,
      COUNT(l.id)::int AS v2_count
    FROM loads l
    LEFT JOIN assignments a ON a.load_id = l.id
    LEFT JOIN wells w ON w.id = a.well_id
    WHERE l.delivered_on >= ${wk}::date
      AND l.delivered_on < ${wk}::date + interval '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM sheet_load_count_snapshots s
        WHERE s.week_start = ${wk}
          AND s.well_name IS NOT NULL
          AND (
            LOWER(TRIM(s.well_name)) = LOWER(TRIM(w.name))
            OR (w.aliases IS NOT NULL AND w.aliases ? s.well_name)
          )
      )
    GROUP BY w.name
    ORDER BY v2_count DESC LIMIT 20`;
  for (const r of v2Only)
    console.log(`  ${r.well_name.slice(0, 50).padEnd(50)} | v2=${r.v2_count}`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
