import { useState } from "react";
import { useWells } from "../../hooks/use-wells";
import type { Well } from "../../types/api";

type StatusFilter = "all" | "active" | "standby";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-tertiary/10 text-tertiary",
  standby: "bg-primary-container/10 text-primary-container",
  completed: "bg-on-surface/10 text-on-surface/60",
  closed: "bg-error/10 text-error",
};

export function WellsAdmin() {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const wellsQuery = useWells();

  const wells: Well[] = Array.isArray(wellsQuery.data) ? wellsQuery.data : [];

  const filtered =
    filter === "all" ? wells : wells.filter((w) => w.status === filter);

  const filterButtons: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "standby", label: "Standby" },
  ];

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
                  : "text-on-surface/40 hover:bg-surface-container-high/60 hover:text-on-surface/70"
              }`}
            >
              {btn.label}
              {btn.value !== "all" && (
                <span className="ml-1.5 font-label">
                  {
                    wells.filter((w) =>
                      btn.value === "all" ? true : w.status === btn.value,
                    ).length
                  }
                </span>
              )}
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
              <span className="material-symbols-outlined text-5xl text-on-surface/20">
                oil_barrel
              </span>
              <h2 className="text-lg font-bold font-headline text-on-surface/60">
                {filter === "all" ? "No Wells Found" : `No ${filter} wells`}
              </h2>
              <p className="text-sm text-on-surface/40 font-body max-w-md">
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
            <div className="bg-surface-container-lowest/50 px-6 py-3 flex items-center gap-6 text-[10px] uppercase tracking-widest font-bold text-on-surface/30">
              <div className="flex-1 min-w-[180px]">Name</div>
              <div className="w-24 text-center">Status</div>
              <div className="w-36">PropX Job ID</div>
              <div className="w-28 text-center">Daily Target</div>
              <div className="w-16 text-center">Actions</div>
            </div>

            {/* Data Rows */}
            {filtered.map((well) => (
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
                    <span className="ml-2 font-label text-[10px] text-on-surface/30">
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

                {/* Daily Target */}
                <div className="w-28 text-center">
                  <span className="font-label text-sm font-bold text-on-surface">
                    {well.dailyTargetLoads}
                  </span>
                  <span className="font-label text-xs text-on-surface/30 ml-1">
                    loads
                  </span>
                </div>

                {/* Actions */}
                <div className="w-16 text-center">
                  <button className="p-2 hover:bg-surface-container-highest rounded-lg transition-colors cursor-pointer text-on-surface/30 hover:text-primary-container">
                    <span className="material-symbols-outlined text-lg">
                      edit
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
