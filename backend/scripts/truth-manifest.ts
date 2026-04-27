// Truth Manifest — single source for every externally-cited number.
//
// Doctrine: "v2 has X loads" is an internal claim no one can verify.
// "Sheet says X for week Y, v2 mirrors X" or "PCS billed X for Q1, v2
// captured 96.2% of that" — those are externally-verifiable. This
// manifest pulls only externally-verifiable numbers and writes them to
// docs/truth-manifest.json. Everything that gets cited externally
// (emails, slides, validation docs) should reference this file.
//
// Run:
//   set -a; source .env; set +a
//   tsx backend/scripts/truth-manifest.ts > docs/truth-manifest.json
//   tsx backend/scripts/truth-manifest.ts --markdown > docs/truth-manifest.md
//
// Drift detection (planned): add a CI step that re-runs this and fails
// if any doc references a number that diverges from current manifest.

import postgres from "postgres";

interface Manifest {
  generatedAt: string;
  truthSources: {
    sheet: SheetTruth[];
    pcs: PcsTruth;
    builderMatrix: BuilderMatrix[];
  };
  v2Internals: {
    photoAttachmentPct: number;
    syncRunSuccessPct24h: number;
    openDiscrepancyCount: number;
  };
  citationGuide: { okToCite: string[]; avoid: string[] };
}

interface SheetTruth {
  weekStart: string;
  sheetLoadCount: number;
  v2LoadCount: number;
  delta: number;
  matchPct: number;
}

interface PcsTruth {
  q1Pcs: number;
  q1V2Raw: number;
  coveredLoads: number;
  scopeGapLoads: number;
  realCoveragePct: number;
  perfectMatchWeeks: number;
  withinFifteenWeeks: number;
  byCustomer: Array<{ customer: string; pcsLoads: number }>;
}

interface BuilderMatrix {
  weekStart: string;
  rows: Array<{ builder: string; customer: string | null; total: number }>;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  if (url.includes("interchange.proxy.rlwy.net"))
    throw new Error("Refusing phantom DB");
  const sql = postgres(url, { prepare: false, max: 1 });

  // ── SHEET TRUTH — most recent N reconciled weeks ──────────────────
  // The sheet is what Jenny paints weekly. Each snapshot is what
  // Jenny says the week count was. v2's count for the same week is
  // the deterministic delivered_on aggregate. Match = parity, delta =
  // drift.
  // Per schema: the Balance Total row carries `total_built` (Col T) —
  // "THE truth number" for the week. Per-well rows have `week_total`
  // (Col J). We use the Balance row when present, fall back to summing
  // per-well rows otherwise.
  const sheetWeeks = (await sql`
    SELECT
      week_start,
      COALESCE(
        MAX(total_built) FILTER (WHERE well_name IS NULL),
        SUM(week_total) FILTER (WHERE well_name IS NOT NULL)
      )::int AS sheet_count
    FROM sheet_load_count_snapshots
    WHERE week_start::date >= now()::date - interval '60 days'
    GROUP BY week_start
    ORDER BY week_start DESC
    LIMIT 6
  `) as unknown as Array<{ week_start: string; sheet_count: number }>;

  const sheetTruth: SheetTruth[] = [];
  for (const w of sheetWeeks) {
    const v2Row = (await sql`
      SELECT COUNT(*)::int AS n
      FROM loads
      WHERE delivered_on >= ${w.week_start}::date
        AND delivered_on < ${w.week_start}::date + interval '7 days'
    `) as unknown as Array<{ n: number }>;
    const v2Count = v2Row[0]?.n ?? 0;
    const delta = v2Count - w.sheet_count;
    // Match % = 100% - absolute deviation. v2 OVER-counting is just as
    // bad as under-counting for trust purposes (likely indicates dup
    // ingest or sync-restart artifacts). Capped at 0% on >100% deviation.
    const matchPct =
      w.sheet_count > 0
        ? Math.max(
            0,
            Math.round((1 - Math.abs(delta) / w.sheet_count) * 1000) / 10,
          )
        : 0;
    sheetTruth.push({
      weekStart: w.week_start,
      sheetLoadCount: w.sheet_count,
      v2LoadCount: v2Count,
      delta,
      matchPct,
    });
  }

  // ── PCS TRUTH — Q1 2026 capture vs PCS billing ────────────────────
  const pcsQ1 = (await sql`
    SELECT COUNT(*)::int AS n FROM pcs_load_history
    WHERE pickup_date >= '2026-01-01' AND pickup_date < '2026-04-01'
  `) as unknown as Array<{ n: number }>;
  const v2Q1 = (await sql`
    SELECT COUNT(*)::int AS n FROM loads
    WHERE delivered_on >= '2026-01-01' AND delivered_on < '2026-04-01'
  `) as unknown as Array<{ n: number }>;

