// Cutover-day script: pushes every assignment that's been queued in
// rehearsal mode (pcs_pending_at IS NOT NULL AND pcs_number IS NULL)
// to PCS via the live REST path.
//
// Run AFTER:
//   1. Kyle has delivered + verified OAuth credentials
//   2. You've smoke-tested live mode on one TEST-HAIRPIN load
//   3. UPDATE app_settings SET value = 'live' WHERE key = 'pcs_dispatch_mode';
//
// Usage:
//   set -a; source .env; set +a
//   tsx backend/scripts/drain-pending-pcs.ts                  # dry-run (lists what would push)
//   tsx backend/scripts/drain-pending-pcs.ts --execute        # actually push
//   tsx backend/scripts/drain-pending-pcs.ts --execute --limit=10  # cap iterations
//   tsx backend/scripts/drain-pending-pcs.ts --execute --customer=Liberty  # filter
//
// Each push uses dispatchLoad with forceLive=true so it bypasses any
// remaining rehearsal-mode setting (defense in depth — if the operator
// forgets to flip the setting, this still runs the real path).
//
// Failures get re-flagged for human review (handler_stage = 'uncertain'
// + uncertain_reasons updated). Successes get pcs_number populated +
// pcs_pending_at cleared by the live dispatchLoad path.

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  if (url.includes("interchange.proxy.rlwy.net"))
    throw new Error("Refusing phantom DB");

  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const customerArg = args.find((a) => a.startsWith("--customer="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 1000;
  const customer = customerArg ? customerArg.split("=")[1] : null;

  console.log(
    `Drain pending PCS: execute=${execute} limit=${limit}` +
      (customer ? ` customer=${customer}` : ""),
  );

  const client = postgres(url, { prepare: false, max: 2 });
  const db = drizzle(client);

  // Pull queue
  const customerFilter = customer
    ? sql`AND c.name ILIKE ${"%" + customer + "%"}`
    : sql``;
  const rows = (await db.execute(sql`
    SELECT
      a.id AS assignment_id,
      a.pcs_pending_at::text AS pending_at,
      l.id AS load_id,
      l.load_no,
      l.driver_name,
      l.bol_no,
      c.name AS customer_name,
      w.name AS well_name
    FROM assignments a
    JOIN loads l ON l.id = a.load_id
    LEFT JOIN customers c ON c.id = l.customer_id
    LEFT JOIN wells w ON w.id = a.well_id
    WHERE a.pcs_pending_at IS NOT NULL
      AND a.pcs_number IS NULL
      ${customerFilter}
    ORDER BY a.pcs_pending_at ASC
    LIMIT ${limit}
  `)) as unknown as Array<{
    assignment_id: number;
    pending_at: string;
    load_id: number;
    load_no: string | null;
    driver_name: string | null;
    bol_no: string | null;
    customer_name: string | null;
    well_name: string | null;
  }>;

  console.log(`Queue size: ${rows.length}`);
  if (rows.length === 0) {
    console.log("Nothing to drain. Exiting.");
    await client.end();
    return;
  }

  if (!execute) {
    console.log("\nDry-run preview (first 25):");
    rows.slice(0, 25).forEach((r, i) => {
      console.log(
        `  ${i + 1}. #${r.assignment_id} · load ${r.load_id} · ${r.driver_name ?? "(no driver)"} · ${r.well_name ?? "(no well)"} · ${r.customer_name ?? "(no customer)"} · queued ${r.pending_at}`,
      );
    });
    console.log(
      `\nWould push ${rows.length} assignments. Re-run with --execute.`,
    );
    await client.end();
    return;
  }

  // Execute mode — push one at a time with rate limiting + per-row
  // status logging. dispatchLoad(forceLive: true) bypasses any
  // remaining rehearsal-mode guard.
  const { dispatchLoad } =
    await import("../src/plugins/pcs/services/pcs-rest.service.js");

  let succeeded = 0;
  let failed = 0;
  const failures: Array<{ id: number; error: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    process.stdout.write(
      `[${i + 1}/${rows.length}] #${r.assignment_id} ${r.driver_name ?? "?"} → `,
    );
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await dispatchLoad(db as any, r.assignment_id, {
        forceLive: true,
      });
      if (result.success) {
        succeeded++;
        console.log(`✓ pcs ${result.pcsLoadId ?? "?"} (${result.latencyMs}ms)`);
      } else {
        failed++;
        const msg = result.error?.message ?? "unknown";
        failures.push({ id: r.assignment_id, error: msg });
        console.log(`✗ ${result.error?.code ?? "FAIL"}: ${msg}`);
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ id: r.assignment_id, error: msg });
      console.log(`✗ THROWN: ${msg}`);
    }
    // Pace ~2 req/sec to be polite to PCS during a bulk drain.
    await new Promise((res) => setTimeout(res, 500));
  }

  console.log(
    `\nDone. Succeeded: ${succeeded}. Failed: ${failed}. Total: ${rows.length}.`,
  );
  if (failures.length > 0) {
    console.log("\nFailures (re-run after fixing):");
    failures.slice(0, 20).forEach((f) => {
      console.log(`  #${f.id}: ${f.error}`);
    });
    if (failures.length > 20)
      console.log(`  ...and ${failures.length - 20} more`);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
