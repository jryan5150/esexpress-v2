import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    "bg-[var(--es-accent)] text-[var(--es-text-inverse)]",
    "hover:bg-[var(--es-accent-hover)] hover:shadow-[var(--es-accent-glow)]",
  ].join(" "),
  secondary: [
    "bg-[var(--es-bg-elevated)] text-[var(--es-text-primary)]",
    "border border-[var(--es-border-default)]",
    "hover:border-[var(--es-border-bright)] hover:bg-[var(--es-bg-overlay)]",
  ].join(" "),
  ghost: [
    "bg-transparent text-[var(--es-text-secondary)]",
    "hover:text-[var(--es-text-primary)] hover:bg-[var(--es-bg-elevated)]",
  ].join(" "),
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        "inline-flex items-center gap-1.5 px-3.5 py-1.5",
        "rounded-[var(--es-radius-md)] text-sm font-medium",
        "transition-all duration-[150ms]",
        "disabled:opacity-50",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...props}
    />
  );
}
