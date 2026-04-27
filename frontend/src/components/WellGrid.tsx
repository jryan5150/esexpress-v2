import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { WellGridCell } from "./WellGridCell";

interface GridCell {
  wellId: number;
  wellName: string;
  customerId: number | null;
  billTo: string | null;
  dow: number;
  loadCount: number;
  derivedStatus: string;
}
interface GridRow {
  wellId: number;
  wellName: string;
  customerId: number | null;
  billTo: string | null;
  days: Array<GridCell | null>;
}
interface GridPayload {
  weekStart: string;
  weekEnd: string;
  rows: GridRow[];
  rowCount: number;
  totalCells: number;
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  weekStart?: string;
  highlight: number | "all" | "mine_only";
  myCustomerId: number | null;
  onCellClick: (wellId: number, dow: number) => void;
  onBadgeClick: (wellId: number, dow: number) => void;
  paintedStatusByCell?: Map<string, string>; // key: `${wellId}-${dow}`
}

export function WellGrid({
  weekStart,
  highlight,
  myCustomerId,
  onCellClick,
  onBadgeClick,
  paintedStatusByCell,
}: Props) {
  const [activeOnly, setActiveOnly] = useState(true);
  const todayDow = new Date().getDay();

  const gridQuery = useQuery({
    queryKey: ["worksurface", "well-grid", weekStart],
    queryFn: () =>
      api.get<GridPayload>(
        weekStart
          ? `/diag/well-grid?weekStart=${weekStart}`
          : `/diag/well-grid`,
      ),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const visibleRows = useMemo(() => {
    if (!gridQuery.data) return [];
    let rows = gridQuery.data.rows;
    if (activeOnly) {
      rows = rows.filter((r) => r.days.some((d) => d && d.loadCount > 0));
    }
    if (highlight === "mine_only" && myCustomerId != null) {
      rows = rows.filter((r) => r.customerId === myCustomerId);
    }
    return rows;
  }, [gridQuery.data, activeOnly, highlight, myCustomerId]);

  const isHighlighted = (row: GridRow): boolean => {
    if (highlight === "all" || highlight === "mine_only") return false;
    return row.customerId === highlight;
  };

  if (!gridQuery.data) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-6 text-sm text-text-secondary">
        Loading grid...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-secondary">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between text-xs">
        <span className="text-text-secondary">
          {visibleRows.length} of {gridQuery.data.rowCount} wells ·{" "}
          {gridQuery.data.totalCells} active cells this week
        </span>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          Active rows only
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left uppercase tracking-wide text-text-secondary border-b border-border">
              <th className="py-2 pl-3 pr-3 text-xs">Bill To / Well</th>
              {DOW_LABELS.map((d, idx) => (
                <th
                  key={d}
                  className={`py-2 px-1 text-center w-12 text-xs ${
                    idx === todayDow
                      ? "bg-accent/10 text-accent font-semibold"
                      : ""
                  }`}
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.wellId}
                className={`border-b border-border/40 ${
                  isHighlighted(row)
                    ? "border-l-4 border-l-accent bg-accent/5"
                    : ""
                }`}
              >
                <td className="py-1.5 pl-3 pr-3">
                  <div className="text-xs text-text-secondary">
                    {row.billTo ?? "—"}
                  </div>
                  <div className="text-sm font-medium">{row.wellName}</div>
                </td>
                {row.days.map((cell, idx) => (
                  <td key={idx} className="py-1.5 px-1 text-center">
                    {cell ? (
                      <WellGridCell
                        loadCount={cell.loadCount}
                        derivedStatus={cell.derivedStatus}
                        paintedStatus={paintedStatusByCell?.get(
                          `${cell.wellId}-${cell.dow}`,
                        )}
                        onClick={() => onCellClick(cell.wellId, cell.dow)}
                        onBadgeClick={() => onBadgeClick(cell.wellId, cell.dow)}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onCellClick(row.wellId, idx)}
                        className="w-12 h-9 rounded border border-dashed border-border/40 bg-bg-primary/20 hover:border-border hover:bg-bg-primary/40 transition-colors"
                        aria-label="Empty cell"
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {visibleRows.length === 0 && !gridQuery.isLoading && (
          <div className="px-3 py-12 text-center text-sm text-text-secondary border-t border-border">
            No active wells this week.{" "}
            {activeOnly
              ? "Toggle 'Active rows only' off to see the full roster."
              : "Pick a different week."}
          </div>
        )}
      </div>
    </div>
  );
}