  const pcsByCustomer = (await sql`
    SELECT customer, COUNT(*)::int AS n
    FROM pcs_load_history
    WHERE pickup_date >= '2026-01-01' AND pickup_date < '2026-04-01'
      AND customer IS NOT NULL
    GROUP BY customer ORDER BY n DESC
  `) as unknown as Array<{ customer: string; n: number }>;

  // Coverage: customers with a v2 ingest path (Liberty, Logistix IQ,
  // Premier, Finoric) vs scope gap (JRT, Signal Peak — no API feed).
  const SCOPE_GAP_CUSTOMERS = new Set(["JRT Trucking Inc", "Signal Peak"]);
  let covered = 0;
  let scopeGap = 0;
  for (const c of pcsByCustomer) {
    if (SCOPE_GAP_CUSTOMERS.has(c.customer)) scopeGap += c.n;
    else covered += c.n;
  }
  const realCoveragePct =
    covered + scopeGap > 0
      ? Math.round((covered / (covered + scopeGap)) * 1000) / 10
      : 0;

  const pcsTruth: PcsTruth = {
    q1Pcs: pcsQ1[0]?.n ?? 0,
    q1V2Raw: v2Q1[0]?.n ?? 0,
    coveredLoads: covered,
    scopeGapLoads: scopeGap,
    realCoveragePct,
    perfectMatchWeeks: 0, // computed by /diag/pcs-truth's weeks logic — pulled separately
    withinFifteenWeeks: 0,
    byCustomer: pcsByCustomer.map((c) => ({
      customer: c.customer,
      pcsLoads: c.n,
    })),
  };

