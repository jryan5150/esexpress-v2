type VerifyStatus = "verified" | "mismatch" | "missing";

interface VerificationItem {
  label: string;
  status: VerifyStatus;
  detail?: string;
}

interface VerificationRowProps {
  items: VerificationItem[];
  compact?: boolean;
}

const statusConfig: Record<VerifyStatus, { icon: string; cls: string }> = {
  verified: { icon: "check_circle", cls: "text-tertiary" },
  mismatch: { icon: "warning", cls: "text-primary-container" },
  missing: { icon: "cancel", cls: "text-error" },
};

export function VerificationRow({
  items,
  compact = false,
}: VerificationRowProps) {
  return (
    <div className="flex items-center gap-4">
      {items.map((item) => {
        const cfg = statusConfig[item.status];
        return (
          <span
            key={item.label}
            className={`inline-flex items-center gap-1 font-label text-[10px] font-medium ${cfg.cls}`}
          >
            <span className="material-symbols-outlined text-xs">
              {cfg.icon}
            </span>
            {compact
              ? item.label
              : item.detail || `${item.label} ${item.status}`}
          </span>
        );
      })}
    </div>
  );
}

export type { VerifyStatus, VerificationItem };
