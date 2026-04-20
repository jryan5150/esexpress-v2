import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useWorkbench } from "../hooks/use-workbench";
import type { WorkbenchRow as Row } from "../types/api";

/**
 * Load Report (BP-4) — payroll-friendly truck/date grouped view of every
 * load (built, pending, flagged) with CSV export.
 *
 * Reuses the workbench list endpoint (filter=all + dateFrom/To + truckNo)
 * to avoid a new backend route. Renders client-side grouped by truck. CSV
 * export is also client-side. Caps at the workbench API limit (500/page);
 * widen via dedicated payroll endpoint when needed.
 */

const COLUMNS: Array<{ key: keyof Row | "stage"; label: string }> = [
  { key: "truckNo", label: "Truck #" },
  { key: "deliveredOn", label: "Date" },
  { key: "loadNo", label: "Load #" },
  { key: "bolNo", label: "BOL" },
  { key: "driverName", label: "Driver" },
  { key: "wellName", label: "Well" },
  { key: "weightTons", label: "Tons" },
  { key: "rate", label: "Rate" },
  { key: "stage", label: "Status" },
];

function fmtDate(d: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function getValue(row: Row, key: keyof Row | "stage"): string {
  if (key === "stage") return row.handlerStage ?? "";
  if (key === "deliveredOn") return fmtDate(row.deliveredOn);
  const v = (row as unknown as Record<string, unknown>)[key];
  if (v == null) return "";
  return String(v);
}

function rowsToCsv(rows: Row[]): string {
  const header = COLUMNS.map((c) => c.label).join(",");
  const lines = rows.map((r) =>
    COLUMNS.map((c) => {
      const v = getValue(r, c.key);
      // CSV-escape: wrap in quotes if it contains comma, quote, or newline
      return /[,"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(","),
  );
  return [header, ...lines].join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function LoadReport() {
  const [params, setParams] = useSearchParams();
  const dateFrom = params.get("dateFrom") ?? "";
  const dateTo = params.get("dateTo") ?? "";
  const truckNo = params.get("truckNo") ?? "";
  const [groupByTruck, setGroupByTruck] = useState(true);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const query = useWorkbench("all", {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    truckNo: truckNo || undefined,
  });

  const rows = useMemo<Row[]>(() => query.data?.rows ?? [], [query.data]);
  const total = query.data?.total ?? 0;

  // Group by truck for visual grouping
  const grouped = useMemo(() => {
    if (!groupByTruck) return null;
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key = r.truckNo ?? "(no truck)";
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true }),
    );
  }, [rows, groupByTruck]);

  const handleExport = () => {
    const csv = rowsToCsv(rows);
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`load-report-${today}.csv`, csv);
  };

  return (
    <div className="flex-1 flex flex-col p-4 gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-headline">Load Report</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1 text-xs text-on-surface-variant">
            <span className="font-medium uppercase tracking-wider text-[10px]">From</span>
            <input
              type="date"
              className="bg-surface-variant rounded px-2 py-1 text-sm"
              value={dateFrom}
              onChange={(e) => setParam("dateFrom", e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-on-surface-variant">
            <span className="font-medium uppercase tracking-wider text-[10px]">To</span>
            <input
              type="date"
              className="bg-surface-variant rounded px-2 py-1 text-sm"
              value={dateTo}
              onChange={(e) => setParam("dateTo", e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-on-surface-variant">
            <span className="font-medium uppercase tracking-wider text-[10px]">Truck</span>
            <input
              type="text"
              className="bg-surface-variant rounded px-2 py-1 text-sm w-24"
              placeholder="e.g. 1747"
              defaultValue={truckNo}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  setParam("truckNo", (e.target as HTMLInputElement).value);
              }}
              onBlur={(e) => setParam("truckNo", e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={groupByTruck}
              onChange={(e) => setGroupByTruck(e.target.checked)}
            />
            Group by truck
          </label>
          <button
            type="button"
            onClick={handleExport}
            disabled={rows.length === 0}
            className="px-3 py-1 text-sm font-medium rounded bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50"
          >
            Download CSV
          </button>
          <span className="text-xs text-on-surface-variant">
            {rows.length} of {total} {total === 1 ? "load" : "loads"}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {query.isLoading ? (
          <div className="text-sm text-on-surface-variant p-4">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-on-surface-variant p-4">
            No loads in this filter window.
          </div>
        ) : groupByTruck && grouped ? (
          grouped.map(([truck, truckRows]) => (
            <div key={truck} className="mb-4">
              <div className="sticky top-0 bg-surface-container-low px-3 py-1.5 text-sm font-semibold border-b border-outline-variant">
                Truck {truck}
                <span className="ml-2 text-xs text-on-surface-variant font-normal">
                  {truckRows.length} {truckRows.length === 1 ? "load" : "loads"}
                </span>
              </div>
              <Table rows={truckRows} />
            </div>
          ))
        ) : (
          <Table rows={rows} />
        )}
      </div>
    </div>
  );
}

function Table({ rows }: { rows: Row[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-surface-container-low text-on-surface-variant">
        <tr>
          {COLUMNS.map((c) => (
            <th key={String(c.key)} className="text-left px-3 py-1.5 font-medium uppercase tracking-wider">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.assignmentId} className="border-b border-outline-variant/30 hover:bg-surface-container-low/40">
            {COLUMNS.map((c) => (
              <td key={String(c.key)} className="px-3 py-1.5 text-on-surface">
                {getValue(r, c.key)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
