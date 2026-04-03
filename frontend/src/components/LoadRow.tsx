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
  isPending?: boolean;
}

const STATUS_CONFIG: Record<
  ValidationStatus,
  { label: string; dotBg: string; badgeBg: string; badgeText: string }
> = {
  validated: {
    label: "Validated",
    dotBg: "bg-tertiary",
    badgeBg: "bg-tertiary/10",
    badgeText: "text-tertiary",
  },
  pending: {
    label: "Pending",
    dotBg: "bg-primary-container",
    badgeBg: "bg-primary-container/10",
    badgeText: "text-primary-container",
  },
  missing: {
    label: "Missing Ticket",
    dotBg: "bg-error",
    badgeBg: "bg-error/10",
    badgeText: "text-error",
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
  isPending,
}: LoadRowProps) {
  const status = STATUS_CONFIG[validationStatus];
  const isValidated = validationStatus === "validated";
  const isMissing = validationStatus === "missing";
  const dimmed = !isValidated && !entered;

  return (
    <div
      className={`grid items-center gap-3 bg-surface-container-lowest ring-1 ring-on-surface/5 rounded-lg px-3.5 py-2.5 transition-all hover:ring-primary-container/20 hover:shadow-md ${
        dimmed ? "opacity-55 hover:opacity-75" : ""
      } ${entered ? "opacity-40" : ""}`}
      style={{
        gridTemplateColumns:
          "28px 90px minmax(100px, 1fr) 60px 110px 100px 70px auto",
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

      {/* Driver + Load # + Carrier */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[13px] text-on-surface truncate">
            {driverName || "--"}
          </span>
          <span className="font-label text-[11px] text-on-surface/40">
            {loadNo}
          </span>
        </div>
        <span className="text-[11px] text-on-surface/40 truncate block">
          {carrierName || "--"}
        </span>
      </div>

      {/* Weight */}
      <div className="text-right">
        <span className="font-label text-[13px] font-medium text-on-surface tabular-nums">
          {weightTons ? `${parseFloat(weightTons).toFixed(1)}t` : "--"}
        </span>
      </div>

      {/* BOL / Truck */}
      <div>
        <span className="font-label text-[11px] text-on-surface/70 block truncate">
          {bolNo || "--"}
        </span>
        <span className="text-[11px] text-on-surface/35 block">
          {truckNo || ""}
        </span>
      </div>

      {/* Ticket */}
      <div>
        {isMissing ? (
          <span className="font-label text-[11px] font-bold text-error uppercase">
            Missing
          </span>
        ) : (
          <span className="font-label text-[11px] text-on-surface/50">
            {ticketNo || "--"}
          </span>
        )}
      </div>

      {/* Date */}
      <div className="text-right">
        <span className="text-[11px] text-on-surface/40">
          {formatDate(deliveredOn)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 justify-end">
        {hasPhotos && (
          <button
            onClick={onViewPhotos}
            className="w-7 h-7 flex items-center justify-center rounded-md ring-1 ring-on-surface/10 text-on-surface/40 hover:bg-surface-container-high hover:text-primary-container transition-all cursor-pointer"
            aria-label="View BOL photos"
          >
            <span className="material-symbols-outlined text-sm">
              photo_camera
            </span>
          </button>
        )}
        {isValidated ? (
          canEnter && !entered ? (
            <button
              onClick={onMarkEntered}
              disabled={isPending}
              className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide bg-primary-container text-on-primary-container hover:brightness-110 transition-all cursor-pointer disabled:opacity-40"
            >
              Enter
            </button>
          ) : entered ? (
            <span className="text-[10px] font-bold uppercase tracking-wide text-tertiary">
              Entered
            </span>
          ) : null
        ) : !isMissing ? (
          <button
            onClick={onValidate}
            className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide bg-tertiary/10 text-tertiary hover:bg-tertiary/20 transition-all cursor-pointer"
          >
            Validate
          </button>
        ) : null}
      </div>
    </div>
  );
});
