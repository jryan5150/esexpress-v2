import type { Well } from "../types/api";

interface WellTabBarProps {
  pinnedWellIds: string[];
  selectedWellId: string;
  wells: Well[];
  onSelectWell: (id: string) => void;
  onUnpinWell: (id: string) => void;
}

export function WellTabBar({
  pinnedWellIds,
  selectedWellId,
  wells,
  onSelectWell,
  onUnpinWell,
}: WellTabBarProps) {
  if (pinnedWellIds.length === 0) return null;

  return (
    <div className="px-7 pt-3 pb-0 flex items-center gap-1 overflow-x-auto shrink-0 border-b border-outline-variant/20">
      {pinnedWellIds.map((wId) => {
        const w = wells.find((well) => String(well.id) === wId);
        const isActive = wId === selectedWellId;
        return (
          <button
            key={wId}
            onClick={() => onSelectWell(wId)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-t-lg transition-all cursor-pointer whitespace-nowrap ${
              isActive
                ? "bg-surface-container-lowest text-primary border border-outline-variant/40 border-b-transparent -mb-px"
                : "text-outline hover:text-on-surface hover:bg-surface-container-high/50"
            }`}
          >
            <span className="material-symbols-outlined text-sm">
              oil_barrel
            </span>
            {w?.name ?? `Well #${wId}`}
            <span
              onClick={(e) => {
                e.stopPropagation();
                onUnpinWell(wId);
              }}
              className="ml-1 text-outline/40 hover:text-error transition-colors"
            >
              <span className="material-symbols-outlined text-xs">close</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
