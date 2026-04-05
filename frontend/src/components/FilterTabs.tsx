interface FilterTabsProps {
  activeFilter: string;
  filterCounts: Record<string, number>;
  onFilterChange: (filter: string) => void;
}

const FILTERS = [
  "all",
  "pending",
  "assigned",
  "reconciled",
  "ready",
  "validated",
] as const;

export function FilterTabs({
  activeFilter,
  filterCounts,
  onFilterChange,
}: FilterTabsProps) {
  return (
    <div className="flex items-center gap-0.5 bg-surface-container-lowest border border-outline-variant/40 rounded-[10px] p-1 overflow-x-auto card-rest">
      {FILTERS.map((filter) => (
        <button
          key={filter}
          onClick={() => onFilterChange(filter)}
          className={`px-3.5 py-1.5 rounded-md text-xs font-semibold capitalize whitespace-nowrap transition-all cursor-pointer ${
            activeFilter === filter
              ? "bg-surface-container-high text-on-surface"
              : "text-outline hover:text-on-surface"
          }`}
        >
          {filter}
          <span className="inline-flex items-center justify-center bg-surface-container-highest text-outline rounded-[10px] text-[10px] font-bold px-1.5 py-px ml-1 tabular-nums">
            {filterCounts[filter] ?? 0}
          </span>
        </button>
      ))}
      <div className="flex-1 min-w-2" />
      <div className="flex items-center gap-3 px-1.5 shrink-0">
        <span className="flex items-center gap-[5px] text-[11px] font-medium text-outline">
          <span className="w-2 h-2 rounded-full bg-tertiary shrink-0" />
          {filterCounts.validated ?? 0} validated
        </span>
        <span className="flex items-center gap-[5px] text-[11px] font-medium text-outline">
          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
          {filterCounts.ready ?? 0} ready
        </span>
        <span className="flex items-center gap-[5px] text-[11px] font-medium text-outline">
          <span className="w-2 h-2 rounded-full bg-surface-container-highest shrink-0" />
          {filterCounts.pending ?? 0} pending
        </span>
      </div>
    </div>
  );
}
