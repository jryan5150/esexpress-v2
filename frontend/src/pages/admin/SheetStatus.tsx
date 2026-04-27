import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useHeartbeat } from "../../hooks/use-presence";

/**
 * Sheet Status — mirrors the workflow status the team paints into cell
 * background color on the Load Count Sheet. v2 reads Current/Previous,
 * classifies each colored cell against the legend (8 stages + 1 exception),
 * persists per-cell, surfaces here.
 *
 * The team's mental model lives in COLOR. This page makes their colors
 * v2's colors — same hex values, same canonical labels.
 */

interface LegendEntry {
  hex: string;
  status: string;
  label: string;
}
interface StatusCount {
  status: string;
  n: number;
}
interface CellRow {
  row_index: number;
  col_index: number;
  well_name: string | null;
  bill_to: string | null;
  cell_value: string | null;
  cell_hex: string | null;
  status: string;
}
interface CellWithV2 {
  row_index: number;
  col_index: number;
  well_name: string | null;
  bill_to: string | null;
  cell_value: string | null;
  cell_hex: string | null;
  status: string;
  dow: number;
  well_id: number | null;
  v2_count_for_day: number;
}
interface Reconciliation {
  cellsAgree: number;
  cellsDelta: number;
  cellsNoV2Well: number;
  totalSheetCount: number;
  totalV2Count: number;
  weekDelta: number;
}
interface StatusPayload {
  weekStart: string;
  tab: string;
  legend: LegendEntry[];
  counts: StatusCount[];
  cells: CellRow[];
  cellsWithV2: CellWithV2[];
  reconciliation: Reconciliation;
  lastSync: string | null;
}

const DOW_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function statusLabel(legend: LegendEntry[], status: string): string {
  return (
    legend.find((l) => l.status === status)?.label ?? status.replace(/_/g, " ")
  );
}

function statusHex(legend: LegendEntry[], status: string): string | null {
  return legend.find((l) => l.status === status)?.hex ?? null;
}

