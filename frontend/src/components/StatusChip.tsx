type ChipVariant = "ready" | "warning" | "error" | "info" | "neutral";

const config: Record<ChipVariant, { dot: string; bg: string; text: string }> = {
  ready: {
    dot: "bg-tertiary shadow-[0_0_4px_rgba(69,223,164,0.4)]",
    bg: "bg-tertiary/10",
    text: "text-tertiary",
  },
  warning: {
    dot: "bg-primary-container shadow-[0_0_4px_rgba(240,105,44,0.4)]",
    bg: "bg-primary-container/10",
    text: "text-primary-container",
  },
  error: {
    dot: "bg-error shadow-[0_0_4px_rgba(255,180,171,0.4)]",
    bg: "bg-error/10",
    text: "text-error",
  },
  info: {
    dot: "bg-primary",
    bg: "bg-primary/10",
    text: "text-primary",
  },
  neutral: {
    dot: "bg-on-surface/40",
    bg: "bg-on-surface/5",
    text: "text-on-surface/50",
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
      {label}
      {count !== undefined && <span className="opacity-60">({count})</span>}
    </span>
  );
}

export type { ChipVariant };
