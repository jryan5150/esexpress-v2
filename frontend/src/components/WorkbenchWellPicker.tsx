import { useMemo } from "react";
import type { WorkbenchRow, Well } from "../types/api";

interface Props {
  rows: WorkbenchRow[];
  /** Full active-well set so the picker ALWAYS shows every active well,
   *  not just wells whose loads happen to match the current filter. Wells
   *  with zero loads in the current filter render at the bottom, muted. */
  allWells?: Well[];
  selectedWell: string | null;
  onSelect: (wellName: string | null) => void;
}

interface WellBucket {
  name: string;
  displayName: string;
  count: number;
  uncertainCount: number;
  readyCount: number;
  isActive: boolean;
}

const UNASSIGNED_KEY = "__unassigned__";
const UNASSIGNED_LABEL = "(no well assigned)";

function bucketRows(rows: WorkbenchRow[], allWells: Well[]): WellBucket[] {
  const map = new Map<string, WellBucket>();
  // Seed with every active well so they all render even at zero count.
  // "active" per wells.status — completed / closed wells stay out of the
  // tabular picker to avoid historical noise.
  for (const w of allWells) {
    if (w.status === "completed" || w.status === "closed") continue;
    map.set(w.name, {
      name: w.name,
      displayName: w.name,
      count: 0,
      uncertainCount: 0,
      readyCount: 0,
      isActive: true,
    });
  }
  for (const r of rows) {
    const name = r.wellName ?? UNASSIGNED_KEY;
    const displayName = r.wellName ?? UNASSIGNED_LABEL;
    const entry = map.get(name) ?? {
      name,
      displayName,
      count: 0,
      uncertainCount: 0,
      readyCount: 0,
      isActive: name !== UNASSIGNED_KEY,
    };
    entry.count += 1;
    if (r.handlerStage === "uncertain") entry.uncertainCount += 1;
    if (r.handlerStage === "ready_to_build") entry.readyCount += 1;
    map.set(name, entry);
  }
  return Array.from(map.values()).sort((a, b) => {
    // Unassigned goes last, then zero-count, then by count desc, then name.
    if (a.name === UNASSIGNED_KEY) return 1;
    if (b.name === UNASSIGNED_KEY) return -1;
    if (a.count === 0 && b.count > 0) return 1;
    if (b.count === 0 && a.count > 0) return -1;
    if (a.count !== b.count) return b.count - a.count;
    return a.displayName.localeCompare(b.displayName);
  });
}

export function WorkbenchWellPicker({
  rows,
  allWells = [],
  selectedWell,
  onSelect,
}: Props) {
  const wells = useMemo(() => bucketRows(rows, allWells), [rows, allWells]);
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
          const isZero = w.count === 0;
          return (
            <button
              key={w.name}
              type="button"
              onClick={() => onSelect(w.name)}
              className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between gap-2 ${
                isSelected
                  ? "bg-primary/10 text-on-surface font-medium"
                  : isZero
                    ? "hover:bg-surface-variant/60 text-on-surface-variant/50"
                    : "hover:bg-surface-variant text-on-surface-variant"
              }`}
              title={
                isZero
                  ? `${w.displayName} — active well, no loads in current filter`
                  : w.displayName
              }
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
                <span
                  className={
                    isZero
                      ? "text-on-surface-variant/40 tabular-nums"
                      : "text-on-surface-variant tabular-nums"
                  }
                >
                  {w.count}
                </span>
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
