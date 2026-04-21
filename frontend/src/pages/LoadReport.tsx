import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useWorkbench } from "../hooks/use-workbench";
import { useWeightUnit } from "../hooks/use-weight-unit";
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

type GroupBy = "none" | "truck" | "day" | "well";

const GROUP_OPTIONS: Array<{ value: GroupBy; label: string }> = [
  { value: "none", label: "No grouping" },
  { value: "truck", label: "By Truck" },
  { value: "day", label: "By Day" },
  { value: "well", label: "By Well" },
];

const COLUMNS: Array<{ key: keyof Row | "stage"; label: string }> = [
  { key: "truckNo", label: "Truck #" },
  { key: "deliveredOn", label: "Date" },
  { key: "loadNo", label: "Load #" },
  { key: "bolNo", label: "BOL" },
  { key: "pcsNumber", label: "PCS #" },
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

function getValue(
  row: Row,
  key: keyof Row | "stage",
  formatWeight: (v: string | number | null | undefined) => string,
): string {
  if (key === "stage") return row.handlerStage ?? "";
  if (key === "deliveredOn") return fmtDate(row.deliveredOn);
  if (key === "weightTons") return formatWeight(row.weightTons);
  const v = (row as unknown as Record<string, unknown>)[key];
  if (v == null) return "";
  return String(v);
}

function rowsToCsv(
  rows: Row[],
  unitLabel: string,
  formatWeight: (v: string | number | null | undefined) => string,
): string {
  // Header reflects the user's current unit — "Tons" or "Lbs" — so the CSV
  // is self-describing when opened in a spreadsheet. Weight column values
  // are formatted through the same helper that drives the UI.
  const header = COLUMNS.map((c) =>
    c.key === "weightTons" ? unitLabel : c.label,
  ).join(",");
  const lines = rows.map((r) =>
    COLUMNS.map((c) => {
      const v = getValue(r, c.key, formatWeight);
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
  const { unit, format: formatWeight } = useWeightUnit();
  const unitLabel = unit === "tons" ? "Tons" : "Lbs";
  const [params, setParams] = useSearchParams();
  const dateFrom = params.get("dateFrom") ?? "";
  const dateTo = params.get("dateTo") ?? "";
  const truckNo = params.get("truckNo") ?? "";
  // Group pivot — "none" renders the flat table, others group by that field.
  // URL-persisted so sharing/bookmarking a grouped view works. Defaults to
  // "day" — payroll reviewers mostly ask "what happened yesterday?" not
  // "what has this truck been doing this week?"; truck grouping becomes a
  // one-click switch when they do need it.
  const groupBy = (params.get("groupBy") as GroupBy) || "day";

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
    // Jodi's payroll view reads chronologically — sort by delivery date DESC
    // (most recent first). Overrides the default stage-recency sort, which
    // is right for the dispatch workbench but wrong for a payroll report.
    sortBy: "delivered_on",
    sortDir: "desc",
    pageSize: 100,
  });

  const rows = useMemo<Row[]>(() => query.data?.rows ?? [], [query.data]);
  const total = query.data?.total ?? 0;

  // Group rows by the selected pivot. Each pivot defines a key extractor and
  // a sort so the rendered groups read predictably:
  //   truck — numeric-aware ascending (1, 2, 12, 101), "(no truck)" last
  //   day   — most recent day first, newest deliveries on top of the report
  //   well  — alphabetical, "(no well)" last
  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const keyFor = (r: Row): string => {
      if (groupBy === "truck") return r.truckNo ?? "(no truck)";
      if (groupBy === "well") return r.wellName ?? "(no well)";
      // day
      if (!r.deliveredOn) return "(no date)";
      try {
        const d = new Date(r.deliveredOn);
        if (isNaN(d.getTime())) return "(no date)";
        return d.toISOString().slice(0, 10); // YYYY-MM-DD for stable sort
      } catch {
        return "(no date)";
      }
    };

    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key = keyFor(r);
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }

    const entries = Array.from(map.entries());
    entries.sort((a, b) => {
      // Placeholder groups always last
      const isPlaceholder = (k: string) => k.startsWith("(no ");
      if (isPlaceholder(a[0]) && !isPlaceholder(b[0])) return 1;
      if (!isPlaceholder(a[0]) && isPlaceholder(b[0])) return -1;
      if (groupBy === "day") return b[0].localeCompare(a[0]); // newest first
      return a[0].localeCompare(b[0], undefined, { numeric: true });
    });
    return entries;
  }, [rows, groupBy]);

  const handleExport = () => {
    const csv = rowsToCsv(rows, unitLabel, formatWeight);
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`load-report-${today}.csv`, csv);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col p-4 gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-headline">Load Report</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1 text-xs text-on-surface-variant">
            <span className="font-medium uppercase tracking-wider text-[10px]">
              From
            </span>
            <input
              type="date"
              className="bg-surface-variant rounded px-2 py-1 text-sm"
              value={dateFrom}
              onChange={(e) => setParam("dateFrom", e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-on-surface-variant">
            <span className="font-medium uppercase tracking-wider text-[10px]">
              To
            </span>
            <input
              type="date"
              className="bg-surface-variant rounded px-2 py-1 text-sm"
              value={dateTo}
              onChange={(e) => setParam("dateTo", e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-on-surface-variant">
            <span className="font-medium uppercase tracking-wider text-[10px]">
              Truck
            </span>
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
          <label className="flex items-center gap-1 text-xs text-on-surface-variant">
            <span className="font-medium uppercase tracking-wider text-[10px]">
              Group
            </span>
            <select
              value={groupBy}
              onChange={(e) => setParam("groupBy", e.target.value)}
              className="bg-surface-variant rounded px-2 py-1 text-sm"
            >
              {GROUP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
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
        ) : grouped ? (
          grouped.map(([groupKey, groupRows]) => {
            const headerLabel =
              groupBy === "truck"
                ? `Truck ${groupKey}`
                : groupBy === "well"
                  ? groupKey
                  : groupBy === "day"
                    ? (() => {
                        try {
                          return new Date(
                            groupKey + "T00:00:00",
                          ).toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          });
                        } catch {
                          return groupKey;
                        }
                      })()
                    : groupKey;
            return (
              <div key={groupKey} className="mb-4">
                <div className="sticky top-0 bg-surface-container-low px-3 py-1.5 text-sm font-semibold border-b border-outline-variant">
                  {headerLabel}
                  <span className="ml-2 text-xs text-on-surface-variant font-normal">
                    {groupRows.length}{" "}
                    {groupRows.length === 1 ? "load" : "loads"}
                  </span>
                </div>
                <Table rows={groupRows} />
              </div>
            );
          })
        ) : (
          <Table rows={rows} />
        )}
      </div>
    </div>
  );
}

