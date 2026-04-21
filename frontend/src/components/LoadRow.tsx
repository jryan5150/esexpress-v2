import { memo, useEffect, useRef } from "react";
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
  wellNeedsRateInfo?: boolean;
  checked: boolean;
  entered: boolean;
  canEnter: boolean;
  hasPhotos: boolean;
  /** Raw photo pipeline state. Separate from hasPhotos so we can show
   *  "attached" vs "awaiting sync" vs "no photo submitted" distinctly.
   *  Introduced 2026-04-15 post-call to fix the "100% match but no photo"
   *  confusion Jessica surfaced. */
  photoStatus?: "attached" | "pending" | "missing" | null;
  /** Delivery timestamp is used to determine if a missing photo is
   *  "still expected" (<48h) vs "likely never coming" (48h+). */
  deliveryAgeHours?: number | null;
  assignedToName?: string | null;
  assignedToColor?: string | null;
  bolMatchStatus?: "match" | "mismatch" | null;
  /** Highlights the row + scrolls it into view. Driven by keyboard nav (O-07). */
  focused?: boolean;
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
  wellNeedsRateInfo,
  checked,
  entered,
  canEnter,
  hasPhotos,
  photoStatus,
  deliveryAgeHours,
  assignedToName,
  assignedToColor,
  bolMatchStatus,
  focused,
  onToggleSelect,
  onMarkEntered,
  onValidate,
  onViewPhotos,
  onRowClick,
  onClaim,
  onMissingTicket,
  isPending,
}: LoadRowProps) {
  // Scroll into view when keyboard nav lands focus on this row.
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (focused && rowRef.current) {
      rowRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [focused]);
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
    wellNeedsRateInfo,
  });
  const statusMeta = LOAD_COUNT_STATUS[loadCountStatus];

  return (
    <div
      ref={rowRef}
      data-row-id={String(`${loadNo}`)}
      onClick={(e) => {
        // Don't trigger row click for interactive elements
        if ((e.target as HTMLElement).closest("button, input, a")) return;
        onRowClick?.();
      }}
      className={`grid items-center gap-3 bg-surface-container-lowest border rounded-[10px] px-3.5 py-2.5 shadow-sm card-rest press-scale transition-all hover:border-primary-container/20 hover:shadow-md cursor-pointer ${
        focused
          ? "border-primary ring-2 ring-primary/40"
          : "border-outline-variant/40"
      } ${dimmed ? "opacity-95 hover:opacity-100" : ""} ${
        entered ? "opacity-40" : ""
      }`}
      style={{
        gridTemplateColumns: "28px 90px 120px 1fr 64px 110px 86px 120px",
        borderLeftWidth: "4px",
        borderLeftColor: statusMeta.hex,
      }}
    >
      {/* Checkbox — keyboard-accessible (Space/Enter toggle, focus ring) */}
      <div
        role="checkbox"
        aria-checked={checked}
        aria-disabled={isMissing}
        aria-label={`Select load ${loadNo}`}
        tabIndex={isMissing ? -1 : 0}
        className="flex items-center justify-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        onClick={(e) => {
          e.stopPropagation();
          if (!isMissing) onToggleSelect();
        }}
        onKeyDown={(e) => {
          if (isMissing) return;
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelect();
          }
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          readOnly
          disabled={isMissing}
          tabIndex={-1}
          aria-hidden="true"
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
              className="text-[9px] font-bold text-outline hover:text-primary-container px-1 cursor-pointer transition-colors"
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

      {/* BOL / Truck — display the human-recognized number (ticket_no, B-prefixed)
          and fall back to bol_no only when ticket_no is absent. PropX writes
          its internal long number into bol_no (sometimes a PO number entirely),
          so showing that as "BOL" confused the team. The "Ticket" column was
          dropped because ticket_no IS the BOL by the team's vocabulary
          (see project_post_call_corrections.md, 2026-04-06 call findings). */}
      <div className="flex flex-col gap-0.5">
        <span className="font-label text-[13px] font-bold text-on-surface truncate inline-flex items-center gap-1 tabular-nums">
          {isMissing ? (
            <span className="text-error uppercase">MISSING</span>
          ) : (
            ticketNo || bolNo || "--"
          )}
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

      {/* Date */}
      <div className="text-right">
        <span className="text-[12px] font-semibold text-on-surface-variant whitespace-nowrap">
          {formatDate(deliveredOn)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 justify-end">
        {/* Photo state indicator — three distinct states:
            1. attached: photo icon button that opens the viewer
            2. pending: clock icon with tooltip "awaiting photo from driver/sync"
            3. missing: grey icon with tooltip "no photo submitted" */}
        {hasPhotos ? (
          <button
            onClick={onViewPhotos}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-outline-variant/40 text-outline hover:bg-surface-container-high hover:text-on-surface transition-all cursor-pointer icon-hover"
            aria-label="View BOL photos"
            title="Photo attached — click to view"
          >
            <span className="material-symbols-outlined text-sm">image</span>
          </button>
        ) : photoStatus === "pending" ||
          (photoStatus === "missing" &&
            deliveryAgeHours != null &&
            deliveryAgeHours < 48) ? (
          <div
            className="w-7 h-7 flex items-center justify-center rounded-md border border-amber-300/60 bg-amber-50/50 text-amber-700"
            aria-label="Awaiting photo"
            title="Awaiting photo — JotForm sync runs every 30 minutes and will attach the driver's submission when it arrives"
          >
            <span className="material-symbols-outlined text-sm">schedule</span>
          </div>
        ) : photoStatus === "missing" ? (
          <div
            className="w-7 h-7 flex items-center justify-center rounded-md border border-outline-variant/30 bg-surface-container-high/40 text-outline/50"
            aria-label="No photo submitted"
            title="No photo submitted — 48+ hours since delivery, likely needs manual lookup"
          >
            <span className="material-symbols-outlined text-sm">
              no_photography
            </span>
          </div>
        ) : null}
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
