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
  verified: { icon: "✓", cls: "text-tertiary" },
  mismatch: { icon: "⚠", cls: "text-primary-container" },
  missing: { icon: "✗", cls: "text-error" },
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
            className={`font-label text-[10px] font-medium ${cfg.cls}`}
          >
            {cfg.icon}{" "}
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
