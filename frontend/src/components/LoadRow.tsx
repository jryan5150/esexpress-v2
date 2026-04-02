import { useState, type ReactNode } from "react";
import { StatusChip, type ChipVariant } from "./StatusChip";
import { VerificationRow, type VerificationItem } from "./VerificationRow";

interface LoadRowProps {
  id: string;
  loadNumber: string;
  driverName: string | null;
  weight: number | null;
  verification: VerificationItem[];
  status: ChipVariant;
  statusLabel: string;
  selected: boolean;
  onSelect: (id: string) => void;
  children?: ReactNode;
}

const borderColor: Record<ChipVariant, string> = {
  ready: "border-tertiary",
  warning: "border-primary-container",
  error: "border-error",
  info: "border-primary",
  neutral: "border-on-surface/20",
};

export function LoadRow({
  id,
  loadNumber,
  driverName,
  weight,
  verification,
  status,
  statusLabel,
  selected,
  onSelect,
  children,
}: LoadRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-1">
      <div
        className={`flex items-center gap-3 px-4 py-3 bg-surface-container-low hover:bg-surface-container-high rounded-sm cursor-pointer transition-all border-l-[3px] ${borderColor[status]} ${selected ? "bg-surface-container-high" : ""}`}
        onClick={() => setExpanded(!expanded)}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(id);
          }}
          className="accent-primary-container w-3.5 h-3.5 cursor-pointer"
          aria-label={`Select load ${loadNumber}`}
        />
        <span className="font-label text-sm font-bold text-primary min-w-[60px]">
          {loadNumber}
        </span>
        <span className="text-sm text-on-surface min-w-[120px] truncate">
          {driverName || <span className="text-on-surface/30">—</span>}
        </span>
        <span className="font-label text-sm text-on-surface/70 min-w-[90px]">
          {weight ? (
            `${weight.toLocaleString()} lbs`
          ) : (
            <span className="text-on-surface/20">—</span>
          )}
        </span>
        <div className="flex-1">
          <VerificationRow items={verification} compact />
        </div>
        <StatusChip variant={status} label={statusLabel} />
        <span
          className="material-symbols-outlined text-on-surface/30 text-sm transition-transform"
          style={{ transform: expanded ? "rotate(180deg)" : "" }}
        >
          expand_more
        </span>
      </div>
      {expanded && children && (
        <div className="ml-5 mt-1 mb-2 p-4 bg-surface-container rounded-lg border border-on-surface/5">
          {children}
        </div>
      )}
    </div>
  );
}
