// Q1 2026 Tri-Directional Reconciliation
//
// Three external truth lenses on the same Q1 dataset:
//   1. PCS (operator's billing system) — pcs_load_history table
//   2. Sheet (Jenny's hand-painted Load Count Sheet) — sheet_load_count_snapshots
//   3. Sources (PropX + Logistiq + JotForm) — loads + bol_submissions tables
//
// Output: per-customer breakdown with all three counts, photo coverage,
// billing state, and the v2 URLs Jess can drill into for each row.

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const Q1_START = "2026-01-01";
  const Q1_END = "2026-04-01";

  console.log(`# Q1 2026 Tri-Recon — ${new Date().toISOString()}\n`);
  console.log(`Window: ${Q1_START} → ${Q1_END}\n`);

  // ── PCS: per-customer Q1 totals ────────────────────────────────────
  const pcs = (await sql`
    SELECT customer, COUNT(*)::int AS n
    FROM pcs_load_history
    WHERE pickup_date >= ${Q1_START} AND pickup_date < ${Q1_END}
      AND customer IS NOT NULL
    GROUP BY customer ORDER BY n DESC`) as unknown as Array<{
    customer: string;
    n: number;
  }>;

  // ── Sheet: per-bill-to Q1 totals — RESOLVED through customer_mappings ─
  // Sheet Bill To is freeform text (5+ Liberty spellings, 4+ Logistix IQ
  // spellings). LEFT JOIN customer_mappings resolves sheet variants to
  // the canonical customer name so the tri-recon row aligns with PCS.
  // Falls back to raw bill_to when no mapping exists.
  const sheet = (await sql`
    SELECT
      COALESCE(cm.canonical_name, s.bill_to, '(unattributed)') AS bill_to,
      SUM(s.week_total)::int AS sheet_total
    FROM sheet_load_count_snapshots s
    LEFT JOIN customer_mappings cm ON cm.source_name = s.bill_to
    WHERE s.week_start::date >= ${Q1_START}::date
      AND s.week_start::date < ${Q1_END}::date
      AND s.well_name IS NOT NULL
      AND s.week_total IS NOT NULL
    GROUP BY COALESCE(cm.canonical_name, s.bill_to, '(unattributed)')
    ORDER BY sheet_total DESC`) as unknown as Array<{
    bill_to: string;
    sheet_total: number;
  }>;

  // ── v2: per-customer Q1 totals by source ───────────────────────────
  const v2 = (await sql`
    SELECT
      COALESCE(c.name, '(NULL Bill To)') AS customer,
      l.source,
      COUNT(*)::int AS n,
      COUNT(*) FILTER (WHERE a.photo_status = 'attached')::int AS photo_attached,
      COUNT(*) FILTER (WHERE a.photo_status = 'pending')::int AS photo_pending,
      COUNT(*) FILTER (WHERE a.photo_status = 'missing')::int AS photo_missing,
      COUNT(*) FILTER (WHERE l.raw_data->>'invoice_id' IS NOT NULL
                         AND l.raw_data->>'invoice_id' <> 'null')::int AS has_invoice
    FROM loads l
    LEFT JOIN customers c ON c.id = l.customer_id
    LEFT JOIN assignments a ON a.load_id = l.id
    WHERE l.delivered_on >= ${Q1_START}
      AND l.delivered_on < ${Q1_END}
    GROUP BY c.name, l.source
    ORDER BY c.name NULLS LAST, n DESC`) as unknown as Array<{
    customer: string;
    source: string;
    n: number;
    photo_attached: number;
    photo_pending: number;
    photo_missing: number;
    has_invoice: number;
  }>;

  // ── Build aligned per-customer rows ────────────────────────────────
  const allCustomers = new Set<string>();
  for (const r of pcs) allCustomers.add(r.customer);
  for (const r of sheet) allCustomers.add(r.bill_to);
  for (const r of v2) allCustomers.add(r.customer);

  console.log(`## Per-customer reconciliation\n`);
  console.log(
    `| Customer | PCS | Sheet | v2 PropX | v2 Logistiq | v2 JotForm | v2 Total | Δ vs PCS | Photo % | Invoice % |`,
  );
  console.log(`|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);

  // Sort by PCS count desc, fall back to v2 total
  const sorted = [...allCustomers].sort((a, b) => {
    const pa = pcs.find((p) => p.customer === a)?.n ?? 0;
    const pb = pcs.find((p) => p.customer === b)?.n ?? 0;
    return pb - pa;
  });

  let pcsTotal = 0,
    sheetTotal = 0,
    v2Total = 0;
  for (const cust of sorted) {
    const pcsN = pcs.find((p) => p.customer === cust)?.n ?? 0;
    const sheetN = sheet.find((s) => s.bill_to === cust)?.sheet_total ?? 0;
    const v2Rows = v2.filter((r) => r.customer === cust);
    const v2Propx = v2Rows.find((r) => r.source === "propx")?.n ?? 0;
    const v2Lgx = v2Rows.find((r) => r.source === "logistiq")?.n ?? 0;
    const v2Jot = v2Rows.find((r) => r.source === "jotform")?.n ?? 0;
    const v2N = v2Rows.reduce((a, r) => a + r.n, 0);
    const photoOk = v2Rows.reduce((a, r) => a + r.photo_attached, 0);
    const inv = v2Rows.reduce((a, r) => a + r.has_invoice, 0);
    const photoPct = v2N > 0 ? Math.round((photoOk / v2N) * 100) : 0;
    const invPct = v2N > 0 ? Math.round((inv / v2N) * 100) : 0;
    const delta = v2N - pcsN;
    pcsTotal += pcsN;
    sheetTotal += sheetN;
    v2Total += v2N;
    console.log(
      `| ${cust.slice(0, 30)} | ${pcsN.toLocaleString()} | ${sheetN.toLocaleString()} | ${v2Propx} | ${v2Lgx} | ${v2Jot} | ${v2N.toLocaleString()} | ${delta >= 0 ? "+" : ""}${delta.toLocaleString()} | ${photoPct}% | ${invPct}% |`,
    );
  }
  console.log(
    `| **TOTAL** | **${pcsTotal.toLocaleString()}** | **${sheetTotal.toLocaleString()}** | — | — | — | **${v2Total.toLocaleString()}** | **${v2Total - pcsTotal >= 0 ? "+" : ""}${(v2Total - pcsTotal).toLocaleString()}** | — | — |`,
  );

  // ── Source-only sub-totals (no customer attribution required) ──────
  console.log(`\n## v2 Q1 by source (raw, all customers)\n`);
  const v2BySrc = (await sql`
    SELECT source, COUNT(*)::int AS n,
           COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM photos p WHERE p.load_id = l.id))::int AS with_photo
    FROM loads l
    WHERE delivered_on >= ${Q1_START} AND delivered_on < ${Q1_END}
    GROUP BY source ORDER BY n DESC`) as unknown as Array<{
    source: string;
    n: number;
    with_photo: number;
  }>;
  console.log(`| Source | Loads | With photo row | Photo % |`);
  console.log(`|---|---:|---:|---:|`);
  for (const r of v2BySrc) {
    const pct = r.n > 0 ? Math.round((r.with_photo / r.n) * 100) : 0;
    console.log(
      `| ${r.source} | ${r.n.toLocaleString()} | ${r.with_photo.toLocaleString()} | ${pct}% |`,
    );
  }

  // ── BOL submissions (driver-uploaded photos) for Q1 ────────────────
  console.log(`\n## Driver BOL submissions Q1\n`);
  const bolStats = (await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE matched_load_id IS NOT NULL)::int AS matched,
      COUNT(*) FILTER (WHERE ai_extracted_data IS NOT NULL)::int AS ai_extracted,
      COUNT(*) FILTER (WHERE status = 'matched')::int AS status_matched,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS status_pending
    FROM bol_submissions
    WHERE created_at >= ${Q1_START} AND created_at < ${Q1_END}`) as unknown as Array<{
    total: number;
    matched: number;
    ai_extracted: number;
    status_matched: number;
    status_pending: number;
  }>;
  const b = bolStats[0];
  console.log(`| Metric | Value | % |`);
  console.log(`|---|---:|---:|`);
  console.log(`| Total BOL submissions | ${b.total.toLocaleString()} | 100% |`);
  console.log(
    `| Matched to a v2 load | ${b.matched.toLocaleString()} | ${b.total > 0 ? Math.round((b.matched / b.total) * 100) : 0}% |`,
  );
  console.log(
    `| AI-extracted data present | ${b.ai_extracted.toLocaleString()} | ${b.total > 0 ? Math.round((b.ai_extracted / b.total) * 100) : 0}% |`,
  );

  // ── Billing state summary (from raw_data invoice_id) ───────────────
  console.log(`\n## Billing state across v2 Q1 loads\n`);
  const billing = (await sql`
    SELECT
      CASE
        WHEN raw_data->>'invoice_id' IS NOT NULL AND raw_data->>'invoice_id' <> 'null'
          THEN 'invoiced'
        WHEN raw_data->>'billing_status' = 'ReadyToBill' THEN 'ready_to_bill'
        WHEN raw_data->>'billing_status' = 'New' THEN 'new'
        ELSE 'other_or_null'
      END AS billing_state,
      COUNT(*)::int AS n
    FROM loads
    WHERE delivered_on >= ${Q1_START} AND delivered_on < ${Q1_END}
      AND source = 'logistiq'
    GROUP BY billing_state ORDER BY n DESC`) as unknown as Array<{
    billing_state: string;
    n: number;
  }>;
  console.log(`| Billing state (Logistiq Q1) | Loads |`);
  console.log(`|---|---:|`);
  for (const r of billing)
    console.log(`| ${r.billing_state} | ${r.n.toLocaleString()} |`);

  // ── Drill-down map ──────────────────────────────────────────────────
  console.log(`\n## Where to drill into each lens (in v2)\n`);
  console.log(`| Lens | Surface | Drill-down |`);
  console.log(`|---|---|---|`);
  console.log(
    `| **PCS Truth** | \`/admin/pcs-truth\` | Per-customer + per-week capture %, gap attribution, missed-by-v2 list |`,
  );
  console.log(
    `| **Sheet Truth** | \`/admin/sheet-truth\` | Side-by-side sheet vs v2 by week, color key, drift discrepancies |`,
  );
  console.log(
    `| **PropX/Logistiq sources** | \`/workbench\` (current) + \`/workbench?week=YYYY-MM-DD\` | Click any cell → drawer with per-load source/driver/BOL/photo |`,
  );
  console.log(
    `| **JotForm submissions** | \`/bol\` | All driver photo submissions, match status, manual-match panel |`,
  );
  console.log(
    `| **Discrepancies** | \`/admin/discrepancies\` | Open + resolved cross-source mismatches (status/weight/photo/well/sheet drift) |`,
  );
  console.log(
    `| **Per-load detail** | \`/load-report?load=ID\` | Single load — all 3 sources side by side, photo, audit log |`,
  );
  console.log(
    `| **Builder matrix** | \`/admin/builder-matrix\` | Order of Invoicing — what Jess hand-builds Friday |`,
  );
  console.log(
    `| **Missed-by-v2** | \`/admin/missed-loads-report\` | PCS loads with no v2 record (scope-gap diagnostic) |`,
  );

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