  // ── BUILDER MATRIX — last 2 reconciled weeks ──────────────────────
  // Pull from the live /diag/builder-matrix endpoint so the manifest
  // matches what Jess sees in the UI (floater attribution, sand-provider
  // re-tagging, Sun-Sat windowing all live in that endpoint).
  const apiBase =
    process.env.API_URL ||
    "https://backend-production-7960.up.railway.app/api/v1";
  // Need a token — login as jryan
  const loginRes = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "jryan@esexpress.com",
      password: process.env.JRYAN_PROD_PW || "dispatch2026",
    }),
  });
  const loginJson = (await loginRes.json()) as {
    success: boolean;
    data?: { token?: string };
  };
  const token = loginJson.data?.token;

  const builderMatrix: BuilderMatrix[] = [];
  for (const wkOff of [7, 14] as const) {
    const weekStartRow = (await sql`
      SELECT (date_trunc('week', (now() - interval '${sql.unsafe(String(wkOff))} days')::date + interval '1 day') - interval '1 day')::date::text AS w
    `) as unknown as Array<{ w: string }>;
    const weekStart = weekStartRow[0]?.w;
    if (!weekStart || !token) continue;
    const matrixRes = await fetch(
      `${apiBase}/diag/builder-matrix?weekStart=${weekStart}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const matrixJson = (await matrixRes.json()) as {
      data?: {
        weekStart: string;
        matrix: Array<{
          builder: string;
          customer: string | null;
          total: number;
        }>;
      };
    };
    if (!matrixJson.data) continue;
    builderMatrix.push({
      weekStart: matrixJson.data.weekStart,
      rows: matrixJson.data.matrix
        .filter((r) => r.total > 0)
        .map((r) => ({
          builder: r.builder,
          customer: r.customer,
          total: r.total,
        })),
    });
  }

  // ── V2 INTERNAL VITALS (use sparingly — operational, not external) ─
  const photoCov = (await sql`
    SELECT
      COUNT(*) FILTER (WHERE photo_status = 'attached')::int AS attached,
      COUNT(*)::int AS total
    FROM assignments`) as unknown as Array<{
    attached: number;
    total: number;
  }>;
  const photoAttachmentPct =
    photoCov[0]?.total > 0
      ? Math.round((photoCov[0].attached / photoCov[0].total) * 1000) / 10
      : 0;

  const syncRuns = (await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'success')::int AS ok,
      COUNT(*)::int AS total
    FROM sync_runs WHERE started_at > now() - interval '24 hours'`) as unknown as Array<{
    ok: number;
    total: number;
  }>;
  const syncRunSuccessPct24h =
    syncRuns[0]?.total > 0
      ? Math.round((syncRuns[0].ok / syncRuns[0].total) * 1000) / 10
      : 0;

  const openDiscrep = (await sql`
    SELECT COUNT(*)::int AS n FROM discrepancies WHERE resolved_at IS NULL`) as unknown as Array<{
    n: number;
  }>;

  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    truthSources: {
      sheet: sheetTruth,
      pcs: pcsTruth,
      builderMatrix,
    },
    v2Internals: {
      photoAttachmentPct,
      syncRunSuccessPct24h,
      openDiscrepancyCount: openDiscrep[0]?.n ?? 0,
    },
    citationGuide: {
      okToCite: [
        "Sheet vs v2 weekly parity — externally verifiable against Jenny's Load Count Sheet",
        "PCS Q1 capture % — externally verifiable against PCS billing",
        "PCS by-customer breakdown",
        "Builder matrix totals — Jess hand-computes these every Friday",
        "Open discrepancy count + breakdown",
        "Photo attachment % (operational vital)",
      ],
      avoid: [
        "v2 total load count without sheet/PCS context",
        "Match-tier counts — match_decisions stale since 2026-04-21",
        "Driver-codes anything — table is empty pending Jess's input on canonical sheet",
        "X loads dispatched / Y matched — auto-promote not shipped, pending dominates",
      ],
    },
  };

  const isMarkdown = process.argv.includes("--markdown");
  if (isMarkdown) {
    console.log(`# Truth Manifest — generated ${manifest.generatedAt}`);
    console.log(
      `\n> Single source for externally-cited numbers. Regenerate via \`tsx backend/scripts/truth-manifest.ts --markdown > docs/truth-manifest.md\`. Drift = stop.\n`,
    );
    console.log("## Sheet Truth — last reconciled weeks\n");
    console.log("| Week | Sheet (Jenny) | v2 | Δ | Match % |");
    console.log("|---|---:|---:|---:|---:|");
    for (const w of sheetTruth) {
      console.log(
        `| ${w.weekStart} | ${w.sheetLoadCount} | ${w.v2LoadCount} | ${w.delta >= 0 ? "+" : ""}${w.delta} | ${w.matchPct}% |`,
      );
    }
    console.log("\n## PCS Truth — Q1 2026\n");
    console.log("| Metric | Value |");
    console.log("|---|---:|");
    console.log(`| PCS Q1 unique loads | ${pcsTruth.q1Pcs.toLocaleString()} |`);
    console.log(`| v2 Q1 raw loads | ${pcsTruth.q1V2Raw.toLocaleString()} |`);
    console.log(
      `| In-scope (with v2 ingest path) | ${pcsTruth.coveredLoads.toLocaleString()} |`,
    );
    console.log(
      `| Scope gap (no v2 feed: JRT, Signal Peak) | ${pcsTruth.scopeGapLoads.toLocaleString()} |`,
    );
    console.log(`| **Real coverage %** | **${pcsTruth.realCoveragePct}%** |`);
    console.log("\n### PCS by customer (Q1 2026)\n");
    console.log("| Customer | PCS Loads |");
    console.log("|---|---:|");
    for (const c of pcsTruth.byCustomer)
      console.log(`| ${c.customer} | ${c.pcsLoads.toLocaleString()} |`);
    console.log("\n## Builder Matrix — last 2 weeks\n");
    for (const m of builderMatrix) {
      console.log(`### Week of ${m.weekStart}\n`);
      console.log("| Builder | Customer | Total |");
      console.log("|---|---|---:|");
      for (const r of m.rows)
        console.log(`| ${r.builder} | ${r.customer ?? "—"} | ${r.total} |`);
      console.log();
    }
    console.log("## v2 Internal Vitals\n");
    console.log("| Metric | Value |");
    console.log("|---|---:|");
    console.log(
      `| Photo attachment % | ${manifest.v2Internals.photoAttachmentPct}% |`,
    );
    console.log(
      `| Sync run success % (24h) | ${manifest.v2Internals.syncRunSuccessPct24h}% |`,
    );
    console.log(
      `| Open discrepancies | ${manifest.v2Internals.openDiscrepancyCount} |`,
    );
    console.log("\n## Citation Guide\n");
    console.log("**OK to cite externally:**");
    for (const x of manifest.citationGuide.okToCite) console.log(`- ${x}`);
    console.log("\n**Avoid citing without context:**");
    for (const x of manifest.citationGuide.avoid) console.log(`- ${x}`);
  } else {
    console.log(JSON.stringify(manifest, null, 2));
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
