type ChipVariant = "ready" | "warning" | "error" | "info" | "neutral";

const config: Record<
  ChipVariant,
  { dot: string; bg: string; text: string; icon: string }
> = {
  ready: {
    dot: "bg-tertiary",
    bg: "bg-tertiary/10",
    text: "text-tertiary",
    icon: "✓",
  },
  warning: {
    dot: "bg-primary-container",
    bg: "bg-primary-container/10",
    text: "text-primary-container",
    icon: "⚠",
  },
  error: { dot: "bg-error", bg: "bg-error/10", text: "text-error", icon: "✗" },
  info: {
    dot: "bg-primary",
    bg: "bg-primary/10",
    text: "text-primary",
    icon: "●",
  },
  neutral: {
    dot: "bg-on-surface/40",
    bg: "bg-on-surface/5",
    text: "text-on-surface/50",
    icon: "—",
  },
};

interface StatusChipProps {
  variant: ChipVariant;
  label: string;
  count?: number;
}

export function StatusChip({ variant, label, count }: StatusChipProps) {
  const c = config[variant];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-label text-[10px] font-bold uppercase tracking-wider ${c.bg} ${c.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.icon} {label}
      {count !== undefined && <span className="opacity-60">({count})</span>}
    </span>
  );
}

export type { ChipVariant };
