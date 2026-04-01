import { useState } from "react";
import { NavLink } from "react-router-dom";
import { cycleTheme, getStoredTheme } from "@/lib/theme";
import type { Theme } from "@/lib/theme";

const themeEmoji: Record<Theme, string> = {
  dark: "\u{1F319}",
  light: "\u{2600}\u{FE0F}",
  system: "\u{1F4BB}",
};

function navLinkClass({ isActive }: { isActive: boolean }): string {
  const base = [
    "flex items-center gap-2 px-3 py-2",
    "rounded-[var(--es-radius-md)] text-sm",
    "transition-all duration-[150ms]",
  ].join(" ");

  if (isActive) {
    return `${base} bg-[var(--es-accent-dim)] text-[var(--es-accent)]`;
  }
  return `${base} text-[var(--es-text-secondary)] hover:text-[var(--es-text-primary)] hover:bg-[var(--es-bg-elevated)]`;
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  function handleCycleTheme() {
    const next = cycleTheme();
    setTheme(next);
  }

  return (
    <aside
      className="es-sidebar flex flex-col h-screen shrink-0 overflow-hidden transition-all"
      style={{ width: collapsed ? 64 : 240, minWidth: collapsed ? 64 : 240 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-[var(--es-border-subtle)]">
        <div className="flex items-center justify-center w-8 h-8 rounded-[var(--es-radius-md)] bg-[var(--es-accent)] text-[var(--es-text-inverse)] text-sm font-bold shrink-0">
          ES
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold text-[var(--es-text-primary)]">
            ES Express
          </span>
        )}
      </div>

      {/* Primary Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <NavLink to="/" end className={navLinkClass}>
          <span className="text-[var(--es-accent)]">{"\u25CF"}</span>
          {!collapsed && <span>Exception Feed</span>}
        </NavLink>
        <NavLink to="/bol" className={navLinkClass}>
          <span className="text-[var(--es-accent)]">{"\u25CF"}</span>
          {!collapsed && <span>BOL Queue</span>}
        </NavLink>

        {/* Admin Section */}
        {!collapsed && (
          <div className="pt-4">
            <p className="px-3 pb-2 text-xs uppercase tracking-wider text-[var(--es-text-tertiary)]">
              Admin
            </p>
            <NavLink to="/admin/wells" className={navLinkClass}>
              Wells
            </NavLink>
            <NavLink to="/admin/companies" className={navLinkClass}>
              Companies
            </NavLink>
            <NavLink to="/admin/validation" className={navLinkClass}>
              Validation
            </NavLink>
            <NavLink to="/admin/users" className={navLinkClass}>
              Users
            </NavLink>
          </div>
        )}

        {/* Operations Section */}
        {!collapsed && (
          <div className="pt-4">
            <p className="px-3 pb-2 text-xs uppercase tracking-wider text-[var(--es-text-tertiary)]">
              Operations
            </p>
            <NavLink to="/finance" className={navLinkClass}>
              Finance
            </NavLink>
            <NavLink to="/settings" className={navLinkClass}>
              Settings
            </NavLink>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--es-border-subtle)] p-3 space-y-2">
        <button
          type="button"
          onClick={handleCycleTheme}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-[var(--es-radius-md)] text-sm text-[var(--es-text-secondary)] hover:text-[var(--es-text-primary)] hover:bg-[var(--es-bg-elevated)] transition-all duration-[150ms]"
        >
          <span>{themeEmoji[theme]}</span>
          {!collapsed && <span className="capitalize">{theme}</span>}
        </button>

        {!collapsed && (
          <p className="px-2 text-xs text-[var(--es-text-tertiary)]">
            Synced 2m ago
          </p>
        )}

        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex items-center justify-center w-full px-2 py-1.5 rounded-[var(--es-radius-md)] text-sm text-[var(--es-text-secondary)] hover:text-[var(--es-text-primary)] hover:bg-[var(--es-bg-elevated)] transition-all duration-[150ms]"
        >
          {collapsed ? "\u2192" : "\u2190"}
        </button>
      </div>
    </aside>
  );
}
