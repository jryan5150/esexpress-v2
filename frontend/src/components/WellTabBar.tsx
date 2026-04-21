interface WellStats {
  id: string;
  name: string;
  totalLoads: number;
  dailyTargetLoads: number;
}

interface WellTabBarProps {
  pinnedWellIds: string[];
  selectedWellId: string;
  wellStats: WellStats[];
  onSelectWell: (id: string) => void;
  onUnpinWell: (id: string) => void;
}

export function WellTabBar({
  pinnedWellIds,
  selectedWellId,
  wellStats,
  onSelectWell,
  onUnpinWell,
}: WellTabBarProps) {
  if (pinnedWellIds.length === 0) return null;

  return (
    <div className="px-7 pt-3 pb-0 flex items-center gap-1 overflow-x-auto shrink-0 border-b border-outline-variant/20">
      {pinnedWellIds.map((wId) => {
        const w = wellStats.find((s) => s.id === wId);
        const isActive = wId === selectedWellId;
        const pct =
          w && w.dailyTargetLoads > 0
            ? Math.round((w.totalLoads / w.dailyTargetLoads) * 100)
            : null;
        return (
          <button
            key={wId}
            onClick={() => onSelectWell(wId)}
            className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-t-lg transition-all cursor-pointer whitespace-nowrap ${
              isActive
                ? "bg-surface-container-lowest text-primary border border-outline-variant/40 border-b-transparent -mb-px"
                : "text-outline hover:text-on-surface hover:bg-surface-container-high/50"
            }`}
          >
            <span className="material-symbols-outlined text-sm">
              oil_barrel
            </span>
            <span>{w?.name ?? `Well #${wId}`}</span>
            {w && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`tabular-nums text-[10px] font-bold ${
                    pct !== null && pct >= 100
                      ? "text-tertiary"
                      : pct !== null && pct >= 60
                        ? "text-primary"
                        : "text-outline"
                  }`}
                >
                  {w.totalLoads}
                  {pct !== null ? `/${w.dailyTargetLoads}` : ""}
                </span>
                {pct !== null && (
                  <span className="w-8 h-1.5 bg-outline-variant/20 rounded-full overflow-hidden">
                    <span
                      className={`block h-full rounded-full transition-all ${
                        pct >= 100
                          ? "bg-tertiary"
                          : pct >= 60
                            ? "bg-primary"
                            : "bg-primary-container"
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </span>
                )}
              </span>
            )}
            <span
              onClick={(e) => {
                e.stopPropagation();
                onUnpinWell(wId);
              }}
              className="ml-0.5 text-outline hover:text-error transition-colors"
            >
              <span className="material-symbols-outlined text-xs">close</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
