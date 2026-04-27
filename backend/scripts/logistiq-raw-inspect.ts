// Inspect raw_data for the 3 dup rows of bol AU2604192554264 to find the
// actual field names Logistiq uses. The hypothesis: generateSourceId()
// resolveField list misses the real name, so it falls through to the
// hash fallback — and the hash shifts between sync runs.

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const rows = (await sql`
    SELECT id, source_id, raw_data
    FROM loads
    WHERE source = 'logistiq'
      AND bol_no = 'AU2604192554264'
      AND driver_name = 'Andre Bruton'
    ORDER BY id`) as unknown as Array<{
    id: number;
    source_id: string;
    raw_data: Record<string, unknown> | null;
  }>;

  console.log(`Found ${rows.length} rows for this dup group\n`);

  // First: print each row's source_id to confirm they're DIFFERENT
  for (const r of rows) {
    console.log(`id=${r.id}  source_id=${r.source_id}`);
  }

  // Now: dump the full raw_data of the first row so we can see field names
  console.log(`\n=== raw_data keys (row 1, id=${rows[0].id}) ===`);
  if (rows[0].raw_data) {
    const keys = Object.keys(rows[0].raw_data);
    for (const k of keys) {
      const v = rows[0].raw_data[k];
      const display =
        typeof v === "object"
          ? JSON.stringify(v).slice(0, 60)
          : String(v).slice(0, 60);
      console.log(`  ${k.padEnd(28)} = ${display}`);
    }
  }

  // Diff: which keys differ between rows? That's what's making the hash unstable.
  console.log(`\n=== Field-by-field diff across ${rows.length} dup rows ===`);
  if (rows.length >= 2 && rows[0].raw_data && rows[1].raw_data) {
    const keys = new Set<string>();
    for (const r of rows)
      if (r.raw_data) Object.keys(r.raw_data).forEach((k) => keys.add(k));
    for (const k of [...keys].sort()) {
      const vals = rows.map((r) => {
        const v = r.raw_data?.[k];
        return typeof v === "object"
          ? JSON.stringify(v)
          : String(v ?? "(null)");
      });
      const allSame = vals.every((v) => v === vals[0]);
      if (!allSame) {
        console.log(`  DIFF ${k}:`);
        for (let i = 0; i < rows.length; i++)
          console.log(
            `    row ${i + 1} (id=${rows[i].id}): ${vals[i].slice(0, 80)}`,
          );
      }
    }
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
