import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useHeartbeat } from "../../hooks/use-presence";

/**
 * AdminOverview — single consolidated view stitching together the five
 * admin surfaces Jess flagged as "too many tabs" on the Monday call.
 * Each section is a compact summary with a 'view full →' link to the
 * dedicated page for drill-down. Read-only; no edits happen here.
 *
 * Sections:
 *   1. Sheet Truth — last few weeks of sheet vs v2 parity
 *   2. PCS Truth — Q1 capture % + by-customer
 *   3. Discrepancies — open count + recent samples
 *   4. Builder Matrix — current week summary
 *   5. Sheet Status — current week color counts
 */

interface ParityRow {
  weekStart: string;
  weekEnd: string;
  sheetTotalBuilt: number | null;
  v2UniqueCount: number;
  delta: number;
  withinThreshold: boolean;
}

interface PcsTruthData {
  summary?: {
    pcsUniqueQ1?: number;
    coveredLoads?: number;
    realCoveragePct?: number;
  };
  byCustomer?: Array<{
    customer: string;
    pcsLoads: number;
  }>;
}

interface DiscRow {
  id: number;
  discrepancyType: string;
  severity: string | null;
  message: string | null;
  detectedAt: string;
}

interface DiscPayload {
  generatedAt: string;
  summary: { openTotal: number; byType: Record<string, number> };
  discrepancies: DiscRow[];
}

interface BuilderRow {
  builder: string;
  customer: string | null;
  total: number;
}

interface BuilderMatrixData {
  weekStart: string;
  weekEnd: string;
  matrix: BuilderRow[];
}

interface SheetStatusData {
  weekStart: string;
  counts: Array<{ status: string; n: number }>;
  reconciliation: {
    cellsAgree: number;
    cellsDelta: number;
    cellsNoV2Well: number;
    weekDelta: number;
  };
  lastSync: string | null;
}

