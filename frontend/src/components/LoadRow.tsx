import { memo } from "react";
import {
  LOAD_COUNT_STATUS,
  deriveLoadCountStatus,
  pillTextColor,
  type LoadCountStatus,
} from "../lib/load-count-status";

type ValidationStatus = "validated" | "pending" | "missing";

interface LoadRowProps {
  assignmentId: number;
  loadNo: string;
  driverName: string | null;
  carrierName: string | null;
  weightTons: string | null;
  bolNo: string | null;
  truckNo: string | null;
  ticketNo: string | null;
  deliveredOn: string | null;
  validationStatus: ValidationStatus;
  assignmentStatus?: string | null;
  historicalComplete?: boolean;
  checked: boolean;
  entered: boolean;
  canEnter: boolean;
  hasPhotos: boolean;
  assignedToName?: string | null;
  assignedToColor?: string | null;
  bolMatchStatus?: "match" | "mismatch" | null;
  onToggleSelect: () => void;
  onMarkEntered: () => void;
  onValidate: () => void;
  onViewPhotos: () => void;
  onRowClick?: () => void;
  onClaim?: () => void;
  onMissingTicket?: () => void;
  isPending?: boolean;
}

function formatDate(d: string | null): string {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

export type { ValidationStatus, LoadRowProps };

export const LoadRow = memo(function LoadRow({
  loadNo,
  driverName,
  carrierName,
  weightTons,
  bolNo,
  truckNo,
  ticketNo,
  deliveredOn,
  validationStatus,
  assignmentStatus,
  historicalComplete,
  checked,
  entered,
  canEnter,
  hasPhotos,
  assignedToName,
  assignedToColor,
  bolMatchStatus,
  onToggleSelect,
  onMarkEntered,
  onValidate,
  onViewPhotos,
  onRowClick,
  onClaim,
  onMissingTicket,
  isPending,
}: LoadRowProps) {
  const isValidated = validationStatus === "validated";
  const isMissing = validationStatus === "missing";
  const dimmed = !isValidated && !entered;

  // Load Count Sheet status — drives the left-edge stripe + pill color.
  // Mirrors the vocabulary + palette the team uses on their daily sheet.
  const loadCountStatus: LoadCountStatus = deriveLoadCountStatus({
    driverName,
    ticketNo,
    bolNo,
    assignmentStatus,
    historicalComplete,
  });
  const statusMeta = LOAD_COUNT_STATUS[loadCountStatus];

  return (
    <div
      onClick={(e) => {
        // Don't trigger row click for interactive elements
        if ((e.target as HTMLElement).closest("button, input, a")) return;
        onRowClick?.();
      }}
      className={`grid items-center gap-3 bg-surface-container-lowest border border-outline-variant/40 rounded-[10px] px-3.5 py-2.5 shadow-sm card-rest press-scale transition-all hover:border-primary-container/20 hover:shadow-md cursor-pointer ${
        dimmed ? "opacity-95 hover:opacity-100" : ""
      } ${entered ? "opacity-40" : ""}`}
      style={{
        gridTemplateColumns: "28px 90px 120px 1fr 64px 110px 110px 86px 120px",
        borderLeftWidth: "4px",
        borderLeftColor: statusMeta.hex,
      }}
    >
      {/* Checkbox */}
      <div
        className="flex items-center justify-center"
        onClick={(e) => {
          e.stopPropagation();
          if (!isMissing) onToggleSelect();
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          readOnly
          disabled={isMissing}
          className="w-4 h-4 rounded accent-primary-container cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed pointer-events-none"
        />
      </div>

      {/* Status pill — Load Count Sheet palette */}
      <div>
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide"
          style={{
            backgroundColor: statusMeta.hex,
            color: pillTextColor(statusMeta.hex),
          }}
          title={statusMeta.label}
        >
          {statusMeta.label}
        </span>
      </div>

      {/* Load # */}
      <div className="font-label text-[13px] font-bold text-on-surface tabular-nums">
        #{loadNo}
      </div>

      {/* Driver + Carrier + Assignee */}
      <div className="min-w-0">
        <div className="font-bold text-[14px] text-on-surface truncate">
          {driverName || "--"}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-on-surface-variant truncate">
            {carrierName || "--"}
          </span>
          {assignedToName ? (
            <span
              className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0 rounded-full shrink-0"
              style={{
                backgroundColor: assignedToColor
                  ? `${assignedToColor}15`
                  : "var(--md-sys-color-surface-container-high)",
                color:
                  assignedToColor ?? "var(--md-sys-color-on-surface-variant)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: assignedToColor ?? "currentColor" }}
              />
              {assignedToName.split(" ")[0]}
            </span>
          ) : onClaim ? (
            <button
              aria-label="Claim this load"
              onClick={(e) => {
                e.stopPropagation();
                onClaim();
              }}
              className="text-[9px] font-bold text-outline/40 hover:text-primary-container px-1 cursor-pointer transition-colors"
            >
              Claim
            </button>
          ) : null}
        </div>
      </div>

      {/* Weight */}
      <div className="text-right">
        <span className="font-label text-[14px] font-bold text-on-surface tabular-nums">
          {weightTons ? `${parseFloat(weightTons).toFixed(1)}t` : "--"}
        </span>
      </div>

      {/* BOL / Truck */}
      <div className="flex flex-col gap-0.5">
        <span className="font-label text-[13px] font-bold text-on-surface truncate inline-flex items-center gap-1 tabular-nums">
          {bolNo || "--"}
          {bolMatchStatus === "match" && (
            <span
              className="material-symbols-outlined text-[11px] text-tertiary"
              title="BOL last-4 match"
            >
              verified
            </span>
          )}
          {bolMatchStatus === "mismatch" && (
            <span
              className="material-symbols-outlined text-[11px] text-error"
              title="BOL mismatch"
            >
              warning
            </span>
          )}
        </span>
        <span className="text-[12px] font-medium text-on-surface-variant tabular-nums">
          {truckNo || ""}
        </span>
      </div>

      {/* Ticket */}
      <div>
        {isMissing ? (
          <span className="font-label text-[11px] font-bold text-error uppercase">
            MISSING
          </span>
        ) : (
          <span className="font-label text-[13px] font-bold text-on-surface tabular-nums">
            {ticketNo || "--"}
          </span>
        )}
      </div>

      {/* Date */}
      <div className="text-right">
        <span className="text-[12px] font-semibold text-on-surface-variant whitespace-nowrap">
          {formatDate(deliveredOn)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 justify-end">
        {hasPhotos && (
          <button
            onClick={onViewPhotos}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-outline-variant/40 text-outline hover:bg-surface-container-high hover:text-on-surface transition-all cursor-pointer icon-hover"
            aria-label="View BOL photos"
          >
            <span className="material-symbols-outlined text-sm">image</span>
          </button>
        )}
        {isValidated ? (
          canEnter && !entered ? (
            <button
              onClick={onMarkEntered}
              disabled={isPending}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-outline-variant/40 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-sm">
                check_circle
              </span>
              Mark Entered
            </button>
          ) : entered ? (
            <span className="text-[10px] font-bold uppercase tracking-wide text-tertiary">
              Entered
            </span>
          ) : null
        ) : !isMissing ? (
          <button
            onClick={onValidate}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide bg-tertiary text-on-tertiary hover:brightness-110 transition-all cursor-pointer success-glow"
          >
            <span className="material-symbols-outlined text-sm">verified</span>
            Validate
          </button>
        ) : (
          <button
            onClick={onMissingTicket}
            disabled={!onMissingTicket}
            title={
              onMissingTicket
                ? "Flag this load for review"
                : "Flag-for-review coming soon — message Jessica directly for now"
            }
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-error/25 text-[10px] font-bold uppercase tracking-wide text-error hover:bg-error/5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <span className="material-symbols-outlined text-sm">report</span>
            Missing Ticket
          </button>
        )}
      </div>
    </div>
  );
});
