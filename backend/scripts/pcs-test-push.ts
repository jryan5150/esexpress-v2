/**
 * PCS test push — end-to-end smoke test against Hairpin division (LTR=A).
 *
 * Creates a minimal test assignment in v2 with clearly-fake data, then
 * calls dispatchLoad() directly (no HTTP layer). PCS_DISPATCH_ENABLED
 * must be true for the call to actually hit PCS.
 *
 * After the push, prints the PCS load ID so the human can verify in
 * Hairpin PCS UI and void it.
 *
 * Usage:
 *   DATABASE_URL=... PCS_DISPATCH_ENABLED=true npx tsx scripts/pcs-test-push.ts
 *
 * Safeguards:
 *   - ticket_no includes explicit "TEST-" prefix + timestamp for visibility
 *   - Test assignment is marked with notes "v2 smoke test — void after confirm"
 *   - Records assignment ID + PCS load ID + timestamp in data_integrity_runs
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, sql } from "drizzle-orm";
import {
  loads,
  assignments,
  wells,
  users,
  dataIntegrityRuns,
} from "../src/db/schema.js";
import { dispatchLoad } from "../src/plugins/pcs/services/pcs-rest.service.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const pg = postgres(DATABASE_URL, { prepare: false });
// biome-ignore lint/suspicious/noExplicitAny: drizzle type
const db = drizzle(pg) as any;

async function main() {
  const stamp = new Date().toISOString().replace(/[:T]/g, "").slice(0, 12); // 202604221555 etc.
  const ticketNo = `TEST-${stamp}`;

  console.log(`\n=== PCS test push ===`);
  console.log(`Ticket: ${ticketNo}`);
  console.log(`Target: Hairpin division (LTR=A) on 138936\n`);

  // Find a test-safe well and admin user
  const [well] = await db
    .select({ id: wells.id, name: wells.name })
    .from(wells)
    .where(eq(wells.name, "Liberty Apache Formentera Wrangler"))
    .limit(1);
  if (!well)
    throw new Error(
      "Seed well not found — needs one of the Jessica-approved wells",
    );

  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);
  if (!admin) throw new Error("No admin user found");

  console.log(`Seed well: ${well.name} (id=${well.id})`);

  // Create test load
  const [testLoad] = await db
    .insert(loads)
    .values({
      source: "propx",
      externalId: `test-${stamp}`,
      ticketNo,
      bolNo: ticketNo,
      loadNo: ticketNo,
      originName: "TEST LOADER",
      destinationName: well.name,
      driverName: "TEST DRIVER",
      truckNumber: "TEST-01",
      trailerNumber: "TEST-01",
      weightTons: 25,
      weightLbs: 50000,
      status: "pending",
      rawData: {
        test: true,
        script: "pcs-test-push.ts",
        createdAt: new Date().toISOString(),
      },
    })
    .returning({ id: loads.id });
  console.log(`Created test load id=${testLoad.id}`);

  // Create test assignment
  const [testAssignment] = await db
    .insert(assignments)
    .values({
      loadId: testLoad.id,
      wellId: well.id,
      autoMapTier: 1,
      status: "dispatch_ready",
      handlerStage: "ready_to_build",
      photoStatus: "attached",
      currentHandlerId: admin.id,
      notes: "v2 smoke test — void after PCS receipt confirmed",
    })
    .returning({ id: assignments.id });
  console.log(`Created test assignment id=${testAssignment.id}\n`);

  // Log to data_integrity_runs
  const [runEntry] = await db
    .insert(dataIntegrityRuns)
    .values({
      scriptName: "pcs-test-push",
      ranBy: "jace",
      rowCountBefore: 0,
      dryRun: false,
      status: "running",
      metadata: {
        ticketNo,
        loadId: testLoad.id,
        assignmentId: testAssignment.id,
        division: "Hairpin (LTR=A)",
        account: "138936",
      },
    })
    .returning({ id: dataIntegrityRuns.id });

  // Push to PCS
  console.log(`Pushing assignment ${testAssignment.id} to PCS...`);
  const start = Date.now();
  const result = await dispatchLoad(db, testAssignment.id);
  const elapsed = Date.now() - start;

  console.log(`\n=== Result (${elapsed}ms) ===`);
  console.log(JSON.stringify(result, null, 2));

  await db
    .update(dataIntegrityRuns)
    .set({
      completedAt: new Date(),
      status: result.success ? "completed" : "failed",
      notes: `success=${result.success} latencyMs=${result.latencyMs} ${
        result.success
          ? `pcsLoadId=${(result as unknown as { data?: { pcsLoadId?: number } }).data?.pcsLoadId ?? "n/a"}`
          : `error=${(result as unknown as { error?: { code?: string } }).error?.code ?? "?"}`
      }`,
      metadata: {
        ticketNo,
        loadId: testLoad.id,
        assignmentId: testAssignment.id,
        division: "Hairpin (LTR=A)",
        result,
      },
    })
    .where(eq(dataIntegrityRuns.id, runEntry.id));

  if (result.success) {
    console.log(`\n✓ PUSH SUCCEEDED`);
    console.log(`Go check Hairpin PCS UI for ticket ${ticketNo}`);
    console.log(`Void it when you've confirmed it arrived.`);
  } else {
    console.log(`\n✗ PUSH FAILED`);
    console.log(
      `Investigate error above. Test assignment and load remain in v2 DB.`,
    );
  }
  console.log(`\ndata_integrity_runs id: ${runEntry.id}`);
}

try {
  await main();
} catch (err) {
  console.error("\nTest push threw:", err instanceof Error ? err.stack : err);
  process.exitCode = 1;
} finally {
  await pg.end();
}
