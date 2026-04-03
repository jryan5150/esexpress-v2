import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: string;
}

const styles: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-container text-on-primary-container hover:brightness-110 shadow-md shadow-primary-container/15 active:scale-[0.98]",
  secondary:
    "bg-surface-container-high text-on-surface/80 border border-on-surface/10 hover:bg-surface-container-highest hover:border-on-surface/15 hover:text-on-surface",
  ghost:
    "bg-transparent text-on-surface/50 hover:text-on-surface/80 hover:bg-surface-container-high/60",
};

export function Button({
  variant = "primary",
  icon,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-xs uppercase tracking-wide transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${styles[variant]} ${className}`}
      {...props}
    >
      {icon && (
        <span className="material-symbols-outlined text-sm">{icon}</span>
      )}
      {children}
    </button>
  );
}
