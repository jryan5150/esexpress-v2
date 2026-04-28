import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useArchiveLoads } from "../hooks/use-archive";
import { Pagination } from "../../components/Pagination";
import { api } from "../../lib/api";

const PAGE_SIZE = 25;

interface HistoricalStats {
  totals: {
    total: number;
    historicalComplete: number;
    pendingValidation: number;
    historicalCompletePct: number;
  };
  bySource: Record<string, { total: number; complete: number }>;
  completeness: {
    hasBOL: number;
    hasTicket: number;
    hasDriver: number;
    hasWeight: number;
    hasDeliveredOn: number;
  };
  dateRange: { earliest: string | null; latest: string | null };
}

export function ArchiveSearch() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [date, setDate] = useState("");
  const [stats, setStats] = useState<HistoricalStats | null>(null);

  // Fetch stats once on mount — auditable proof of what's captured.
  // api.get prefixes /api/v1 + auto-unwraps the {success,data} envelope,
  // so we ask for the inner shape directly.
  useEffect(() => {
    api
      .get<HistoricalStats>("/diag/historical-stats")
      .then((res) => setStats(res))
      .catch(() => {
        /* silent — stats are nice-to-have, not critical */
      });
  }, []);

  const query = useArchiveLoads({
    page,
    limit: pageSize,
    date: date || undefined,
  });

  const loads = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-surface-container-lowest">
      {/* Header */}
      <div className="px-6 py-5 border-b border-outline-variant/30">
        <h1 className="font-headline font-bold text-xl text-on-surface">
          Archive
        </h1>
        <p className="text-sm text-on-surface-variant mt-0.5">
          Loads before January 2026
        </p>
      </div>

      {/* Stats banner — auditable proof of capture */}
      {stats && (
        <div className="px-6 py-4 border-b border-outline-variant/30 bg-surface-container-low">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-on-surface-variant/70">
                Total Loads
              </div>
              <div className="font-headline text-lg font-bold text-on-surface tabular-nums">
                {stats.totals.total.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-on-surface-variant/70">
                Historical Complete
              </div>
              <div className="font-headline text-lg font-bold text-primary tabular-nums">
                {stats.totals.historicalComplete.toLocaleString()}
                <span className="text-xs text-on-surface-variant/70 ml-1">
                  ({stats.totals.historicalCompletePct}%)
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-on-surface-variant/70">
                Has BOL
              </div>
              <div className="font-headline text-lg font-bold text-on-surface tabular-nums">
                {stats.completeness.hasBOL.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-on-surface-variant/70">
                Has Driver
              </div>
              <div className="font-headline text-lg font-bold text-on-surface tabular-nums">
                {stats.completeness.hasDriver.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-on-surface-variant/70">
                Date Range
              </div>
              <div className="font-headline text-xs font-semibold text-on-surface tabular-nums leading-tight mt-1">
                {stats.dateRange.earliest
                  ? new Date(stats.dateRange.earliest).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" },
                    )
                  : "—"}
                <br />
                <span className="text-on-surface-variant/70">to</span>{" "}
                {stats.dateRange.latest
                  ? new Date(stats.dateRange.latest).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" },
                    )
                  : "—"}
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-outline-variant/20 flex items-center gap-4 text-xs text-on-surface-variant/80">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-primary">
                search
              </span>
              Searchable by BOL, driver, ticket #, well
            </span>
            {Object.entries(stats.bySource).map(([src, counts]) => (
              <span key={src} className="tabular-nums">
                <span className="font-semibold uppercase">{src}</span>:{" "}
                {counts.total.toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="px-6 py-3 border-b border-outline-variant/30 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-base">
            calendar_today
          </span>
          Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setPage(1);
          }}
          className="text-sm px-3 py-1.5 rounded-lg border border-outline-variant/40 bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {date && (
          <button
            onClick={() => {
              setDate("");
              setPage(1);
            }}
            className="text-xs text-on-surface-variant/60 hover:text-on-surface-variant transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : loads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant">
              inventory_2
            </span>
            <p className="text-sm text-on-surface-variant">
              No archived loads found
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-container-lowest border-b border-outline-variant/30">
              <tr>
                <th className="text-left px-6 py-2.5 font-headline text-xs text-on-surface-variant uppercase tracking-wide">
                  Load #
                </th>
                <th className="text-left px-4 py-2.5 font-headline text-xs text-on-surface-variant uppercase tracking-wide">
                  Driver
                </th>
                <th className="text-left px-4 py-2.5 font-headline text-xs text-on-surface-variant uppercase tracking-wide">
                  Carrier
                </th>
                <th className="text-left px-4 py-2.5 font-headline text-xs text-on-surface-variant uppercase tracking-wide">
                  Well
                </th>
                <th className="text-left px-4 py-2.5 font-headline text-xs text-on-surface-variant uppercase tracking-wide">
                  BOL
                </th>
                <th className="text-left px-4 py-2.5 font-headline text-xs text-on-surface-variant uppercase tracking-wide">
                  Delivered
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {loads.map((load) => (
                <tr
                  key={load.loadId}
                  className="hover:bg-surface-container/50 transition-colors"
                >
                  <td className="px-6 py-3">
                    <Link
                      to={`/archive/load/${load.loadId}`}
                      className="font-label text-primary hover:underline"
                    >
                      {load.loadNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-on-surface">
                    {load.driverName ?? (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-on-surface">
                    {load.carrierName ?? (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-on-surface">
                    {load.wellName ?? (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-label text-on-surface-variant">
                    {load.bolNo ?? (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {load.deliveredOn ? (
                      new Date(load.deliveredOn).toLocaleDateString()
                    ) : (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="border-t border-outline-variant/30">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            loading={query.isFetching}
          />
        </div>
      )}
    </div>
  );
}
