/**
 * Re-attempt PCS push against an existing assignment using freshly-compiled
 * dist code (post-df9f0d0 diagnostic). Bypasses tsx resolution issues by
 * importing from compiled dist directly.
 *
 * Usage (with Railway prod env injected):
 *   cd backend && railway run node scripts/pcs-retry-push.mjs 190355
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { dispatchLoad } from "../dist/plugins/pcs/services/pcs-rest.service.js";

const ASSIGNMENT_ID = Number.parseInt(process.argv[2] ?? "190355", 10);
if (!Number.isFinite(ASSIGNMENT_ID)) {
  console.error("Usage: node scripts/pcs-retry-push.mjs <assignmentId>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set — run via 'railway run'");
  process.exit(1);
}
if (!process.env.PCS_CLIENT_ID || !process.env.PCS_CLIENT_SECRET) {
  console.error("PCS_CLIENT_ID/SECRET missing — run via 'railway run'");
  process.exit(1);
}

const pg = postgres(process.env.DATABASE_URL, { prepare: false });
const db = drizzle(pg);

console.log(`\n=== PCS retry-push ===`);
console.log(`Assignment: ${ASSIGNMENT_ID}`);
console.log(`Time: ${new Date().toISOString()}`);
console.log(`PCS_BASE_URL: ${process.env.PCS_BASE_URL}`);
console.log(`PCS_COMPANY_ID: ${process.env.PCS_COMPANY_ID}`);
console.log(`PCS_COMPANY_LTR (default): ${process.env.PCS_COMPANY_LTR}\n`);

const start = Date.now();
let result;
try {
  result = await dispatchLoad(db, ASSIGNMENT_ID);
} catch (err) {
  console.error("dispatchLoad threw:", err instanceof Error ? err.stack : err);
  await pg.end();
  process.exit(1);
}
const elapsed = Date.now() - start;

console.log(`\n=== Result (${elapsed}ms) ===`);
console.log(JSON.stringify(result, null, 2));

await pg.end();
