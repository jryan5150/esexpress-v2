// Why are 99.5% of assignments stuck at 'pending'?
// Read-only diagnostic. Run from repo root:
//   set -a; source .env; set +a
//   tsx backend/scripts/pending-investigation.ts

import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  if (url.includes("interchange.proxy.rlwy.net"))
    throw new Error("Refusing phantom DB");
  const sql = postgres(url, { prepare: false, max: 1 });

  console.log("=== Status by source ===");
  const bySrc = await sql`
    SELECT l.source, a.status, COUNT(*)::int AS n
    FROM assignments a JOIN loads l ON l.id = a.load_id
    GROUP BY l.source, a.status ORDER BY l.source, n DESC`;
  for (const r of bySrc)
    console.log(`  ${r.source ?? "(null)"} | ${r.status} | ${r.n}`);

  console.log("\n=== Status by age bucket ===");
  const byAge = await sql`
    SELECT
      CASE
        WHEN l.delivered_on > now() - interval '7 days' THEN '0-7d'
        WHEN l.delivered_on > now() - interval '30 days' THEN '7-30d'
        WHEN l.delivered_on > now() - interval '90 days' THEN '30-90d'
        ELSE '90d+'
      END AS bucket, a.status, COUNT(*)::int AS n
    FROM assignments a JOIN loads l ON l.id = a.load_id
    GROUP BY 1, a.status ORDER BY 1, a.status`;
  for (const r of byAge) console.log(`  ${r.bucket} | ${r.status} | ${r.n}`);

  console.log("\n=== Pending assignments — photo coverage ===");
  const cov = await sql`
    SELECT
      COUNT(*) FILTER (WHERE photo_status = 'attached')::int AS attached,
      COUNT(*) FILTER (WHERE photo_status = 'pending')::int AS p_pending,
      COUNT(*) FILTER (WHERE photo_status = 'missing')::int AS p_missing
    FROM assignments WHERE status = 'pending'`;
  console.log(
    `  attached=${cov[0].attached}, photo_pending=${cov[0].p_pending}, photo_missing=${cov[0].p_missing}`,
  );

  console.log("\n=== match_decisions table ===");
  try {
    const md = await sql`
      SELECT COUNT(*)::int AS n,
             MIN(created_at)::text AS first,
             MAX(created_at)::text AS last
      FROM match_decisions`;
    console.log(`  rows=${md[0].n}, first=${md[0].first}, last=${md[0].last}`);
    const recent = await sql`
      SELECT decision, COUNT(*)::int AS n
      FROM match_decisions WHERE created_at > now() - interval '7 days'
      GROUP BY decision`;
    console.log(`  decisions last 7d:`);
    for (const r of recent) console.log(`    ${r.decision}: ${r.n}`);
  } catch (e) {
    console.log(`  match_decisions error: ${(e as Error).message}`);
  }

  console.log("\n=== Driver roster status ===");
  try {
    const dr = await sql`
      SELECT COUNT(*)::int AS n,
             MAX(updated_at)::text AS last_updated
      FROM driver_roster`;
    console.log(`  rows=${dr[0].n}, last_updated=${dr[0].last_updated}`);
  } catch (e) {
    console.log(`  error: ${(e as Error).message}`);
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
