/**
 * Run pcs-sync once to populate discrepancies for currently-matched loads
 * + sweep orphan_destinations. Also reports the resulting discrepancy
 * counts so we can verify the pipeline produces what we expect.
 *
 * Usage (with Railway env injected for PCS creds):
 *   cd backend && railway run env DATABASE_URL=<local-public-proxy> node scripts/discrepancy-backfill.mjs
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { syncPcsLoads } from "../dist/plugins/pcs/services/pcs-sync.service.js";
import { discrepancies } from "../dist/db/schema.js";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
if (!process.env.PCS_CLIENT_ID || !process.env.PCS_CLIENT_SECRET) {
  console.error("PCS_CLIENT_ID/SECRET missing — run via 'railway run'");
  process.exit(1);
}

const pg = postgres(process.env.DATABASE_URL, { prepare: false });
const db = drizzle(pg);

console.log(`\n=== Discrepancy backfill ===`);
console.log(`Time: ${new Date().toISOString()}\n`);

// Pre-state counts
const [pre] = await db
  .select({
    open: sql`COUNT(*) FILTER (WHERE ${discrepancies.resolvedAt} IS NULL)::int`,
    total: sql`COUNT(*)::int`,
  })
  .from(discrepancies);
console.log(`Pre-state: ${pre.open} open / ${pre.total} total discrepancies\n`);

console.log(`Running syncPcsLoads()...`);
const start = Date.now();
const result = await syncPcsLoads(db);
const elapsed = Date.now() - start;

console.log(`\n=== Sync result (${elapsed}ms) ===`);
console.log(JSON.stringify(result, null, 2));

const [post] = await db
  .select({
    open: sql`COUNT(*) FILTER (WHERE ${discrepancies.resolvedAt} IS NULL)::int`,
    total: sql`COUNT(*)::int`,
  })
  .from(discrepancies);
console.log(
  `\nPost-state: ${post.open} open / ${post.total} total discrepancies`,
);

// Per-type breakdown of OPEN
const byType = await db.execute(sql`
  SELECT discrepancy_type, severity, COUNT(*)::int AS n
  FROM discrepancies
  WHERE resolved_at IS NULL
  GROUP BY discrepancy_type, severity
  ORDER BY discrepancy_type, severity;
`);
console.log(`\nOpen discrepancies by type+severity:`);
console.table(byType);

// Sample 5 most recent open discrepancies
const sample = await db.execute(sql`
  SELECT id, subject_key, discrepancy_type, severity, v2_value, pcs_value,
         LEFT(message, 80) AS message_preview, detected_at
  FROM discrepancies
  WHERE resolved_at IS NULL
  ORDER BY detected_at DESC
  LIMIT 5;
`);
console.log(`\nSample open discrepancies:`);
console.table(sample);

await pg.end();
