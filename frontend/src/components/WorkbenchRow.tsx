import { memo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { StagePill } from "./StagePill";
import { PcsPill } from "./PcsPill";
import { PhotoStateBadge } from "./PhotoStateBadge";
import { MatchScoreBadge } from "./MatchScoreBadge";
import { PhotoLightbox } from "./PhotoLightbox";
import { BOLDisplay } from "./BOLDisplay";
import { useWeightUnit } from "../hooks/use-weight-unit";
import { api } from "../lib/api";
import { resolvePhotoUrl } from "../lib/photo-url";
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

// Returns the CTA label, hover-explanation, and variant for the current stage.
// Short label for column fit; tooltip carries the explanation Jessica needs
// when she's first learning the surface.
// Clean uncertain (no reasons) gets the fast-path "Confirm" button in green;
// triggered uncertain (reasons present) shows "Resolve" in primary.
function primaryAction(
  stage: HandlerStage,
  clean: boolean,
): {
  label: string;
  title: string;
  variant: "confirm" | "primary" | "ghost";
} {
  switch (stage) {
    case "uncertain":
      return clean
        ? {
            label: "Confirm",
            title:
              "All validation checks pass on this load — move it to Ready-to-Build for the builder.",
            variant: "confirm",
          }
        : {
            label: "Resolve",
            title:
              "This load has one or more open validation reasons. Click to review and either fix them or flag with a note.",
            variant: "primary",
          };
    case "ready_to_build":
      return {
        label: "Build in PCS",
        title:
          "Start building this load in PCS. Moves the row to Building and (for ready-to-build batches) creates follow-up assignments for duplicate shipments.",
        variant: "primary",
      };
    case "building":
      return {
        label: "Mark Entered",
        title:
          "PCS load created — moves this row to Entered, awaiting PCS to clear it.",
        variant: "primary",
      };
    case "entered":
      return {
        label: "Mark Cleared",
        title:
          "PCS has cleared this load. Moves it out of the active workbench into the Cleared archive.",
        variant: "primary",
      };
    case "cleared":
      return { label: "", title: "", variant: "ghost" };
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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const { format: formatWeight } = useWeightUnit();
  const qc = useQueryClient();

  // Prefetch photo list on hover/focus. Warms the query cache so opening
  // the drawer has photos ready instead of showing a spinner. Cheap —
  // ~300 bytes per assignment, cached with staleTime:Infinity in the
  // hook, so repeated hovers don't refetch.
  const prefetchPhotos = () => {
    if (!row.assignmentId || (row.photoCount ?? 0) < 2) return;
    qc.prefetchQuery({
      queryKey: ["workbench", "photos", row.assignmentId],
      queryFn: () =>
        api
          .get<
            string[] | { data: string[] }
          >(`/dispatch/workbench/${row.assignmentId}/photos`)
          .then((r) =>
            Array.isArray(r) ? r : ((r as { data: string[] })?.data ?? []),
          ),
      staleTime: Number.POSITIVE_INFINITY,
    });
  };

  return (
    <div
      className="group relative flex items-stretch bg-surface border border-surface-variant rounded-md hover:border-primary/40 cursor-pointer"
      onClick={onRowClick}
      onMouseEnter={prefetchPhotos}
      onFocus={prefetchPhotos}
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
          <BOLDisplay
            ticketNo={row.ticketNo}
            bolNo={row.bolNo}
            loadSource={row.loadSource}
            size="sm"
            showSourcePrefix
          />
          <div className="text-[11px] text-on-surface-variant mt-0.5">
            {formatWeight(row.weightTons)}
          </div>
        </div>

        <div className="col-span-1">
          {row.photoThumbUrl ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxOpen(true);
              }}
              title={
                row.photoCount > 1
                  ? `${row.photoCount} photos — click to enlarge`
                  : "Click to enlarge"
              }
              className="relative cursor-zoom-in inline-block"
            >
              <img
                src={resolvePhotoUrl(row.photoThumbUrl)}
                alt={`Load ${row.loadNo} ticket photo`}
                className="h-8 w-8 object-cover rounded ring-1 ring-outline-variant hover:ring-primary"
              />
              {row.photoCount > 1 && (
                <span
                  className="absolute -top-1 -right-1 bg-primary text-on-primary text-[9px] font-bold leading-none rounded-full px-1 py-0.5 tabular-nums ring-1 ring-surface shadow"
                  aria-label={`${row.photoCount} photos`}
                >
                  {row.photoCount}
                </span>
              )}
            </button>
          ) : row.photoStatus === "missing" ? (
            <span className="text-xs text-red-700">no photo</span>
          ) : (
            <span className="text-xs text-on-surface-variant">
              {row.photoStatus ?? "--"}
            </span>
          )}
        </div>

        <div className="col-span-2">
          <div className="flex flex-wrap items-center gap-1">
            <StagePill stage={row.handlerStage} clean={isCleanUncertain} />
            <PcsPill pcsStatus={row.pcsStatus} pcsLoadId={row.pcsLoadId} />
            <PhotoStateBadge row={row} compact />
          </div>
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
              title="Flag this row — pick a reason (Missing Ticket, Missing Driver, Needs Rate, Other) and it routes to the matching sub-filter tab."
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
              title={action.title}
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
      <PhotoLightbox
        url={lightboxOpen ? row.photoThumbUrl : null}
        alt={`Load ${row.loadNo} ticket photo`}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
});
