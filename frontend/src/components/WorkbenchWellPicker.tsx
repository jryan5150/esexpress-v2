import { useMemo } from "react";
import type { WorkbenchRow } from "../types/api";

interface Props {
  rows: WorkbenchRow[];
  selectedWell: string | null;
  onSelect: (wellName: string | null) => void;
}

interface WellBucket {
  name: string;
  displayName: string;
  count: number;
  uncertainCount: number;
  readyCount: number;
}

const UNASSIGNED_KEY = "__unassigned__";
const UNASSIGNED_LABEL = "(no well assigned)";

function bucketRows(rows: WorkbenchRow[]): WellBucket[] {
  const map = new Map<string, WellBucket>();
  for (const r of rows) {
    const name = r.wellName ?? UNASSIGNED_KEY;
    const displayName = r.wellName ?? UNASSIGNED_LABEL;
    const entry = map.get(name) ?? {
      name,
      displayName,
      count: 0,
      uncertainCount: 0,
      readyCount: 0,
    };
    entry.count += 1;
    if (r.handlerStage === "uncertain") entry.uncertainCount += 1;
    if (r.handlerStage === "ready_to_build") entry.readyCount += 1;
    map.set(name, entry);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.name === UNASSIGNED_KEY) return 1;
    if (b.name === UNASSIGNED_KEY) return -1;
    return a.displayName.localeCompare(b.displayName);
  });
}

export function WorkbenchWellPicker({ rows, selectedWell, onSelect }: Props) {
  const wells = useMemo(() => bucketRows(rows), [rows]);
  const totalCount = rows.length;

  return (
    <div
      data-workbench-well-picker
      className="w-60 shrink-0 overflow-auto border-r border-surface-variant pr-2"
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between gap-2 ${
          selectedWell === null
            ? "bg-primary/10 text-on-surface font-medium"
            : "hover:bg-surface-variant text-on-surface-variant"
        }`}
      >
        <span>All wells</span>
        <span className="text-xs text-on-surface-variant">{totalCount}</span>
      </button>
      <div className="my-1 border-t border-surface-variant" />
      {wells.length === 0 ? (
        <div className="text-xs text-on-surface-variant px-2 py-1.5">
          No wells in view.
        </div>
      ) : (
        wells.map((w) => {
          const isSelected = selectedWell === w.name;
          return (
            <button
              key={w.name}
              type="button"
              onClick={() => onSelect(w.name)}
              className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between gap-2 ${
                isSelected
                  ? "bg-primary/10 text-on-surface font-medium"
                  : "hover:bg-surface-variant text-on-surface-variant"
              }`}
              title={w.displayName}
            >
              <span className="truncate">{w.displayName}</span>
              <span className="flex items-center gap-1 shrink-0 text-xs">
                {w.uncertainCount > 0 && (
                  <span
                    className="bg-amber-500/20 text-amber-200 rounded px-1"
                    title={`${w.uncertainCount} uncertain`}
                  >
                    {w.uncertainCount}
                  </span>
                )}
                {w.readyCount > 0 && (
                  <span
                    className="bg-yellow-500/20 text-yellow-200 rounded px-1"
                    title={`${w.readyCount} ready to build`}
                  >
                    {w.readyCount}
                  </span>
                )}
                <span className="text-on-surface-variant">{w.count}</span>
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
