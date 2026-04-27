import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useHeartbeat } from "../../hooks/use-presence";

/**
 * PCS Truth — LIVE parity between v2's ingested loads and PCS's billing
 * record (the system that pays everyone). Computed every request from
 * pcs_load_history ⨝ loads via /api/v1/diag/pcs-truth.
 *
 * Source population: warehouse extract loaded into pcs_load_history. Phase 2
 * wires PCS Invoice API for ongoing self-refresh without operator drops.
 */

interface WeekRow {
  weekStart: string;
  weekEnd: string;
  pcsUnique: number;
  v2Raw: number;
  delta: number;
  status: "perfect" | "match" | "investigate" | "v2_over";
}

interface GapBucket {
  bucket: string;
  estimated: number;
  evidence: string;
}

interface SecondaryFinding {
  title: string;
  detail: string;
}

interface TruthPayload {
  live: boolean;
  computedAt: string;
  snapshot: {
    totalRows: number;
    latestSnapshot: string | null;
    latestImport: string | null;
  };
  summary: {
    pcsUniqueQ1: number;
    v2RawQ1: number;
    capturePct: number;
    totalDelta: number;
    perfectMatchWeeks: number;
    withinFifteenWeeks: number;
    coveredLoads: number;
    scopeGapLoads: number;
    realCoveragePct: number;
  };
  byCustomer: Array<{
    customer: string;
    pcsLoads: number;
    v2Feed: string;
    status: "covered" | "scope_gap" | "trivial";
  }>;
  weeks: WeekRow[];
  gapAttribution: GapBucket[];
  secondaryFindings: SecondaryFinding[];
}

