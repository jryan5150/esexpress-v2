// One-time backfill: mark assignment.photo_status='attached' for any load
// that has either (a) a photo row in `photos`, or (b) a matched JotForm
// bol_submission. The display already uses an effective-status fallback
// (computed in /diag/well-grid/cell + /diag/loads-list + /diag/load-detail),
// but the underlying assignment field stays stale until something else
// triggers an update — which it never does for legacy matches.
//
// This fixes that permanently. Additive: only writes 'missing' → 'attached'
// where photo evidence exists. Never deletes, never overwrites a non-missing
// status.
//
// Run from repo root:
//   set -a; source .env; set +a
//   tsx backend/scripts/backfill-photo-status.ts             # DRY-RUN
//   tsx backend/scripts/backfill-photo-status.ts --execute   # write

import postgres from "postgres";

const EXECUTE = process.argv.includes("--execute");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  if (url.includes("interchange.proxy.rlwy.net"))
    throw new Error("Refusing to write phantom DB");
  const sql = postgres(url, { prepare: false, max: 1 });

  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY-RUN"}\n`);

  // Discover the impact set first
  const candidates = (await sql`
    SELECT a.id AS assignment_id, a.load_id, a.photo_status,
           CASE
             WHEN EXISTS (SELECT 1 FROM photos p WHERE p.load_id = a.load_id) THEN 'photos_table'
             WHEN EXISTS (SELECT 1 FROM bol_submissions b WHERE b.matched_load_id = a.load_id) THEN 'bol_submissions'
             ELSE 'none'
           END AS evidence_source
    FROM assignments a
    WHERE a.photo_status = 'missing'
      AND (
        EXISTS (SELECT 1 FROM photos p WHERE p.load_id = a.load_id)
        OR EXISTS (SELECT 1 FROM bol_submissions b WHERE b.matched_load_id = a.load_id)
      )
  `) as unknown as Array<{
    assignment_id: number;
    load_id: number;
    photo_status: string;
    evidence_source: string;
  }>;

  console.log(
    `Candidates: ${candidates.length} assignments where photo_status='missing' but evidence exists\n`,
  );

  // Break down by evidence source
  const byEvidence = candidates.reduce<Record<string, number>>((acc, c) => {
    acc[c.evidence_source] = (acc[c.evidence_source] ?? 0) + 1;
    return acc;
  }, {});
  for (const [src, n] of Object.entries(byEvidence)) {
    console.log(`  via ${src}: ${n}`);
  }

  if (candidates.length === 0) {
    console.log("\nNothing to backfill. Exiting.");
    await sql.end();
    return;
  }

  console.log(`\nSample 5:`);
  for (const c of candidates.slice(0, 5)) {
    console.log(
      `  assignment=${c.assignment_id} load=${c.load_id} evidence=${c.evidence_source}`,
    );
  }

  if (!EXECUTE) {
    console.log(`\nDRY-RUN: pass --execute to write.`);
    await sql.end();
    return;
  }

  console.log(`\n=== EXECUTING ===`);
  const upd = await sql.unsafe(`
    UPDATE assignments a
    SET photo_status = 'attached'
    WHERE a.photo_status = 'missing'
      AND (
        EXISTS (SELECT 1 FROM photos p WHERE p.load_id = a.load_id)
        OR EXISTS (SELECT 1 FROM bol_submissions b WHERE b.matched_load_id = a.load_id)
      )
  `);
  console.log(`Updated ${upd.count} assignments.`);

  // Verify
  const after = (await sql`
    SELECT photo_status, COUNT(*)::int AS n
    FROM assignments
    GROUP BY photo_status ORDER BY n DESC
  `) as unknown as Array<{ photo_status: string; n: number }>;
  console.log(`\nNew distribution:`);
  for (const r of after) console.log(`  ${r.photo_status}: ${r.n}`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
