import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useHeartbeat } from "../../hooks/use-presence";

interface DupBol {
  bolNo: string | null;
  count: number;
  sources: string;
  loadIds: string;
  latestDelivery: string | null;
}
interface SyncRun {
  id: number;
  source: string;
  status: string;
  startedAt: string;
  durationMs: number | null;
  recordsProcessed: number | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
}
interface MissingFieldsLoad {
  id: number;
  source: string;
  loadNo: string;
  destinationName: string | null;
  deliveredOn: string | null;
  createdAt: string;
}
interface StaleLoad {
  id: number;
  source: string;
  loadNo: string;
  driverName: string | null;
  deliveredOn: string | null;
  createdAt: string;
  lagDays: number;
}

interface MissedLoadsReport {
  generatedAt: string;
  summary: {
    duplicateBolGroups: number;
    syncErrorRuns: number;
    missingCriticalFields: number;
    staleSyncLoads: number;
  };
  duplicateBols: DupBol[];
  syncErrors: SyncRun[];
  missingCriticalFields: MissingFieldsLoad[];
  staleSyncLoads: StaleLoad[];
}

function fmtDate(s: string | null): string {
  if (!s) return "--";
  const d = new Date(s);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MissedLoadsReport() {
  useHeartbeat({ currentPage: "missed-loads" });
  const reportQuery = useQuery({
    queryKey: ["diag", "missed-loads"],
    queryFn: () => api.get<MissedLoadsReport>("/diag/missed-loads"),
    staleTime: 30_000,
  });

  const data = reportQuery.data;

  return (
    <div className="flex flex-col h-full">
      <div className="px-7 pt-5 pb-4 border-b border-outline-variant/40 bg-surface-container-lowest header-gradient shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 bg-primary rounded-sm shrink-0" />
            <div>
              <h1 className="font-headline text-[22px] font-extrabold tracking-tight text-on-surface uppercase leading-tight">
                Missed Loads Report
              </h1>
              <p className="text-[11px] font-medium text-outline tracking-[0.08em] uppercase mt-0.5">
                Diagnostics // Sync gaps + duplicates
              </p>
            </div>
          </div>
          <button
            onClick={() => reportQuery.refetch()}
            disabled={reportQuery.isFetching}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-outline-variant/40 text-xs font-bold uppercase tracking-wide text-on-surface/70 hover:bg-surface-container-high disabled:opacity-40 cursor-pointer transition-all"
          >
            <span className="material-symbols-outlined text-[14px]">
              refresh
            </span>
            {reportQuery.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-7 pt-5 pb-6 space-y-6">
        {reportQuery.isLoading && (
          <div className="text-on-surface/40 text-sm">Loading report…</div>
        )}

        {reportQuery.isError && (
          <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-sm text-error">
            Failed to load report:{" "}
            {(reportQuery.error as Error)?.message ?? "unknown error"}
          </div>
        )}

        {data && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-3">
              {[
                {
                  label: "Duplicate BOL groups",
                  value: data.summary.duplicateBolGroups,
                  hint: "Same BOL appearing on 2+ loads",
                },
                {
                  label: "Sync errors (7d)",
                  value: data.summary.syncErrorRuns,
                  hint: "Failed sync runs in the last week",
                },
                {
                  label: "No driver / BOL / ticket",
                  value: data.summary.missingCriticalFields,
                  hint: "Loads with all three identifiers blank",
                },
                {
                  label: "Stale-sync loads",
                  value: data.summary.staleSyncLoads,
                  hint: "Arrived in v2 >2 days after delivery",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="bg-surface-container-lowest border border-outline-variant/40 rounded-[12px] p-4"
                  title={s.hint}
                >
                  <div className="font-data text-3xl font-extrabold text-primary tabular-nums leading-none">
                    {s.value}
                  </div>
                  <div className="text-[11px] font-medium text-on-surface-variant mt-2">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-[10px] text-outline tracking-[0.08em] uppercase">
              Generated {fmtDate(data.generatedAt)} — pull-style report, no
              scheduled notifications. Re-run anytime.
            </div>

            {/* Duplicate BOLs */}
            <Section
              title="Duplicate BOLs"
              empty={data.duplicateBols.length === 0}
              emptyText="No duplicate BOLs detected."
            >
              <Table
                cols={[
                  "BOL #",
                  "Count",
                  "Sources",
                  "Latest delivery",
                  "Load IDs",
                ]}
                rows={data.duplicateBols.map((d) => [
                  d.bolNo ?? "--",
                  d.count,
                  d.sources,
                  fmtDate(d.latestDelivery),
                  d.loadIds,
                ])}
              />
            </Section>

            {/* Sync errors */}
            <Section
              title="Recent sync runs (last 7 days)"
              empty={data.syncErrors.length === 0}
              emptyText="No sync runs in the last 7 days."
            >
              <Table
                cols={[
                  "Source",
                  "Status",
                  "Started",
                  "Duration",
                  "Records",
                  "Error",
                ]}
                rows={data.syncErrors.map((r) => [
                  r.source,
                  r.status,
                  fmtDate(r.startedAt),
                  r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "--",
                  r.recordsProcessed ?? 0,
                  r.error ?? "--",
                ])}
              />
            </Section>

            {/* Missing critical fields */}
            <Section
              title="Loads with no driver, BOL, or ticket"
              empty={data.missingCriticalFields.length === 0}
              emptyText="All loads have at least one identifier."
            >
              <Table
                cols={[
                  "ID",
                  "Source",
                  "Load #",
                  "Destination",
                  "Delivered",
                  "Created",
                ]}
                rows={data.missingCriticalFields.map((l) => [
                  l.id,
                  l.source,
                  l.loadNo,
                  l.destinationName ?? "--",
                  fmtDate(l.deliveredOn),
                  fmtDate(l.createdAt),
                ])}
              />
            </Section>

            {/* Stale sync */}
            <Section
              title="Stale-sync loads (arrived >2 days late)"
              empty={data.staleSyncLoads.length === 0}
              emptyText="No stale-sync loads."
            >
              <Table
                cols={[
                  "ID",
                  "Source",
                  "Load #",
                  "Driver",
                  "Delivered",
                  "Created",
                  "Lag (days)",
                ]}
                rows={data.staleSyncLoads.map((l) => [
                  l.id,
                  l.source,
                  l.loadNo,
                  l.driverName ?? "--",
                  fmtDate(l.deliveredOn),
                  fmtDate(l.createdAt),
                  l.lagDays,
                ])}
              />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  empty,
  emptyText,
  children,
}: {
  title: string;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-headline text-[13px] font-bold text-outline uppercase tracking-[0.08em]">
        {title}
      </h2>
      {empty ? (
        <div className="bg-surface-container-low rounded-md p-4 text-xs text-on-surface/40">
          {emptyText}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function Table({
  cols,
  rows,
}: {
  cols: string[];
  rows: Array<Array<string | number | null>>;
}) {
  return (
    <div className="overflow-x-auto bg-surface-container-lowest border border-outline-variant/40 rounded-md">
      <table className="w-full text-xs">
        <thead className="bg-surface-container-low">
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="px-3 py-2 text-left font-bold uppercase tracking-wide text-[10px] text-on-surface/40"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-t border-outline-variant/30 hover:bg-surface-container-low/40"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-3 py-2 text-on-surface tabular-nums whitespace-pre-wrap break-all"
                >
                  {cell ?? "--"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
