import { memo } from "react";
import { StagePill } from "./StagePill";
import type { WorkbenchRow as Row, HandlerStage } from "../types/api";

interface WorkbenchRowProps {
  row: Row;
  selected: boolean;
  onToggleSelect: () => void;
  onRowClick: () => void;
  onPrimaryAction: () => void;
  isPending?: boolean;
}

// Returns the CTA label for the current stage. Keep text short — the
// button has to fit next to the other columns.
function primaryActionLabel(stage: HandlerStage): string {
  switch (stage) {
    case "uncertain":
      return "Resolve";
    case "ready_to_build":
      return "Build + Duplicate";
    case "building":
      return "Mark Entered";
    case "entered":
      return "Mark Cleared";
    case "cleared":
      return "";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function PhaseBadges({
  pickup,
  delivery,
}: {
  pickup: Row["pickupState"];
  delivery: Row["deliveryState"];
}) {
  const color = (s: Row["pickupState"]): string =>
    s === "complete"
      ? "bg-emerald-500"
      : s === "in_progress"
        ? "bg-blue-500"
        : "bg-slate-600";
  return (
    <div className="flex items-center gap-1 text-xs text-on-surface-variant">
      <span
        className={`w-2 h-2 rounded-full ${color(pickup)}`}
        title={`Pickup: ${pickup ?? "pending"}`}
      />
      <span
        className={`w-2 h-2 rounded-full ${color(delivery)}`}
        title={`Delivery: ${delivery ?? "pending"}`}
      />
    </div>
  );
}

export const WorkbenchRow = memo(function WorkbenchRow({
  row,
  selected,
  onToggleSelect,
  onRowClick,
  onPrimaryAction,
  isPending,
}: WorkbenchRowProps) {
  const handlerColor = row.currentHandlerColor ?? "#334155";
  const actionLabel = primaryActionLabel(row.handlerStage);

  return (
    <div
      className="group relative flex items-stretch bg-surface border border-surface-variant rounded-md hover:border-primary/40 cursor-pointer"
      onClick={onRowClick}
    >
      <div
        className="w-1 rounded-l-md"
        style={{ backgroundColor: handlerColor }}
        title={
          row.currentHandlerName ? `On ${row.currentHandlerName}` : "Unclaimed"
        }
      />

      <div className="flex-1 grid grid-cols-12 gap-2 items-center px-3 py-2 text-sm">
        <div className="col-span-1 flex items-center gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select load ${row.loadNo}`}
            className="h-4 w-4"
          />
          <PhaseBadges pickup={row.pickupState} delivery={row.deliveryState} />
        </div>

        <div className="col-span-2 truncate">
          <div className="font-medium">{row.loadNo}</div>
          <div className="text-xs text-on-surface-variant truncate">
            {row.wellName ?? "— no well"}
          </div>
        </div>

        <div className="col-span-2 truncate">
          <div>{row.driverName ?? "--"}</div>
          <div className="text-xs text-on-surface-variant truncate">
            {row.carrierName ?? ""}
          </div>
        </div>

        <div className="col-span-2 truncate">
          <div className="font-mono text-xs">
            {row.bolNo ?? row.ticketNo ?? "--"}
          </div>
          <div className="text-xs text-on-surface-variant">
            {row.weightTons ? `${row.weightTons} t` : "--"}
          </div>
        </div>

        <div className="col-span-1">
          {row.photoThumbUrl ? (
            <img
              src={row.photoThumbUrl}
              alt=""
              className="h-8 w-8 object-cover rounded"
            />
          ) : row.photoStatus === "missing" ? (
            <span className="text-xs text-red-400">no photo</span>
          ) : (
            <span className="text-xs text-on-surface-variant">
              {row.photoStatus ?? "--"}
            </span>
          )}
        </div>

        <div className="col-span-2">
          <StagePill stage={row.handlerStage} />
          <div className="text-xs text-on-surface-variant mt-0.5">
            {formatDate(row.stageChangedAt)}
          </div>
        </div>

        <div className="col-span-2 text-right">
          {actionLabel ? (
            <button
              type="button"
              disabled={isPending}
              onClick={(e) => {
                e.stopPropagation();
                onPrimaryAction();
              }}
              className="px-3 py-1 text-xs font-medium rounded bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "…" : actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
});