function formatDate(s: string): string {
  const [, m, d] = s.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function statusTone(status: WeekRow["status"]): {
  tone: "perfect" | "ok" | "warn" | "v2_over";
  label: string;
} {
  if (status === "perfect") return { tone: "perfect", label: "Perfect" };
  if (status === "match") return { tone: "ok", label: "Match" };
  if (status === "v2_over") return { tone: "v2_over", label: "v2 over" };
  return { tone: "warn", label: "Investigate" };
}

const TONE_BG: Record<string, string> = {
  perfect:
    "bg-emerald-50 border-emerald-300",
  ok: "bg-green-50 border-green-200",
  warn: "bg-amber-50 border-amber-200",
  v2_over: "bg-blue-50 border-blue-200",
};
const TONE_DOT: Record<string, string> = {
  perfect: "bg-emerald-500",
  ok: "bg-green-500",
  warn: "bg-amber-500",
  v2_over: "bg-blue-500",
};

export function PcsTruth() {
  useHeartbeat({ currentPage: "admin-pcs-truth" });

  const truthQuery = useQuery({
    queryKey: ["admin", "pcs-truth"],
    queryFn: () =>
      api
        .get<{ success: boolean; data: TruthPayload }>("/diag/pcs-truth")
        ,
    staleTime: 60_000,
  });

  const data = truthQuery.data;
  const sortedWeeks = useMemo(
    () =>
      [...(data?.weeks ?? [])].sort((a, b) =>
        b.weekStart.localeCompare(a.weekStart),
      ),
    [data],
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col p-4 sm:p-6 gap-4 max-w-7xl w-full mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">PCS Truth</h1>
          <p className="text-sm text-text-secondary max-w-3xl">
            Live parity vs the system that pays everyone. v2's ingest joined
            against PCS's load_history every request — as discrepancies resolve
            and v2 grows, the numbers tick up automatically. Source extract:{" "}
            <code className="bg-bg-secondary px-1 rounded">
              {data?.snapshot.latestSnapshot ?? "—"}
            </code>
            {data?.snapshot.totalRows
              ? ` (${data.snapshot.totalRows.toLocaleString()} rows)`
              : ""}
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/sheet-truth"
            className="text-sm text-accent underline-offset-4 hover:underline"
          >
            Sheet Truth →
          </Link>
        </div>
      </header>

      {truthQuery.isLoading && (
        <div className="text-sm text-text-secondary">Loading...</div>
      )}
      {truthQuery.isError && (
        <div className="text-sm text-red-500">
          Failed to load PCS truth snapshot. Backend may not have shipped the
          warehouse JSON yet.
        </div>
      )}

      {data && (
        <>
          {/* Headline — real coverage on the carriers we have feeds for */}
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5">
            <div className="text-xs uppercase tracking-wide text-emerald-700">
              Q1 2026 Coverage — feeds we have
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <div className="text-4xl font-bold text-emerald-700">
                {data.summary.realCoveragePct}%
              </div>
              <div className="text-sm text-text-secondary">
                <strong className="text-text-primary">
                  {data.summary.coveredLoads.toLocaleString()}
                </strong>{" "}
                of{" "}
                <strong className="text-text-primary">
                  {(
                    data.summary.coveredLoads + data.summary.scopeGapLoads
                  ).toLocaleString()}
                </strong>{" "}
                PCS loads where v2 has a carrier feed
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-secondary">
              <span>
                Total PCS Q1:{" "}
                <strong className="text-text-primary">
                  {data.summary.pcsUniqueQ1.toLocaleString()}
                </strong>
              </span>
              <span>
                v2 raw:{" "}
                <strong className="text-text-primary">
                  {data.summary.v2RawQ1.toLocaleString()}
                </strong>
              </span>
              <span>
                No-feed scope items:{" "}
                <strong className="text-text-primary">
                  {data.summary.scopeGapLoads.toLocaleString()}
                </strong>
              </span>
              <span>
                Perfect-match weeks:{" "}
                <strong className="text-text-primary">
                  {data.summary.perfectMatchWeeks}
                </strong>
              </span>
            </div>
          </div>

          {/* By-customer breakdown — what v2 covers vs what's still on the table */}
          <section className="rounded-lg border border-border bg-bg-secondary p-4">
            <h2 className="text-lg font-semibold mb-1">Coverage by customer</h2>
            <p className="text-sm text-text-secondary mb-3">
              Every PCS-billed customer in Q1 2026, mapped to the v2 feed that
              captures them. Scope-gap rows are the carriers v2 doesn't ingest
              yet — clean engineering items, not matcher failures.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-text-secondary border-b border-border">
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4 text-right">PCS Q1 loads</th>
                    <th className="py-2 pr-4">v2 feed</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byCustomer.map((c) => (
                    <tr key={c.customer} className="border-b border-border/40">
                      <td className="py-2 pr-4 font-medium">{c.customer}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {c.pcsLoads.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-text-secondary">
                        {c.v2Feed}
                      </td>
                      <td className="py-2">
                        {c.status === "covered" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Covered
                          </span>
                        )}
                        {c.status === "scope_gap" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 border border-amber-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Scope gap
                          </span>
                        )}
                        {c.status === "trivial" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700 border border-slate-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                            Trivial
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Per-week parity cards */}
          <div className="grid gap-3">
            {sortedWeeks.map((row) => {
              const tone = statusTone(row.status);
              const deltaSign = row.delta > 0 ? "+" : "";
              return (
                <div
                  key={row.weekStart}
                  className={`rounded-lg border p-4 ${TONE_BG[tone.tone]}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${TONE_DOT[tone.tone]}`}
                      />
                      <h2 className="text-lg font-semibold">
                        Week of {formatDate(row.weekStart)} –{" "}
                        {formatDate(row.weekEnd)}
                      </h2>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase text-text-secondary">
                        Status
                      </div>
                      <div className="text-sm font-semibold">{tone.label}</div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <Stat
                      label="PCS Unique"
                      value={row.pcsUnique.toLocaleString()}
                      emphasis
                    />
                    <Stat
                      label="v2 Raw"
                      value={row.v2Raw.toLocaleString()}
                      emphasis
                    />
                    <Stat
                      label="Delta"
                      value={`${deltaSign}${row.delta.toLocaleString()}`}
                      emphasis
                      toneOverride={tone.tone}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Gap attribution */}
          <section className="rounded-lg border border-border bg-bg-secondary p-4">
            <h2 className="text-lg font-semibold mb-1">
              What the {Math.abs(data.summary.totalDelta)}-load gap is
            </h2>
            <p className="text-sm text-text-secondary mb-3">
              Reconciled against tonight's findings. The "real" v2 unique count
              is lower than v2 raw (Logistiq triplicates inflate it), so the
              actual coverage gap is well inside 5%.
            </p>
            <div className="grid gap-2">
              {data.gapAttribution.map((g) => (
                <div
                  key={g.bucket}
                  className="rounded-md border border-border bg-bg-primary/40 p-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-sm font-medium">{g.bucket}</div>
                    <div className="text-sm font-semibold tabular-nums">
                      ~{g.estimated} loads
                    </div>
                  </div>
                  <div className="text-xs text-text-secondary mt-1">
                    {g.evidence}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Secondary findings */}
          <section className="rounded-lg border border-border bg-bg-secondary p-4">
            <h2 className="text-lg font-semibold mb-3">
              What the warehouse pull also taught us
            </h2>
            <div className="grid gap-2">
              {data.secondaryFindings.map((f) => (
                <div
                  key={f.title}
                  className="rounded-md border border-border bg-bg-primary/40 p-3"
                >
                  <div className="text-sm font-medium">{f.title}</div>
                  <div className="text-xs text-text-secondary mt-1">
                    {f.detail}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <footer className="text-xs text-text-secondary border-t border-border pt-3 mt-2 space-y-1">
            <div>
              Computed live from <code>pcs_load_history</code> ⨝{" "}
              <code>loads</code> at {new Date(data.computedAt).toLocaleString()}
              .
            </div>
            <div>
              Window: PCS warehouse extract loaded{" "}
              {data.snapshot.latestImport
                ? new Date(data.snapshot.latestImport).toLocaleDateString()
                : "—"}{" "}
              ({data.snapshot.totalRows.toLocaleString()} unique loads). v2
              ingest extends past the warehouse window.
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  emphasis,
  toneOverride,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  toneOverride?: "perfect" | "ok" | "warn" | "v2_over" | null;
}) {
  const valueClass =
    toneOverride === "warn"
      ? "text-amber-600"
      : toneOverride === "perfect"
        ? "text-emerald-700"
        : toneOverride === "v2_over"
          ? "text-blue-600"
          : "text-text-primary";
  return (
    <div className="rounded-md bg-bg-primary/40 border border-border px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-text-secondary">
        {label}
      </div>
      <div
        className={`${emphasis ? "text-xl font-semibold" : "text-base"} ${valueClass}`}
      >
        {value}
      </div>
    </div>
  );
}
