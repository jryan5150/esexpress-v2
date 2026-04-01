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
    "rounded-[var(--radius-md)] text-sm",
    "transition-all duration-[var(--transition-fast)]",
  ].join(" ");

  if (isActive) {
    return `${base} bg-[var(--accent-dim)] text-[var(--accent)]`;
  }
  return `${base} text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]`;
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
      className="flex flex-col h-screen bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] transition-all duration-[var(--transition-base)]"
      style={{ width: collapsed ? 64 : 240 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--text-inverse)] text-sm font-bold shrink-0">
          ES
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            ES Express
          </span>
        )}
      </div>

      {/* Primary Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <NavLink to="/" end className={navLinkClass}>
          <span className="text-[var(--accent)]">{"\u25CF"}</span>
          {!collapsed && <span>Exception Feed</span>}
        </NavLink>
        <NavLink to="/bol" className={navLinkClass}>
          <span className="text-[var(--accent)]">{"\u25CF"}</span>
          {!collapsed && <span>BOL Queue</span>}
        </NavLink>

        {/* Admin Section */}
        {!collapsed && (
          <div className="pt-4">
            <p className="px-3 pb-2 text-[var(--text-xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
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
            <p className="px-3 pb-2 text-[var(--text-xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
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
      <div className="border-t border-[var(--border-subtle)] p-3 space-y-2">
        <button
          type="button"
          onClick={handleCycleTheme}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-[var(--radius-md)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all duration-[var(--transition-fast)]"
        >
          <span>{themeEmoji[theme]}</span>
          {!collapsed && <span className="capitalize">{theme}</span>}
        </button>

        {!collapsed && (
          <p className="px-2 text-[var(--text-xs)] text-[var(--text-tertiary)]">
            Synced 2m ago
          </p>
        )}

        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex items-center justify-center w-full px-2 py-1.5 rounded-[var(--radius-md)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all duration-[var(--transition-fast)]"
        >
          {collapsed ? "\u2192" : "\u2190"}
        </button>
      </div>
    </aside>
  );
}
