/**
 * Re-attempt a PCS push against an EXISTING assignment using current
 * dispatchLoad code (post df9f0d0 diagnostic instrumentation).
 *
 * Designed for diagnosing the persistent 500 on AddLoad: takes an
 * assignment ID that has already been attempted (and failed), runs the
 * current dispatchLoad, and prints the full result. The error message
 * (per df9f0d0) now includes the exact request body + response headers
 * so we can stop guessing at the cause.
 *
 * Usage (with Railway prod env injected):
 *   cd backend && railway run npx tsx scripts/pcs-retry-push.ts 190355
 *
 * Side effects:
 *   - One PCS AddLoad attempt (may create a real load in Hairpin if it
 *     succeeds; voidable). If it 500s, no PCS-side change.
 *   - Updates assignment.pcs_dispatch with new attempt timestamp + result.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { dispatchLoad } from "../src/plugins/pcs/services/pcs-rest.service.js";

const ASSIGNMENT_ID = Number.parseInt(process.argv[2] ?? "190355", 10);
if (!Number.isFinite(ASSIGNMENT_ID)) {
  console.error("Usage: pcs-retry-push.ts <assignmentId>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set — run via 'railway run' to inject prod env");
  process.exit(1);
}
if (!process.env.PCS_CLIENT_ID || !process.env.PCS_CLIENT_SECRET) {
  console.error("PCS_CLIENT_ID/SECRET missing — run via 'railway run'");
  process.exit(1);
}

const pg = postgres(process.env.DATABASE_URL, { prepare: false });
// biome-ignore lint/suspicious/noExplicitAny: drizzle type
const db = drizzle(pg) as any;

console.log(`\n=== PCS retry-push ===`);
console.log(`Assignment: ${ASSIGNMENT_ID}`);
console.log(`Time: ${new Date().toISOString()}`);
console.log(`PCS_BASE_URL: ${process.env.PCS_BASE_URL}`);
console.log(`PCS_COMPANY_ID: ${process.env.PCS_COMPANY_ID}`);
console.log(`PCS_COMPANY_LTR (default): ${process.env.PCS_COMPANY_LTR}\n`);

const start = Date.now();
let result: unknown;
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
