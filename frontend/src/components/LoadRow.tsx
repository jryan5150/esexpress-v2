import { memo } from "react";

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
  checked: boolean;
  entered: boolean;
  canEnter: boolean;
  hasPhotos: boolean;
  onToggleSelect: () => void;
  onMarkEntered: () => void;
  onValidate: () => void;
  onViewPhotos: () => void;
  onRowClick?: () => void;
  isPending?: boolean;
}

const STATUS_CONFIG: Record<
  ValidationStatus,
  { label: string; dotBg: string; badgeBg: string; badgeText: string }
> = {
  validated: {
    label: "Validated",
    dotBg: "bg-tertiary",
    badgeBg: "bg-[#d1fae5]",
    badgeText: "text-[#065f46]",
  },
  pending: {
    label: "Pending",
    dotBg: "bg-primary-container",
    badgeBg: "bg-[#ede9f8]",
    badgeText: "text-primary-container",
  },
  missing: {
    label: "Missing Ticket",
    dotBg: "bg-error",
    badgeBg: "bg-[#fee2e2]",
    badgeText: "text-[#991b1b]",
  },
};

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
  checked,
  entered,
  canEnter,
  hasPhotos,
  onToggleSelect,
  onMarkEntered,
  onValidate,
  onViewPhotos,
  onRowClick,
  isPending,
}: LoadRowProps) {
  const status = STATUS_CONFIG[validationStatus];
  const isValidated = validationStatus === "validated";
  const isMissing = validationStatus === "missing";
  const dimmed = !isValidated && !entered;

  return (
    <div
      onClick={(e) => {
        // Don't trigger row click for interactive elements
        if ((e.target as HTMLElement).closest("button, input, a")) return;
        onRowClick?.();
      }}
      className={`grid items-center gap-3 bg-surface-container-lowest border border-outline-variant/40 rounded-[10px] px-3.5 py-2.5 shadow-sm transition-all hover:border-primary-container/20 hover:shadow-md cursor-pointer ${
        dimmed ? "opacity-55 hover:opacity-75" : ""
      } ${entered ? "opacity-35" : ""}`}
      style={{
        gridTemplateColumns: "28px 90px 120px 1fr 64px 110px 110px 86px 120px",
      }}
    >
      {/* Checkbox */}
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleSelect}
          disabled={isMissing}
          className="w-4 h-4 rounded accent-primary-container cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        />
      </div>

      {/* Status badge */}
      <div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${status.badgeBg} ${status.badgeText}`}
        >
          <span className={`w-[5px] h-[5px] rounded-full ${status.dotBg}`} />
          {status.label}
        </span>
      </div>

      {/* Load # */}
      <div className="font-label text-xs font-medium text-on-surface-variant tabular-nums">
        #{loadNo}
      </div>

      {/* Driver + Carrier */}
      <div className="min-w-0">
        <div className="font-semibold text-[13px] text-on-surface truncate">
          {driverName || "--"}
        </div>
        <div className="text-xs text-outline truncate">
          {carrierName || "--"}
        </div>
      </div>

      {/* Weight */}
      <div className="text-right">
        <span className="font-label text-[13px] font-medium text-on-surface-variant tabular-nums">
          {weightTons ? `${parseFloat(weightTons).toFixed(1)}t` : "--"}
        </span>
      </div>

      {/* BOL / Truck */}
      <div className="flex flex-col gap-0.5">
        <span className="font-label text-[11px] text-on-surface-variant truncate">
          {bolNo || "--"}
        </span>
        <span className="text-[11px] text-outline">{truckNo || ""}</span>
      </div>

      {/* Ticket */}
      <div>
        {isMissing ? (
          <span className="font-label text-[11px] font-bold text-error uppercase">
            MISSING
          </span>
        ) : (
          <span className="font-label text-[11px] text-outline">
            {ticketNo || "--"}
          </span>
        )}
      </div>

      {/* Date */}
      <div className="text-right">
        <span className="text-[11px] text-outline whitespace-nowrap">
          {formatDate(deliveredOn)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 justify-end">
        {hasPhotos && (
          <button
            onClick={onViewPhotos}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-outline-variant/40 text-outline hover:bg-surface-container-high hover:text-on-surface transition-all cursor-pointer"
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
                content_copy
              </span>
              Copy
            </button>
          ) : entered ? (
            <span className="text-[10px] font-bold uppercase tracking-wide text-tertiary">
              Entered
            </span>
          ) : null
        ) : !isMissing ? (
          <button
            onClick={onValidate}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide bg-tertiary text-on-tertiary hover:brightness-110 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">verified</span>
            Validate
          </button>
        ) : (
          <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-error/25 text-[10px] font-bold uppercase tracking-wide text-error hover:bg-error/5 transition-all cursor-pointer">
            <span className="material-symbols-outlined text-sm">report</span>
            Missing Ticket
          </button>
        )}
      </div>
    </div>
  );
});
