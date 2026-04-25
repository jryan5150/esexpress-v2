import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useHeartbeat } from "../../hooks/use-presence";

/**
 * Sheet Truth — side-by-side parity between ES Express's Load Count Sheet
 * (their daily-billing truth surface, maintained by hand since 2022) and
 * v2's automated count over the same week. Renders the comparison Jess
 * runs by hand every Friday — automated.
 *
 * Data: GET /api/v1/sheets/loadcount/parity returns one WeekParityRow per
 * (sheet tab, week_start). Sync via POST /api/v1/sheets/loadcount/sync.
 */

interface WeekParityRow {
  spreadsheetId: string;
  sheetTabName: string;
  weekStart: string;
  weekEnd: string;
  sheetTotalBuilt: number | null;
  sheetExpectedToBuild: number | null;
  sheetDiscrepancy: number | null;
  v2RawCount: number;
  v2UniqueCount: number;
  delta: number;
  withinThreshold: boolean;
  capturedAt: string | null;
}

function formatDate(s: string): string {
  // 'YYYY-MM-DD' → 'M/D'
  const [, m, d] = s.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function deltaTone(
  delta: number | null,
  withinThreshold: boolean,
  hasSheetTotal: boolean,
): { tone: "ok" | "warn" | "bad" | "pending"; label: string } {
  if (!hasSheetTotal) return { tone: "pending", label: "Sheet WIP" };
  if (withinThreshold) return { tone: "ok", label: "Match" };
  if (Math.abs(delta ?? 0) > 50) return { tone: "bad", label: "Critical" };
  return { tone: "warn", label: "Investigate" };
}

const TONE_BG: Record<string, string> = {
  ok: "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800",
  warn: "bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800",
  bad: "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800",
  pending:
    "bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-700",
};
const TONE_DOT: Record<string, string> = {
  ok: "bg-green-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
  pending: "bg-slate-400",
};

export function SheetTruth() {
  useHeartbeat({ currentPage: "admin-sheet-truth" });
  const qc = useQueryClient();

  const parityQuery = useQuery({
    queryKey: ["admin", "sheet-truth", "parity"],
    queryFn: () =>
      api
        .get<{
          success: boolean;
          data: WeekParityRow[];
          meta: { spreadsheetId: string; weeksReported: number };
        }>("/sheets/loadcount/parity")
        .then((r) => r),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      api
        .post<
          {},
          {
            success: boolean;
            data: {
              spreadsheetId: string;
              tabsScanned: number;
              rowsUpserted: number;
              weekStarts: string[];
              errors: { tab: string; error: string }[];
            };
          }
        >("/sheets/loadcount/sync", {})
        .then((r) => r),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "sheet-truth"] }),
  });

  const data = parityQuery.data?.data ?? [];
  const sortedRows = useMemo(
    () => [...data].sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
    [data],
  );

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 gap-4 max-w-7xl w-full mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sheet Truth</h1>
          <p className="text-sm text-text-secondary">
            Your Load Count Sheet, side-by-side with v2's count for the same
            week. The parity check Jenny runs by hand on Fridays — automated.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="px-3 py-1.5 text-sm rounded-md border border-border bg-bg-secondary hover:bg-bg-tertiary disabled:opacity-50"
          >
            {syncMutation.isPending ? "Syncing..." : "Sync now"}
          </button>
          <Link
            to="/admin/discrepancies"
            className="text-sm text-accent underline-offset-4 hover:underline"
          >
            View discrepancies queue →
          </Link>
        </div>
      </header>

      {syncMutation.isSuccess && syncMutation.data && (
        <div className="text-xs px-3 py-2 rounded-md bg-bg-secondary border border-border">
          Synced <strong>{syncMutation.data.data.rowsUpserted}</strong> rows
          from <strong>{syncMutation.data.data.tabsScanned}</strong> tabs
          {syncMutation.data.data.errors.length > 0 ? (
            <span className="text-amber-500 ml-2">
              ({syncMutation.data.data.errors.length} parse errors)
            </span>
          ) : null}
        </div>
      )}

      {parityQuery.isLoading && (
        <div className="text-sm text-text-secondary">Loading parity...</div>
      )}
      {parityQuery.isError && (
        <div className="text-sm text-red-500">
          Failed to load parity: {String(parityQuery.error)}
        </div>
      )}

      <div className="grid gap-3">
        {sortedRows.map((row) => {
          const hasSheetTotal = row.sheetTotalBuilt != null;
          const tone = deltaTone(row.delta, row.withinThreshold, hasSheetTotal);
          return (
            <div
              key={`${row.sheetTabName}-${row.weekStart}`}
              className={`rounded-lg border p-4 ${TONE_BG[tone.tone]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${TONE_DOT[tone.tone]}`}
                    />
                    <h2 className="text-lg font-semibold">
                      Week of {formatDate(row.weekStart)} –{" "}
                      {formatDate(row.weekEnd)}
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded bg-bg-secondary border border-border text-text-secondary">
                      {row.sheetTabName}
                    </span>
                  </div>
                  {row.capturedAt && (
                    <div className="text-xs text-text-secondary mt-0.5">
                      Last synced {new Date(row.capturedAt).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase text-text-secondary">
                    Status
                  </div>
                  <div className="text-sm font-semibold">{tone.label}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Stat
                  label="Sheet Total Built"
                  value={
                    row.sheetTotalBuilt != null
                      ? row.sheetTotalBuilt.toLocaleString()
                      : "WIP"
                  }
                  emphasis
                />
                <Stat
                  label="Sheet Expected"
                  value={
                    row.sheetExpectedToBuild != null
                      ? row.sheetExpectedToBuild.toLocaleString()
                      : "—"
                  }
                />
                <Stat
                  label="Their Discrepancy"
                  value={
                    row.sheetDiscrepancy != null
                      ? (row.sheetDiscrepancy >= 0 ? "+" : "") +
                        row.sheetDiscrepancy.toLocaleString()
                      : "—"
                  }
                />
                <Stat
                  label="v2 Unique"
                  value={row.v2UniqueCount.toLocaleString()}
                  emphasis
                />
                <Stat
                  label="v2 vs Sheet"
                  value={
                    hasSheetTotal
                      ? (row.delta >= 0 ? "+" : "") + row.delta.toLocaleString()
                      : "—"
                  }
                  emphasis
                  toneOverride={
                    hasSheetTotal && !row.withinThreshold ? tone.tone : null
                  }
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-secondary">
                <span>
                  v2 raw ingest:{" "}
                  <strong className="text-text-primary">
                    {row.v2RawCount.toLocaleString()}
                  </strong>
                </span>
                <span>
                  Dedup phantoms removed:{" "}
                  <strong className="text-text-primary">
                    {(row.v2RawCount - row.v2UniqueCount).toLocaleString()}
                  </strong>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {!parityQuery.isLoading && sortedRows.length === 0 && (
        <div className="text-sm text-text-secondary text-center py-12 border border-dashed border-border rounded-lg">
          No parity rows yet. Click <strong>Sync now</strong> to capture the
          first snapshot.
        </div>
      )}

      <footer className="text-xs text-text-secondary border-t border-border pt-3 mt-2">
        Source sheet:{" "}
        <a
          href={`https://docs.google.com/spreadsheets/d/${parityQuery.data?.meta?.spreadsheetId ?? ""}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Load Count Sheet - Daily (Billing)
        </a>
        . Read via the production service account{" "}
        <code className="bg-bg-secondary px-1 rounded">
          esexpress-photos@pbx-59376783
        </code>
        . Auto-syncs every 30 minutes during business hours.
      </footer>
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
  toneOverride?: "ok" | "warn" | "bad" | "pending" | null;
}) {
  const valueClass = toneOverride
    ? toneOverride === "bad"
      ? "text-red-500"
      : toneOverride === "warn"
        ? "text-amber-500"
        : toneOverride === "ok"
          ? "text-green-500"
          : "text-text-primary"
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
