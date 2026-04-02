import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: string;
}

const styles: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-container text-on-primary-container hover:brightness-110 shadow-lg shadow-primary-container/20 active:scale-[0.98]",
  secondary:
    "bg-surface-container-high text-on-surface border border-outline-variant/30 hover:bg-surface-container-highest",
  ghost:
    "bg-transparent text-on-surface/60 hover:text-on-surface hover:bg-surface-container-high",
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
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-headline font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${styles[variant]} ${className}`}
      {...props}
    >
      {icon && (
        <span className="material-symbols-outlined text-sm">{icon}</span>
      )}
      {children}
    </button>
  );
}
