interface StatusDotProps {
  status: "green" | "yellow" | "red";
  size?: "sm" | "md";
}

const colorMap: Record<string, { bg: string; glow: string }> = {
  green: {
    bg: "bg-tertiary",
    glow: "shadow-[0_0_6px_theme(--color-tertiary)]",
  },
  yellow: {
    bg: "bg-amber-400",
    glow: "shadow-[0_0_6px_theme(--color-amber-400)]",
  },
  red: { bg: "bg-error", glow: "shadow-[0_0_6px_theme(--color-error)]" },
};

const sizeMap = {
  sm: "h-2 w-2",
  md: "h-3 w-3",
};

export function StatusDot({ status, size = "sm" }: StatusDotProps) {
  const { bg, glow } = colorMap[status];
  return (
    <span
      className={`inline-block rounded-full ${bg} ${glow} ${sizeMap[size]}`}
      role="status"
      aria-label={`Status: ${status}`}
    />
  );
}