export function AdminOverview() {
  useHeartbeat({ currentPage: "admin-overview" });

  const sheetParity = useQuery({
    queryKey: ["admin", "overview", "sheet-parity"],
    queryFn: () => api.get<ParityRow[]>("/sheets/loadcount/parity"),
    staleTime: 60_000,
  });

  const pcsTruth = useQuery({
    queryKey: ["admin", "overview", "pcs-truth"],
    queryFn: () => api.get<PcsTruthData>("/diag/pcs-truth"),
    staleTime: 60_000,
  });

  const discrepancies = useQuery({
    queryKey: ["admin", "overview", "discrepancies"],
    queryFn: () => api.get<DiscPayload>("/diag/discrepancies?limit=5"),
    staleTime: 30_000,
  });

  const builderMatrix = useQuery({
    queryKey: ["admin", "overview", "builder-matrix"],
    queryFn: () => api.get<BuilderMatrixData>("/diag/builder-matrix"),
    staleTime: 60_000,
  });

  const sheetStatus = useQuery({
    queryKey: ["admin", "overview", "sheet-status"],
    queryFn: () => api.get<SheetStatusData>("/diag/sheet-status"),
    staleTime: 60_000,
  });

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5 max-w-7xl mx-auto w-full">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-headline">Admin Overview</h1>
          <p className="text-sm text-text-secondary mt-1">
            All five reconciliation surfaces in one view. Click any section
            header to drill into the full page.
          </p>
        </div>
        <span className="text-xs text-text-secondary">
          live · auto-refreshes every minute
        </span>
      </header>

      {/* ───────────── 1. Sheet Truth ───────────── */}
      <Section
        title="Sheet Truth"
        href="/admin/sheet-truth"
        subtitle="Your Load Count Sheet vs v2's count for the same week"
      >
        {sheetParity.isLoading && (
          <div className="text-sm text-text-secondary">Loading…</div>
        )}
        {sheetParity.data && (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-text-secondary border-b border-border">
              <tr>
                <th className="text-left py-2 pr-3">Week</th>
                <th className="text-right py-2 pr-3">Sheet</th>
                <th className="text-right py-2 pr-3">v2</th>
                <th className="text-right py-2 pr-3">Δ</th>
                <th className="text-left py-2">Match</th>
              </tr>
            </thead>
            <tbody>
              {[...(sheetParity.data ?? [])]
                .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
                .slice(0, 5)
                .map((w) => {
                  const sheet = w.sheetTotalBuilt ?? 0;
                  const matchPct =
                    sheet > 0
                      ? Math.max(
                          0,
                          Math.round((1 - Math.abs(w.delta) / sheet) * 1000) /
                            10,
                        )
                      : 0;
                  return (
                    <tr key={w.weekStart} className="border-b border-border/40">
                      <td className="py-1.5 pr-3 font-medium">
                        {w.weekStart} → {w.weekEnd}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {sheet.toLocaleString()}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {w.v2UniqueCount.toLocaleString()}
                      </td>
                      <td
                        className={`py-1.5 pr-3 text-right tabular-nums ${
                          Math.abs(w.delta) <= 5
                            ? "text-emerald-700"
                            : Math.abs(w.delta) > 50
                              ? "text-red-600"
                              : "text-amber-600"
                        }`}
                      >
                        {w.delta >= 0 ? "+" : ""}
                        {w.delta}
                      </td>
                      <td
                        className={`py-1.5 text-sm font-semibold tabular-nums ${
                          matchPct >= 95
                            ? "text-emerald-700"
                            : matchPct >= 80
                              ? "text-amber-600"
                              : "text-red-600"
                        }`}
                      >
                        {matchPct}%
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </Section>

      {/* ───────────── 2. PCS Truth ───────────── */}
      <Section
        title="PCS Truth"
        href="/admin/pcs-truth"
        subtitle="Q1 2026 capture rate against PCS billing"
      >
        {pcsTruth.isLoading && (
          <div className="text-sm text-text-secondary">Loading…</div>
        )}
        {pcsTruth.data?.summary && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat
              label="PCS Q1"
              value={(pcsTruth.data.summary.pcsUniqueQ1 ?? 0).toLocaleString()}
            />
            <Stat
              label="In-scope captured"
              value={(pcsTruth.data.summary.coveredLoads ?? 0).toLocaleString()}
            />
            <Stat
              label="Real coverage"
              value={`${pcsTruth.data.summary.realCoveragePct ?? "—"}%`}
              emphasis
            />
          </div>
        )}
        {pcsTruth.data?.byCustomer && (
          <table className="w-full text-sm mt-4">
            <thead className="text-xs uppercase tracking-wide text-text-secondary border-b border-border">
              <tr>
                <th className="text-left py-2 pr-3">Customer</th>
                <th className="text-right py-2">PCS Q1 loads</th>
              </tr>
            </thead>
            <tbody>
              {pcsTruth.data.byCustomer.slice(0, 6).map((c) => (
                <tr key={c.customer} className="border-b border-border/40">
                  <td className="py-1.5 pr-3">{c.customer}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {c.pcsLoads.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* ───────────── 3. Discrepancies ───────────── */}
      <Section
        title="Discrepancies"
        href="/admin/discrepancies"
        subtitle="Cross-source mismatches — open queue"
      >
        {discrepancies.isLoading && (
          <div className="text-sm text-text-secondary">Loading…</div>
        )}
        {discrepancies.data && (
          <>
            <div className="text-sm mb-3">
              <span className="text-2xl font-bold tabular-nums">
                {discrepancies.data.summary?.openTotal ??
                  discrepancies.data.discrepancies?.length ??
                  0}
              </span>{" "}
              <span className="text-text-secondary">open right now</span>
            </div>
            {discrepancies.data.discrepancies &&
              discrepancies.data.discrepancies.length > 0 && (
                <ul className="space-y-1.5 text-sm">
                  {discrepancies.data.discrepancies.slice(0, 5).map((d) => (
                    <li
                      key={d.id}
                      className="flex items-baseline gap-2 border-b border-border/30 pb-1.5"
                    >
                      <span
                        className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                          d.severity === "critical"
                            ? "bg-red-100 text-red-800"
                            : d.severity === "warning"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-bg-tertiary text-text-secondary"
                        }`}
                      >
                        {d.severity ?? "info"}
                      </span>
                      <span className="text-xs text-text-secondary">
                        {d.discrepancyType}
                      </span>
                      <span className="flex-1 truncate">{d.message}</span>
                    </li>
                  ))}
                </ul>
              )}
          </>
        )}
      </Section>

      {/* ───────────── 4. Builder Matrix ───────────── */}
      <Section
        title="Order of Invoicing"
        href="/admin/builder-matrix"
        subtitle="Bill To × Builder daily totals — current week"
      >
        {builderMatrix.isLoading && (
          <div className="text-sm text-text-secondary">Loading…</div>
        )}
        {builderMatrix.data && (
          <>
            <div className="text-xs text-text-secondary mb-2">
              Week of {builderMatrix.data.weekStart} →{" "}
              {builderMatrix.data.weekEnd}
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-text-secondary border-b border-border">
                <tr>
                  <th className="text-left py-2 pr-3">Builder</th>
                  <th className="text-left py-2 pr-3">Customer</th>
                  <th className="text-right py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {(builderMatrix.data.matrix ?? [])
                  .filter((r) => r.total > 0)
                  .map((r) => (
                    <tr
                      key={`${r.builder}-${r.customer ?? "none"}`}
                      className="border-b border-border/40"
                    >
                      <td className="py-1.5 pr-3 font-medium">{r.builder}</td>
                      <td className="py-1.5 pr-3 text-text-secondary">
                        {r.customer ?? "—"}
                      </td>
                      <td className="py-1.5 text-right tabular-nums font-semibold">
                        {r.total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
      </Section>

      {/* ───────────── 5. Sheet Status ───────────── */}
      <Section
        title="Sheet Status"
        href="/admin/sheet-status"
        subtitle="Painted workflow colors on the Load Count Sheet — current week"
      >
        {sheetStatus.isLoading && (
          <div className="text-sm text-text-secondary">Loading…</div>
        )}
        {sheetStatus.data && (
          <>
            <div className="text-xs text-text-secondary mb-2">
              Week of {sheetStatus.data.weekStart}
              {sheetStatus.data.lastSync && (
                <>
                  {" "}
                  · last synced{" "}
                  {new Date(sheetStatus.data.lastSync).toLocaleString()}
                </>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat
                label="Cells agree"
                value={sheetStatus.data.reconciliation.cellsAgree}
              />
              <Stat
                label="Cells delta"
                value={sheetStatus.data.reconciliation.cellsDelta}
              />
              <Stat
                label="No v2 well"
                value={sheetStatus.data.reconciliation.cellsNoV2Well}
              />
              <Stat
                label="Week Δ"
                value={
                  (sheetStatus.data.reconciliation.weekDelta >= 0 ? "+" : "") +
                  sheetStatus.data.reconciliation.weekDelta
                }
              />
            </div>
            {sheetStatus.data.counts.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {sheetStatus.data.counts.map((c) => (
                  <span
                    key={c.status}
                    className="text-xs px-2 py-0.5 rounded-full bg-bg-tertiary border border-border"
                  >
                    {c.status}: <strong>{c.n}</strong>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  href,
  subtitle,
  children,
}: {
  title: string;
  href: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-bg-primary p-4">
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <div>
          <Link to={href} className="text-base font-semibold hover:text-accent">
            {title} →
          </Link>
          <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string | number;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded border border-border bg-bg-tertiary/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-text-secondary">
        {label}
      </div>
      <div
        className={`tabular-nums ${
          emphasis ? "text-2xl font-bold" : "text-lg font-semibold"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
