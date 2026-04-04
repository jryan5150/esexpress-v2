import { useState } from "react";
import { Link } from "react-router-dom";
import { useArchiveLoads } from "../hooks/use-archive";
import { Pagination } from "../../components/Pagination";

const PAGE_SIZE = 25;

export function ArchiveSearch() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [date, setDate] = useState("");

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
            <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">
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
                      <span className="text-on-surface-variant/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-on-surface">
                    {load.carrierName ?? (
                      <span className="text-on-surface-variant/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-on-surface">
                    {load.wellName ?? (
                      <span className="text-on-surface-variant/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-label text-on-surface-variant">
                    {load.bolNo ?? (
                      <span className="text-on-surface-variant/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {load.deliveredOn ? (
                      new Date(load.deliveredOn).toLocaleDateString()
                    ) : (
                      <span className="text-on-surface-variant/40">—</span>
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