function Table({ rows }: { rows: Row[] }) {
  const { unit, format: formatWeight } = useWeightUnit();
  return (
    <table className="w-full text-xs">
      <thead className="bg-surface-container-low text-on-surface-variant">
        <tr>
          {COLUMNS.map((c) => (
            <th
              key={String(c.key)}
              className="text-left px-3 py-1.5 font-medium uppercase tracking-wider"
            >
              {c.key === "weightTons"
                ? unit === "tons"
                  ? "Tons"
                  : "Lbs"
                : c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.assignmentId}
            className="border-b border-outline-variant/30 hover:bg-surface-container-low/40"
          >
            {COLUMNS.map((c) => {
              // Load # deep-links into Workbench (filter=all so cleared loads
              // still appear; search= pins the row at the top). ctrl/cmd-click
              // opens in a new tab for payroll reviewers who want to stay put.
              if (c.key === "loadNo" && r.loadNo) {
                return (
                  <td
                    key={String(c.key)}
                    className="px-3 py-1.5 text-on-surface"
                  >
                    <Link
                      to={`/workbench?filter=all&search=${encodeURIComponent(r.loadNo)}`}
                      className="text-primary hover:underline font-medium"
                      title={`Open load ${r.loadNo} in Load Center`}
                    >
                      {r.loadNo}
                    </Link>
                  </td>
                );
              }
              // BOL # deep-links into BOL Center's JotForm tab with the BOL
              // pre-searched. That's the tab where driver-submitted ticket
              // photos live, which is what a payroll reviewer is looking for
              // when a row looks off. Server-side search spans jotform BOL +
              // joined load BOL, so matched rows surface too.
              if (c.key === "bolNo" && r.bolNo) {
                return (
                  <td
                    key={String(c.key)}
                    className="px-3 py-1.5 text-on-surface"
                  >
                    <Link
                      to={`/bol?tab=submissions&search=${encodeURIComponent(r.bolNo)}`}
                      className="text-primary hover:underline font-medium"
                      title={`Find BOL ${r.bolNo} in BOL Center`}
                    >
                      {r.bolNo}
                    </Link>
                  </td>
                );
              }
              return (
                <td key={String(c.key)} className="px-3 py-1.5 text-on-surface">
                  {getValue(r, c.key, formatWeight)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
