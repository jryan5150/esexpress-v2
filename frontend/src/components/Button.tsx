import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    "bg-[var(--accent)] text-[var(--text-inverse)]",
    "hover:bg-[var(--accent-hover)] hover:shadow-[var(--shadow-glow)]",
  ].join(" "),
  secondary: [
    "bg-[var(--bg-elevated)] text-[var(--text-primary)]",
    "border border-[var(--border-default)]",
    "hover:border-[var(--border-bright)] hover:bg-[var(--bg-overlay)]",
  ].join(" "),
  ghost: [
    "bg-transparent text-[var(--text-secondary)]",
    "hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]",
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
        "rounded-[var(--radius-md)] text-sm font-medium",
        "transition-all duration-[var(--transition-fast)]",
        "disabled:opacity-50",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...props}
    />
  );
}
