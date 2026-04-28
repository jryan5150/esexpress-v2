/**
 * PCS test push (mjs variant) — seeds a TEST assignment + dispatches via
 * the compiled dist/ build. Bypasses tsx ESM resolution issues by importing
 * from compiled JS directly. Equivalent to scripts/pcs-test-push.ts but
 * uses dist/ paths and passes forceLive:true to skip rehearsal-mode check.
 *
 * Usage (with Railway prod env injected):
 *   cd backend && railway run node scripts/pcs-test-push.mjs
 *
 * Safeguards:
 *   - ticket_no includes "TEST-" prefix + timestamp for visibility
 *   - Assignment notes "v2 smoke test — void after PCS receipt confirmed"
 *   - forceLive:true bypasses rehearsal-mode short-circuit
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, sql } from "drizzle-orm";
import { loads, assignments, wells, users, photos } from "../dist/db/schema.js";
import { dispatchLoad } from "../dist/plugins/pcs/services/pcs-rest.service.js";
import { cancelPcsLoad } from "../dist/plugins/pcs/services/pcs-file.service.js";

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

async function main() {
  const stamp = new Date()
    .toISOString()
    .replace(/[:T.-]/g, "")
    .slice(0, 14);
  const ticketNo = `TEST-${stamp}`;

  console.log(`\n=== PCS test push (Path A revert verification) ===`);
  console.log(`Ticket: ${ticketNo}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`PCS_BASE_URL: ${process.env.PCS_BASE_URL}`);
  console.log(`PCS_COMPANY_ID: ${process.env.PCS_COMPANY_ID}`);
  console.log(`PCS_COMPANY_LTR: ${process.env.PCS_COMPANY_LTR}\n`);

  const [well] = await db
    .select({ id: wells.id, name: wells.name })
    .from(wells)
    .where(eq(wells.name, "Liberty Apache Formentera Wrangler"))
    .limit(1);
  if (!well) throw new Error("Seed well not found");
  console.log(`Seed well: ${well.name} (id=${well.id})`);

  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);
  if (!admin) throw new Error("No admin user found");

  const [testLoad] = await db
    .insert(loads)
    .values({
      source: "propx",
      sourceId: `test-${stamp}`,
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
        script: "pcs-test-push.mjs",
        purpose: "Path A revert verification",
        createdAt: new Date().toISOString(),
      },
    })
    .returning({ id: loads.id });
  console.log(`Created test load id=${testLoad.id}`);

  const [testAssignment] = await db
    .insert(assignments)
    .values({
      loadId: testLoad.id,
      wellId: well.id,
      status: "pending",
      handlerStage: "ready_to_build",
      photoStatus: "attached",
      currentHandlerId: admin.id,
      notes: "v2 smoke test — void after PCS receipt confirmed",
    })
    .returning({ id: assignments.id });
  console.log(`Created test assignment id=${testAssignment.id}`);

  // Seed a photo row pointing at any existing photo URL — photoGateCheck
  // resolves via photos.source_url (not just the assignment's photoStatus
  // flag). Reuse a real URL so fetchAndNormalizePhoto can pull bytes.
  // Prefer a JotForm-sourced photo URL — those are publicly fetchable.
  // PropX URLs require auth and would fail at fetchAndNormalizePhoto.
  const [borrowed] = await db
    .select({ url: photos.sourceUrl })
    .from(photos)
    .where(
      sql`source = 'jotform' AND source_url IS NOT NULL AND source_url LIKE 'https://%'`,
    )
    .limit(1);
  if (!borrowed?.url) {
    throw new Error(
      "No existing photo URL found in photos table — cannot satisfy photo gate",
    );
  }
  const [seededPhoto] = await db
    .insert(photos)
    .values({
      loadId: testLoad.id,
      assignmentId: testAssignment.id,
      source: "manual",
      sourceUrl: borrowed.url,
      type: "weight_ticket",
      ticketNo,
      driverName: "TEST DRIVER",
    })
    .returning({ id: photos.id });
  console.log(
    `Seeded photo id=${seededPhoto.id} (cloned URL from existing photo)\n`,
  );

  console.log(`Pushing assignment ${testAssignment.id} to PCS (forceLive)...`);
  const start = Date.now();
  let result;
  try {
    result = await dispatchLoad(db, testAssignment.id, { forceLive: true });
  } catch (err) {
    console.error(
      "\ndispatchLoad threw:",
      err instanceof Error ? err.stack : err,
    );
    await pg.end();
    process.exit(1);
  }
  const elapsed = Date.now() - start;

  console.log(`\n=== Result (${elapsed}ms) ===`);
  console.log(JSON.stringify(result, null, 2));

  if (result.success && result.pcsLoadId) {
    console.log(`\n✅ SUCCESS — PCS loadId: ${result.pcsLoadId}`);
    console.log(`   Ticket reference: ${ticketNo}`);
    console.log(
      `\n   Auto-voiding test load to keep Hairpin/ES Express books clean...`,
    );
    try {
      await cancelPcsLoad(db, result.pcsLoadId, "B");
      console.log(`   ✅ Voided PCS loadId ${result.pcsLoadId}`);
    } catch (err) {
      console.log(
        `   ⚠️  Auto-void FAILED: ${err instanceof Error ? err.message : String(err)}`,
      );
      console.log(
        `   You'll need to void loadId ${result.pcsLoadId} manually in PCS UI.`,
      );
    }
  } else {
    console.log(`\n❌ FAILED — see error above`);
  }
}

try {
  await main();
} finally {
  await pg.end();
}
