import { memo } from "react";
import { StagePill } from "./StagePill";
import { MatchScoreBadge } from "./MatchScoreBadge";
import type {
  WorkbenchRow as Row,
  HandlerStage,
  LoadSource,
} from "../types/api";

interface WorkbenchRowProps {
  row: Row;
  selected: boolean;
  onToggleSelect: () => void;
  onRowClick: () => void;
  onPrimaryAction: () => void;
  onFlagAction?: () => void;
  isPending?: boolean;
}

const SOURCE_LABEL: Record<LoadSource, string> = {
  propx: "PropX",
  logistiq: "Logistiq",
  jotform: "JotForm",
  manual: "Manual",
};

// Traffic-light palette — matches Jessica's Load Count sheet + sign-off portal.
// Light-theme variant (text-{color}-900 on bg-{color}-100) — was unreadable
// with the dark-theme defaults the original WB-design used.
const SOURCE_CLASS: Record<LoadSource, string> = {
  propx: "bg-blue-100 text-blue-900 border-blue-500",
  logistiq: "bg-amber-100 text-amber-900 border-amber-600",
  jotform: "bg-emerald-100 text-emerald-900 border-emerald-500",
  manual: "bg-purple-100 text-purple-900 border-purple-500",
};

function SourceBadge({ source }: { source: LoadSource }) {
  const cls = SOURCE_CLASS[source] ?? SOURCE_CLASS.manual;
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border ${cls}`}
      title={`Ingested via ${SOURCE_LABEL[source] ?? source}`}
    >
      {SOURCE_LABEL[source] ?? source}
    </span>
  );
}

// Returns the CTA label + variant for the current stage. Keep text short —
// the button has to fit next to the other columns.
// Clean uncertain (no reasons) gets the fast-path "Confirm → Yellow" button
// in green; triggered uncertain (reasons present) shows "Resolve" in primary.
function primaryAction(
  stage: HandlerStage,
  clean: boolean,
): { label: string; variant: "confirm" | "primary" | "ghost" } {
  switch (stage) {
    case "uncertain":
      return clean
        ? { label: "Confirm → Yellow", variant: "confirm" }
        : { label: "Resolve", variant: "primary" };
    case "ready_to_build":
      return { label: "Build + Duplicate", variant: "primary" };
    case "building":
      return { label: "Mark Entered", variant: "primary" };
    case "entered":
      return { label: "Mark Cleared", variant: "primary" };
    case "cleared":
      return { label: "", variant: "ghost" };
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
  onFlagAction,
  isPending,
}: WorkbenchRowProps) {
  const handlerColor = row.currentHandlerColor ?? "#334155";
  const isCleanUncertain =
    row.handlerStage === "uncertain" && row.uncertainReasons.length === 0;
  const action = primaryAction(row.handlerStage, isCleanUncertain);

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
          <div className="flex items-center gap-1.5">
            <SourceBadge source={row.loadSource} />
            <span className="font-medium truncate">{row.loadNo}</span>
            <MatchScoreBadge
              score={row.matchScore}
              tier={row.matchTier}
              drivers={row.matchDrivers}
            />
          </div>
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
          <div className="flex items-baseline gap-2">
            <span className="text-[9px] uppercase tracking-wider text-on-surface-variant w-10 shrink-0">
              BOL
            </span>
            <span className="font-mono text-xs">
              {row.bolNo ?? "--"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[9px] uppercase tracking-wider text-on-surface-variant w-10 shrink-0">
              Ticket
            </span>
            <span className="font-mono text-[11px] text-on-surface-variant">
              {row.ticketNo ?? "--"}
            </span>
          </div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">
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
          <StagePill stage={row.handlerStage} clean={isCleanUncertain} />
          <div className="text-xs text-on-surface-variant mt-0.5">
            {formatDate(row.stageChangedAt)}
          </div>
        </div>

        <div className="col-span-2 text-right flex items-center justify-end gap-1.5">
          {/* Flag back — direct one-click action on uncertain rows. Routes
              the assignment via flag_other so dispatcher can mark "not for
              me / not right" without opening the Resolve modal. */}
          {row.handlerStage === "uncertain" && onFlagAction ? (
            <button
              type="button"
              disabled={isPending}
              onClick={(e) => {
                e.stopPropagation();
                onFlagAction();
              }}
              title="Flag back — mark this row for review by someone else"
              className="px-2 py-1 text-xs font-medium rounded border border-rose-400 bg-rose-50 text-rose-800 hover:bg-rose-100 disabled:opacity-50"
            >
              Flag
            </button>
          ) : null}
          {action.label ? (
            <button
              type="button"
              disabled={isPending}
              onClick={(e) => {
                e.stopPropagation();
                onPrimaryAction();
              }}
              className={
                "px-3 py-1 text-xs font-medium rounded disabled:opacity-50 " +
                (action.variant === "confirm"
                  ? "bg-emerald-600 text-white hover:bg-emerald-500"
                  : action.variant === "primary"
                    ? "bg-primary text-on-primary hover:bg-primary/90"
                    : "bg-surface-variant text-on-surface hover:bg-surface-variant/80")
              }
            >
              {isPending ? "…" : action.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
});
