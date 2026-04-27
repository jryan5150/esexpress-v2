// Numbers Snapshot — accounting validation for Monday's walkthrough.
// Every load-bearing number we might cite, with the SQL that produced it.
// Run from repo root:
//
//   set -a; source .env; set +a
//   tsx backend/scripts/numbers-snapshot.ts
//
// Read-only. Outputs a Markdown table to stdout — pipe to a doc if you want.

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
if (url.includes("interchange.proxy.rlwy.net")) {
  console.error("Refusing to read phantom Postgres-gywY DB. Aborting.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

type Row = { metric: string; value: string; sourceQuery: string };
const rows: Row[] = [];

async function record(
  metric: string,
  query: string,
  fmt = (v: any) => String(v),
) {
  const r = await sql.unsafe(query);
  const v = r[0] ? Object.values(r[0])[0] : null;
  rows.push({
    metric,
    value: fmt(v),
    sourceQuery: query.replace(/\s+/g, " ").trim(),
  });
}

async function main() {
  // ── Loads ──────────────────────────────────────────────────────────
  await record("Loads — total", `SELECT COUNT(*)::int FROM loads`);
  await record(
    "Loads — last 7 days",
    `SELECT COUNT(*)::int FROM loads WHERE delivered_on > now() - interval '7 days'`,
  );
  await record(
    "Loads — last 30 days",
    `SELECT COUNT(*)::int FROM loads WHERE delivered_on > now() - interval '30 days'`,
  );
  await record(
    "Loads — Q1 2026 (Jan-Mar)",
    `SELECT COUNT(*)::int FROM loads
     WHERE delivered_on >= '2026-01-01' AND delivered_on < '2026-04-01'`,
  );

  // ── Loads by source ────────────────────────────────────────────────
  const bySrc = await sql`
    SELECT source, COUNT(*)::int AS n FROM loads GROUP BY source ORDER BY n DESC
  `;
  for (const r of bySrc) {
    rows.push({
      metric: `  by source: ${r.source ?? "(null)"}`,
      value: String(r.n),
      sourceQuery: "GROUP BY source",
    });
  }

  // ── Wells ──────────────────────────────────────────────────────────
  await record("Wells — total in roster", `SELECT COUNT(*)::int FROM wells`);
  await record(
    "Wells — active last 30d (had loads)",
    `SELECT COUNT(DISTINCT a.well_id)::int
     FROM assignments a JOIN loads l ON l.id = a.load_id
     WHERE l.delivered_on > now() - interval '30 days'`,
  );

  // ── Customers / Bill To attribution ────────────────────────────────
  await record(
    "Customers — distinct rows",
    `SELECT COUNT(*)::int FROM customers`,
  );
  await record(
    "Loads with NULL Bill To",
    `SELECT COUNT(*)::int FROM loads WHERE customer_id IS NULL`,
  );
  await record(
    "Loads with NULL Bill To — last 7d",
    `SELECT COUNT(*)::int FROM loads
     WHERE customer_id IS NULL AND delivered_on > now() - interval '7 days'`,
  );

  // ── Match / Assignments ────────────────────────────────────────────
  await record("Assignments — total", `SELECT COUNT(*)::int FROM assignments`);
  const byStatus = await sql`
    SELECT status, COUNT(*)::int AS n
    FROM assignments GROUP BY status ORDER BY n DESC
  `;
  for (const r of byStatus) {
    rows.push({
      metric: `  status: ${r.status}`,
      value: String(r.n),
      sourceQuery: "assignments GROUP BY status",
    });
  }

  // ── Photos ─────────────────────────────────────────────────────────
  const byPhoto = await sql`
    SELECT photo_status, COUNT(*)::int AS n
    FROM assignments GROUP BY photo_status ORDER BY n DESC
  `;
  for (const r of byPhoto) {
    rows.push({
      metric: `  photo_status: ${r.photo_status ?? "(null)"}`,
      value: String(r.n),
      sourceQuery: "assignments GROUP BY photo_status",
    });
  }
  await record(
    "Photos — rows in photos table",
    `SELECT COUNT(*)::int FROM photos`,
  );
  await record(
    "BOL submissions — rows",
    `SELECT COUNT(*)::int FROM bol_submissions`,
  );
  await record(
    "BOL submissions — last 7d",
    `SELECT COUNT(*)::int FROM bol_submissions
     WHERE created_at > now() - interval '7 days'`,
  );

  // ── Discrepancies ──────────────────────────────────────────────────
  await record(
    "Discrepancies — total open",
    `SELECT COUNT(*)::int FROM discrepancies WHERE resolved_at IS NULL`,
  );
  const byType = await sql`
    SELECT discrepancy_type, COUNT(*)::int AS n
    FROM discrepancies WHERE resolved_at IS NULL
    GROUP BY discrepancy_type ORDER BY n DESC
  `;
  for (const r of byType) {
    rows.push({
      metric: `  open type: ${r.discrepancy_type}`,
      value: String(r.n),
      sourceQuery: "discrepancies (open) GROUP BY type",
    });
  }
  await record(
    "Discrepancies — resolved (lifetime)",
    `SELECT COUNT(*)::int FROM discrepancies WHERE resolved_at IS NOT NULL`,
  );

  // ── PCS ─────────────────────────────────────────────────────────────
  await record(
    "PCS — load history rows (lifetime)",
    `SELECT COUNT(*)::int FROM pcs_load_history`,
  );
  await record(
    "PCS — distinct PCS load numbers",
    `SELECT COUNT(DISTINCT pcs_load_no)::int FROM pcs_load_history
     WHERE pcs_load_no IS NOT NULL AND pcs_load_no <> ''`,
  );
  await record(
    "PCS — load history Q1 2026",
    `SELECT COUNT(*)::int FROM pcs_load_history
     WHERE pickup_date >= '2026-01-01' AND pickup_date < '2026-04-01'`,
  );

  // ── Sync runs ──────────────────────────────────────────────────────
  await record(
    "Sync runs — last 24h",
    `SELECT COUNT(*)::int FROM sync_runs WHERE started_at > now() - interval '24 hours'`,
  );
  await record(
    "Sync runs — succeeded last 24h",
    `SELECT COUNT(*)::int FROM sync_runs
     WHERE started_at > now() - interval '24 hours' AND status = 'success'`,
  );

  // ── Sheets ─────────────────────────────────────────────────────────
  await record(
    "Sheet snapshots — total stored",
    `SELECT COUNT(*)::int FROM sheet_load_count_snapshots`,
  );
  await record(
    "Sheet snapshots — most recent week",
    `SELECT COALESCE(MAX(week_start)::text, 'never')
     FROM sheet_load_count_snapshots`,
  );
  await record(
    "Driver roster — rows",
    `SELECT COUNT(*)::int FROM driver_roster`,
  );

  // ── Users ──────────────────────────────────────────────────────────
  await record("Users — total", `SELECT COUNT(*)::int FROM users`);
  await record(
    "Users — magic-link only (NULL pw)",
    `SELECT COUNT(*)::int FROM users WHERE password_hash IS NULL`,
  );

  // ── Render ─────────────────────────────────────────────────────────
  console.log("\n# Numbers Snapshot — " + new Date().toISOString());
  console.log("\n| Metric | Value |");
  console.log("|---|---:|");
  for (const r of rows) {
    console.log(`| ${r.metric} | ${r.value} |`);
  }
  console.log(
    "\n_Read-only audit. Re-run via `tsx backend/scripts/numbers-snapshot.ts` before citing any number externally._",
  );

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