export function SheetStatus() {
  useHeartbeat({ currentPage: "admin-sheet-status" });
  const qc = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["admin", "sheet-status"],
    queryFn: () =>
      api
        .get<{ success: boolean; data: StatusPayload }>("/diag/sheet-status")
        ,
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
              weekStart: string;
              tabName: string;
              rowsScanned: number;
              cellsScanned: number;
              cellsPainted: number;
              byStatus: Record<string, number>;
              rowsUpserted: number;
            };
          }
        >("/diag/sheet-color-sync", {})
        .then((r) => r),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "sheet-status"] }),
  });

  const data = statusQuery.data;

  // Build a lookup from cellsWithV2 so we can render v2 counts per cell.
  const v2ByCell = useMemo(() => {
    const m = new Map<string, CellWithV2>();
    if (!data) return m;
    for (const c of data.cellsWithV2) {
      m.set(`${c.row_index}-${c.col_index}`, c);
    }
    return m;
  }, [data]);

  // Group cells into a grid for rendering. We only display the well-grid
  // cells (col_index 2-8 = Sun-Sat) per row.
  const grid = useMemo(() => {
    if (!data) return [];
    interface Row {
      rowIndex: number;
      wellName: string | null;
      billTo: string | null;
      days: Array<CellRow | null>;
    }
    const byRow = new Map<number, Row>();
    for (const c of data.cells) {
      let row = byRow.get(c.row_index);
      if (!row) {
        row = {
          rowIndex: c.row_index,
          wellName: c.well_name,
          billTo: c.bill_to,
          days: Array(7).fill(null),
        };
        byRow.set(c.row_index, row);
      }
      // col_index: 0=well, 1=bill_to, 2-8 = Sun-Sat
      const dowIdx = c.col_index - 2;
      if (dowIdx >= 0 && dowIdx < 7) row.days[dowIdx] = c;
    }
    return Array.from(byRow.values()).sort((a, b) => a.rowIndex - b.rowIndex);
  }, [data]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col p-4 sm:p-6 gap-4 max-w-7xl w-full mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Sheet Status (Mirror)
          </h1>
          <p className="text-sm text-text-secondary max-w-3xl">
            v2 reads the workflow status the team paints into cell colors on the
            Load Count Sheet. Same hex values. Same canonical labels. The mental
            model that's lived in your sheet for 4 years, now machine-readable.
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
            to="/admin/sheet-truth"
            className="text-sm text-accent underline-offset-4 hover:underline"
          >
            Sheet Truth →
          </Link>
        </div>
      </header>

      {syncMutation.isSuccess && syncMutation.data && (
        <div className="text-xs px-3 py-2 rounded-md bg-bg-secondary border border-border">
          Synced <strong>{syncMutation.data.data.cellsPainted}</strong> painted
          cells ({syncMutation.data.data.rowsUpserted} rows persisted)
        </div>
      )}

      {statusQuery.isLoading && (
        <div className="text-sm text-text-secondary">Loading...</div>
      )}
      {statusQuery.isError && (
        <div className="text-sm text-red-500">
          Failed to load: {String(statusQuery.error)}
        </div>
      )}

      {data && (
        <>
          {/* Legend panel — show v2's hex map matches the sheet */}
          <section className="rounded-lg border border-border bg-bg-secondary p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary mb-3">
              Color legend (read live from your Color Key tab)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.legend.map((l) => {
                const count =
                  data.counts.find((c) => c.status === l.status)?.n ?? 0;
                return (
                  <div
                    key={`${l.hex}-${l.status}`}
                    className="flex items-center gap-3 px-2 py-1.5 rounded-md border border-border bg-bg-primary/40"
                  >
                    <div
                      className="w-6 h-6 rounded border border-border flex-shrink-0"
                      style={{ backgroundColor: l.hex }}
                      title={l.hex}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {l.label}
                      </div>
                      <div className="text-xs text-text-secondary">
                        <code>{l.hex}</code> · v2 enum: <code>{l.status}</code>
                      </div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums">
                      {count}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Reconciliation summary — sheet vs v2 per-cell agreement */}
          {data.reconciliation && (
            <section className="rounded-lg border border-border bg-bg-secondary p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary mb-3">
                Sheet ↔ v2 Reconciliation
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-md border border-border bg-bg-primary/40 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-text-secondary">
                    Cells agree
                  </div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {data.reconciliation.cellsAgree}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-bg-primary/40 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-text-secondary">
                    Cells differ
                  </div>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {data.reconciliation.cellsDelta}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-bg-primary/40 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-text-secondary">
                    No v2 well match
                  </div>
                  <div className="text-2xl font-bold text-slate-500">
                    {data.reconciliation.cellsNoV2Well}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-bg-primary/40 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-text-secondary">
                    Week delta (v2 − sheet)
                  </div>
                  <div
                    className={`text-2xl font-bold ${
                      data.reconciliation.weekDelta === 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : Math.abs(data.reconciliation.weekDelta) <= 5
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {data.reconciliation.weekDelta > 0 ? "+" : ""}
                    {data.reconciliation.weekDelta.toLocaleString()}
                  </div>
                </div>
              </div>
              <p className="text-xs text-text-secondary mt-3">
                Sheet total:{" "}
                <strong>{data.reconciliation.totalSheetCount}</strong> · v2
                total: <strong>{data.reconciliation.totalV2Count}</strong> ·
                Per-cell agreement only counts cells where v2 has a well bound
                to the sheet's well_name (via wells.aliases match).
              </p>
            </section>
          )}

          {/* Painted grid mirror — well rows × day cols, colored cells */}
          {grid.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-bg-secondary p-8 text-center text-sm text-text-secondary">
              No painted cells captured yet. Click <strong>Sync now</strong> to
              read the current week's colors from the Load Count Sheet.
            </div>
          ) : (
            <section className="rounded-lg border border-border bg-bg-secondary p-4 overflow-x-auto">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary mb-3">
                Week of {data.weekStart} — {data.tab} tab
              </h2>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-text-secondary border-b border-border">
                    <th className="py-2 pl-3 pr-3">Well Name</th>
                    <th className="py-2 pr-3">Bill To</th>
                    {DOW_HEADERS.map((d) => (
                      <th key={d} className="py-2 pr-2 text-center w-12">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.map((row) => (
                    <tr
                      key={row.rowIndex}
                      className="border-b border-border/40"
                    >
                      <td className="py-1.5 pl-3 pr-3 text-sm">
                        {row.wellName ?? (
                          <span className="text-text-secondary italic">—</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-xs text-text-secondary">
                        {row.billTo ?? "—"}
                      </td>
                      {row.days.map((cell, idx) => {
                        const v2 = cell
                          ? v2ByCell.get(`${row.rowIndex}-${cell.col_index}`)
                          : undefined;
                        const sheetN =
                          parseInt(cell?.cell_value ?? "0", 10) || 0;
                        const v2N = v2?.v2_count_for_day ?? 0;
                        const delta = v2N - sheetN;
                        const hasV2Match = v2?.well_id != null;
                        const tip = cell
                          ? `Sheet: ${cell.cell_value ?? ""} · ${statusLabel(data.legend, cell.status)}\nv2: ${v2N}${hasV2Match ? "" : " (no well match)"}\nDelta: ${delta > 0 ? "+" : ""}${delta}`
                          : "";
                        return (
                          <td
                            key={`${row.rowIndex}-${idx}`}
                            className="py-1.5 pr-2 text-center text-xs relative"
                          >
                            {cell?.cell_hex ? (
                              <div
                                className="w-10 h-7 mx-auto rounded border border-border relative flex items-center justify-center text-[10px] font-semibold text-black/70"
                                style={{ backgroundColor: cell.cell_hex }}
                                title={tip}
                              >
                                {cell.cell_value || ""}
                                {hasV2Match && delta !== 0 && (
                                  <span
                                    className={`absolute -top-1.5 -right-1.5 px-1 rounded-full text-[9px] leading-tight font-bold border ${
                                      delta > 0
                                        ? "bg-blue-500 text-white border-blue-700"
                                        : "bg-amber-500 text-white border-amber-700"
                                    }`}
                                  >
                                    {delta > 0 ? "+" : ""}
                                    {delta}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-text-secondary">·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <footer className="text-xs text-text-secondary border-t border-border pt-3 mt-2">
            Last sync:{" "}
            {data.lastSync ? new Date(data.lastSync).toLocaleString() : "never"}{" "}
            · Hex map captured live from your Color Key tab. v2 enum values are
            sheet-canonical (no invented vocabulary).
          </footer>
        </>
      )}
    </div>
  );
}
