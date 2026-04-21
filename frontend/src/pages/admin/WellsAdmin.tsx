import { useState, useMemo, useEffect } from "react";
import { useWells, useUpdateWell } from "../../hooks/use-wells";
import { useToast } from "../../components/Toast";
import type { Well } from "../../types/api";

// "Active" excludes completed + closed by default (P2-9). Switch to "all"
// to see those — full set including completed/closed/standby.
type StatusFilter = "active" | "all" | "standby" | "completed" | "closed";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-tertiary/10 text-tertiary",
  standby: "bg-primary-container/10 text-primary-container",
  completed: "bg-on-surface/10 text-on-surface/60",
  closed: "bg-error/10 text-error",
};

const PAGE_SIZE = 25;

export function WellsAdmin() {
  const [filter, setFilter] = useState<StatusFilter>("active");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const { toast } = useToast();
  const wellsQuery = useWells();
  const updateWell = useUpdateWell();

  const wells: Well[] = Array.isArray(wellsQuery.data) ? wellsQuery.data : [];

  const filtered = useMemo(() => {
    if (filter === "all") return wells;
    if (filter === "active")
      return wells.filter(
        (w) => w.status !== "completed" && w.status !== "closed",
      );
    return wells.filter((w) => w.status === filter);
  }, [wells, filter]);

  // Reset to page 1 whenever the filter changes its result set
  useEffect(() => {
    setPage(1);
  }, [filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageWells = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const filterButtons: { value: StatusFilter; label: string }[] = [
    { value: "active", label: "Active" },
    { value: "standby", label: "Standby" },
    { value: "completed", label: "Completed" },
    { value: "closed", label: "Closed" },
    { value: "all", label: "All" },
  ];

  const startEdit = (well: Well) => {
    setEditingId(well.id);
    setEditValue(String(well.dailyTargetLoads));
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };
  const saveEdit = (well: Well) => {
    const parsed = parseInt(editValue, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast("Daily target must be a non-negative number", "error");
      return;
    }
    if (parsed === well.dailyTargetLoads) {
      cancelEdit();
      return;
    }
    updateWell.mutate(
      { id: well.id, patch: { dailyTargetLoads: parsed } },
      {
        onSuccess: () => {
          toast(`Updated ${well.name} → ${parsed} loads/day`, "success");
          cancelEdit();
        },
        onError: (err) => {
          toast(`Update failed: ${(err as Error).message}`, "error");
        },
      },
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-7 pt-5 pb-4 border-b border-outline-variant/40 bg-surface-container-lowest header-gradient shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-primary rounded-sm shrink-0" />
          <div>
            <h1 className="font-headline text-[22px] font-extrabold tracking-tight text-on-surface uppercase leading-tight">
              Wells Management
            </h1>
            <p className="text-[11px] font-medium text-outline tracking-[0.08em] uppercase mt-0.5">
              Administration // Well Site Registry
            </p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-7 pt-5 pb-6 space-y-6">
        {/* Filter Bar */}
        <div className="flex items-center gap-2">
          {filterButtons.map((btn) => (
            <button
              key={btn.value}
              onClick={() => setFilter(btn.value)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                filter === btn.value
                  ? "bg-primary-container/12 text-primary-container shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container-high/60 hover:text-on-surface"
              }`}
            >
              {btn.label}
              <span className="ml-1.5 font-label">
                {btn.value === "all"
                  ? wells.length
                  : btn.value === "active"
                    ? wells.filter(
                        (w) =>
                          w.status !== "completed" && w.status !== "closed",
                      ).length
                    : wells.filter((w) => w.status === btn.value).length}
              </span>
            </button>
          ))}
        </div>

        {/* Loading */}
        {wellsQuery.isLoading && (
          <div className="space-y-[1px] bg-on-surface/5 rounded-[12px] overflow-hidden border border-outline-variant/40 card-rest">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="bg-surface-container-low p-5 animate-pulse flex items-center gap-6"
              >
                <div className="h-4 w-40 bg-on-surface/10 rounded" />
                <div className="h-4 w-20 bg-on-surface/5 rounded" />
                <div className="h-4 w-24 bg-on-surface/5 rounded" />
                <div className="h-4 w-16 bg-on-surface/5 rounded" />
                <div className="flex-1" />
                <div className="h-4 w-8 bg-on-surface/5 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {wellsQuery.isError && (
          <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 flex items-center gap-3">
            <span className="material-symbols-outlined text-error text-lg">
              cloud_off
            </span>
            <p className="text-sm text-error font-medium">
              Unable to load wells. Check your connection.
            </p>
          </div>
        )}

        {/* Empty */}
        {!wellsQuery.isLoading &&
          !wellsQuery.isError &&
          filtered.length === 0 && (
            <div className="bg-surface-container-low rounded-xl p-12 border border-on-surface/5 flex flex-col items-center justify-center text-center space-y-4">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant">
                oil_barrel
              </span>
              <h2 className="text-lg font-bold font-headline text-on-surface/60">
                {filter === "all" ? "No Wells Found" : `No ${filter} wells`}
              </h2>
              <p className="text-sm text-on-surface-variant font-body max-w-md">
                {filter === "all"
                  ? "Wells will appear here once synced from PropX."
                  : `No wells with "${filter}" status. Try a different filter.`}
              </p>
            </div>
          )}

        {/* Table */}
        {!wellsQuery.isLoading && filtered.length > 0 && (
          <div className="space-y-[1px] bg-on-surface/5 rounded-[12px] overflow-hidden border border-outline-variant/40 card-rest">
            {/* Header Row */}
            <div className="bg-surface-container-lowest/50 px-6 py-3 flex items-center gap-6 text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
              <div className="flex-1 min-w-[180px]">Name</div>
              <div className="w-24 text-center">Status</div>
              <div className="w-36">PropX Job ID</div>
              <div className="w-28 text-center">Daily Target</div>
              <div
                className="w-24 text-center"
                title="Flag wells whose loading-facility rate isn't dialed in yet — loads going to flagged wells show as 'Need Well Rate Info' on the dispatch desk"
              >
                Needs Rate?
              </div>
              <div className="w-16 text-center">Actions</div>
            </div>

            {/* Data Rows */}
            {pageWells.map((well) => (
              <div
                key={well.id}
                className="bg-surface-container-low hover:bg-surface-container-high transition-all px-6 py-4 flex items-center gap-6"
              >
                {/* Name */}
                <div className="flex-1 min-w-[180px]">
                  <span className="font-bold text-sm text-on-surface">
                    {well.name}
                  </span>
                  {well.aliases.length > 0 && (
                    <span className="ml-2 font-label text-[10px] text-on-surface-variant">
                      +{well.aliases.length} alias
                      {well.aliases.length > 1 ? "es" : ""}
                    </span>
                  )}
                </div>

                {/* Status */}
                <div className="w-24 text-center">
                  <span
                    className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[well.status] ?? "bg-on-surface/10 text-on-surface/60"}`}
                  >
                    {well.status}
                  </span>
                </div>

                {/* PropX Job ID */}
                <div className="w-36">
                  <span className="font-label text-xs text-on-surface/50 truncate block max-w-[130px]">
                    {well.propxJobId ?? "--"}
                  </span>
                </div>

                {/* Daily Target — inline editable */}
                <div className="w-28 text-center">
                  {editingId === well.id ? (
                    <input
                      type="number"
                      min={0}
                      autoFocus
                      value={editValue}
                      disabled={updateWell.isPending}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => saveEdit(well)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(well);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className="w-16 text-center px-1.5 py-0.5 text-sm font-bold rounded border border-primary/40 focus:border-primary focus:outline-none bg-background tabular-nums"
                      aria-label={`Daily target for ${well.name}`}
                    />
                  ) : (
                    <>
                      <span className="font-label text-sm font-bold text-on-surface tabular-nums">
                        {well.dailyTargetLoads}
                      </span>
                      <span className="font-label text-xs text-on-surface-variant ml-1">
                        loads
                      </span>
                    </>
                  )}
                </div>

                {/* Needs Rate Info toggle (O-23) */}
                <div className="w-24 text-center">
                  <label
                    className="inline-flex items-center justify-center cursor-pointer"
                    title={
                      well.needsRateInfo
                        ? "Loads to this well show as 'Need Well Rate Info' on the dispatch desk. Uncheck once the rate is confirmed."
                        : "Flag this well as needing rate info — its loads will surface in burnt-orange on the dispatch desk."
                    }
                  >
                    <input
                      type="checkbox"
                      checked={!!well.needsRateInfo}
                      disabled={updateWell.isPending}
                      onChange={(e) => {
                        updateWell.mutate(
                          {
                            id: well.id,
                            patch: { needsRateInfo: e.target.checked },
                          },
                          {
                            onSuccess: () =>
                              toast(
                                `${well.name} ${
                                  e.target.checked
                                    ? "flagged as needing rate"
                                    : "rate-flag cleared"
                                }`,
                                "success",
                              ),
                            onError: (err) =>
                              toast(
                                `Update failed: ${(err as Error).message}`,
                                "error",
                              ),
                          },
                        );
                      }}
                      className="w-4 h-4 rounded accent-primary-container cursor-pointer disabled:opacity-40"
                      aria-label={`Toggle needs-rate-info for ${well.name}`}
                    />
                  </label>
                </div>

                {/* Actions */}
                <div className="w-16 text-center">
                  <button
                    onClick={() => startEdit(well)}
                    disabled={editingId === well.id}
                    aria-label={`Edit daily target for ${well.name}`}
                    className="p-2 hover:bg-surface-container-highest rounded-lg transition-colors cursor-pointer text-on-surface-variant hover:text-primary-container disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-lg">
                      edit
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination — only show when more than one page (P2-10) */}
        {!wellsQuery.isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between text-xs">
            <div className="text-on-surface/50 font-label">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-md border border-outline-variant/40 font-bold uppercase tracking-wide text-on-surface/60 hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
              >
                Prev
              </button>
              <span className="font-label text-on-surface/60 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-md border border-outline-variant/40 font-bold uppercase tracking-wide text-on-surface/60 hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
