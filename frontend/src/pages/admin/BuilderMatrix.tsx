import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useHeartbeat } from "../../hooks/use-presence";

/**
 * Builder Matrix — reproduces the "Order of Invoicing" matrix from the
 * bottom-right of the Load Count Sheet's Current/Previous tabs. This is
 * the surface Jess builds by hand every Friday. v2 computes it live from
 * builder_routing × loads.customer_id × delivered_on.
 *
 * Sheet shape we mirror:
 *   Bill To  | Builder | Sun  Mon  Tue  Wed  Thu  Fri  Sat | Total
 *   Liberty  | Scout   | ...                                | 641
 *   Logistix | Steph   | ...                                | 281
 *   JRT      | Keli    | ...                                | 0
 *   (none)   | Crystal | ...                                | 299    ← floater
 */

interface MatrixRow {
  builder: string;
  customer: string | null;
  customerId: number | null;
  isPrimary: boolean;
  notes: string | null;
  counts: {
    sun: number;
    mon: number;
    tue: number;
    wed: number;
    thu: number;
    fri: number;
    sat: number;
  };
  total: number;
}

interface MatrixPayload {
  weekStart: string;
  weekEnd: string;
  tz: string;
  matrix: MatrixRow[];
  grandTotal: number;
  unclaimedTotal: number;
  sourceLabel: string;
}

const DOW_LABELS: Array<keyof MatrixRow["counts"]> = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];
const DOW_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatMD(s: string): string {
  const [, m, d] = s.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function shiftWeek(weekStart: string, days: number): string {
  const d = new Date(weekStart + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function BuilderMatrix() {
  useHeartbeat({ currentPage: "admin-builder-matrix" });

  // Default = current week. Allow user to step back/forward by 7 days.
  const [weekStart, setWeekStart] = useState<string | null>(null);

  const matrixQuery = useQuery({
    queryKey: ["admin", "builder-matrix", weekStart],
    queryFn: () =>
      api
        .get<{
          success: boolean;
          data: MatrixPayload;
        }>(
          weekStart
            ? `/diag/builder-matrix?weekStart=${weekStart}`
            : `/diag/builder-matrix`,
        )
        .then((r) => r.data),
    staleTime: 60_000,
  });

  const data = matrixQuery.data;
  const sortedMatrix = useMemo(() => {
    if (!data) return [];
    // Primary builders first (Scout/Steph/Keli/Crystal), then secondary
    // (Katie backup), then floaters/sheet-owners (Jenny). Within those,
    // by total desc.
    return [...data.matrix].sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return b.total - a.total;
    });
  }, [data]);

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 gap-4 max-w-7xl w-full mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Order of Invoicing
          </h1>
          <p className="text-sm text-text-secondary max-w-3xl">
            The matrix Jess builds by hand at the bottom of the Load Count Sheet
            every Friday — automated and live. Each row is a (Bill To → Builder)
            pairing with daily counts for the week.
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

      {matrixQuery.isLoading && (
        <div className="text-sm text-text-secondary">Loading matrix...</div>
      )}
      {matrixQuery.isError && (
        <div className="text-sm text-red-500">
          Failed to load matrix: {String(matrixQuery.error)}
        </div>
      )}

      {data && (
        <>
          {/* Week selector */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-bg-secondary p-3">
            <button
              type="button"
              onClick={() => setWeekStart(shiftWeek(data.weekStart, -7))}
              className="px-3 py-1.5 text-sm rounded-md border border-border bg-bg-primary hover:bg-bg-tertiary"
            >
              ← Previous week
            </button>
            <div className="text-sm font-medium">
              Week of {formatMD(data.weekStart)} – {formatMD(data.weekEnd)}{" "}
              <span className="text-xs text-text-secondary">
                (Sun–Sat, {data.tz})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setWeekStart(shiftWeek(data.weekStart, 7))}
              className="px-3 py-1.5 text-sm rounded-md border border-border bg-bg-primary hover:bg-bg-tertiary"
            >
              Next week →
            </button>
          </div>

          {/* The matrix table */}
          <div className="rounded-lg border border-border bg-bg-secondary overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-text-secondary border-b border-border">
                  <th className="py-2.5 pl-4 pr-3">Bill To</th>
                  <th className="py-2.5 pr-3">Builder</th>
                  {DOW_HEADERS.map((d) => (
                    <th key={d} className="py-2.5 pr-3 text-right tabular-nums">
                      {d}
                    </th>
                  ))}
                  <th className="py-2.5 pr-4 text-right tabular-nums font-semibold">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedMatrix.map((row, idx) => (
                  <tr
                    key={`${row.builder}-${row.customerId ?? "none"}-${idx}`}
                    className={`border-b border-border/40 ${row.isPrimary ? "" : "opacity-70"}`}
                  >
                    <td className="py-2 pl-4 pr-3">
                      {row.customer ?? (
                        <span className="text-text-secondary italic">
                          (floater — no fixed Bill To)
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-medium">
                      {row.builder}
                      {!row.isPrimary && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                          backup
                        </span>
                      )}
                    </td>
                    {DOW_LABELS.map((dk) => (
                      <td
                        key={dk}
                        className="py-2 pr-3 text-right tabular-nums text-text-secondary"
                      >
                        {row.counts[dk] || ""}
                      </td>
                    ))}
                    <td className="py-2 pr-4 text-right tabular-nums font-semibold">
                      {row.total.toLocaleString()}
                    </td>
                  </tr>
                ))}
                <tr className="bg-bg-primary/40">
                  <td
                    colSpan={2}
                    className="py-2.5 pl-4 pr-3 font-semibold uppercase tracking-wide text-xs text-text-secondary"
                  >
                    Grand Total
                  </td>
                  {DOW_LABELS.map((dk) => {
                    const total = sortedMatrix.reduce(
                      (a, r) => a + (r.counts[dk] || 0),
                      0,
                    );
                    return (
                      <td
                        key={dk}
                        className="py-2.5 pr-3 text-right tabular-nums font-medium"
                      >
                        {total || ""}
                      </td>
                    );
                  })}
                  <td className="py-2.5 pr-4 text-right tabular-nums text-lg font-bold">
                    {data.grandTotal.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Notes panel — surfaces builder-routing.notes for context */}
          <div className="rounded-lg border border-border bg-bg-secondary p-4">
            <h2 className="text-sm font-semibold mb-2 uppercase tracking-wide text-text-secondary">
              Builder Notes
            </h2>
            <ul className="space-y-1.5 text-sm">
              {sortedMatrix
                .filter((r) => r.notes)
                .map((r, idx) => (
                  <li key={`note-${idx}`} className="flex gap-2">
                    <span className="font-medium text-text-primary min-w-[80px]">
                      {r.builder}:
                    </span>
                    <span className="text-text-secondary">{r.notes}</span>
                  </li>
                ))}
            </ul>
          </div>

          {data.unclaimedTotal > 0 && (
            <div className="text-xs text-amber-700 dark:text-amber-300 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
              <strong>{data.unclaimedTotal.toLocaleString()}</strong> loads this
              week aren't attributed to any builder above (no routing rule
              covers their Bill To). Phase 2.5 wires per-load builder
              attribution via match decisions.
            </div>
          )}

          <footer className="text-xs text-text-secondary border-t border-border pt-3 mt-2">
            {data.sourceLabel}
          </footer>
        </>
      )}
    </div>
  );
}
