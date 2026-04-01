import { useState } from "react";
import { cycleTheme, getStoredTheme } from "@/lib/theme";
import type { Theme } from "@/lib/theme";

/* -------------------------------------------------------------------------- */
/*  Settings — system config, integrations, profile                           */
/* -------------------------------------------------------------------------- */

const THEME_OPTIONS: Theme[] = ["dark", "light", "system"];

export function Settings() {
  const [activeTheme, setActiveTheme] = useState<Theme>(getStoredTheme);

  function handleThemeChange(target: Theme) {
    // Cycle until we land on the desired theme
    let current = getStoredTheme();
    while (current !== target) {
      current = cycleTheme();
    }
    setActiveTheme(current);
  }

  return (
    <div className="p-6 pb-12 max-w-4xl mx-auto space-y-12">
      {/* Header */}
      <header>
        <h1 className="text-[var(--text-2xl)] font-extrabold tracking-tight text-[var(--text-primary)]">
          General Settings
        </h1>
        <p className="text-[var(--text-secondary)] font-medium mt-1">
          Manage your command center configuration and external connections.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Theme Control */}
        <section className="bg-[var(--bg-surface)] p-6 rounded-[var(--radius-md)] border-l-4 border-[var(--accent)] shadow-[var(--shadow-lg)]">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[var(--accent)]">&#x1F3A8;</span>
            <h3 className="font-bold text-[var(--text-primary)] uppercase tracking-wide text-sm">
              System Appearance
            </h3>
          </div>
          <div className="flex p-1 bg-[var(--bg-base)] rounded-[var(--radius-sm)]">
            {THEME_OPTIONS.map((t) => (
              <button
                key={t}
                className={`flex-1 py-2 px-4 text-sm font-medium rounded-[var(--radius-sm)] transition-all capitalize ${
                  activeTheme === t
                    ? "bg-[var(--bg-elevated)] text-[var(--accent)] shadow-[var(--shadow-sm)]"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                }`}
                onClick={() => handleThemeChange(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--text-tertiary)] italic">
            Optimized for low-light terminal operations.
          </p>
        </section>

        {/* Sync Engine */}
        <section className="bg-[var(--bg-surface)] p-6 rounded-[var(--radius-md)] shadow-[var(--shadow-lg)]">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="text-[var(--accent)]">&#x21BB;</span>
              <h3 className="font-bold text-[var(--text-primary)] uppercase tracking-wide text-sm">
                Sync Engine
              </h3>
            </div>
            <div className="font-[var(--font-mono)] text-[10px] bg-[var(--bg-overlay)] px-2 py-1 rounded text-[var(--status-ready)]">
              LIVE
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[var(--text-tertiary)]">
                AUTO-SYNC INTERVAL
              </label>
              <select className="bg-[var(--bg-elevated)] border-none text-xs font-[var(--font-mono)] rounded px-3 py-1.5 text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--accent)]">
                <option>2m</option>
                <option>5m</option>
                <option>10m</option>
              </select>
            </div>
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <div>
                <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-tight">
                  Last Successful Sync
                </p>
                <p className="font-[var(--font-mono)] text-sm text-[var(--text-primary)] font-medium">
                  14:42:01 CST
                </p>
              </div>
              <button className="bg-[var(--bg-elevated)] hover:bg-[var(--bg-overlay)] text-[var(--text-primary)] px-4 py-2 text-xs font-bold rounded border border-[var(--border-default)] transition-all flex items-center gap-2">
                &#x21BB; Manual Sync Now
              </button>
            </div>
          </div>
        </section>

        {/* External Integration Health */}
        <section className="md:col-span-2 bg-[var(--bg-elevated)] p-6 rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)] opacity-5 blur-3xl -mr-16 -mt-16" />
          <div className="flex items-center gap-3 mb-8">
            <span className="text-[var(--accent)]">&#x26A1;</span>
            <h3 className="font-bold text-[var(--text-primary)] uppercase tracking-wide text-sm">
              External Integration Health
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {INTEGRATIONS.map((int) => (
              <div
                key={int.name}
                className="bg-[var(--bg-base)] p-4 rounded border-l-2 border-[var(--status-ready)]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    {int.name}
                  </span>
                  <span className="text-[var(--status-ready)]">&#x2713;</span>
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] mb-1">
                  LATENCY: {int.latency}
                </p>
                <p className="font-[var(--font-mono)] text-[10px] text-[var(--text-tertiary)]">
                  CHECKED: {int.checked}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* User Profile */}
        <section className="bg-[var(--bg-surface)] p-6 rounded-[var(--radius-md)] shadow-[var(--shadow-lg)]">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[var(--accent)]">&#x1F464;</span>
            <h3 className="font-bold text-[var(--text-primary)] uppercase tracking-wide text-sm">
              User Profile
            </h3>
          </div>
          <div className="flex items-center gap-5 mb-6">
            <div className="relative">
              <div className="w-16 h-16 rounded-[var(--radius-md)] bg-[var(--bg-overlay)] flex items-center justify-center text-xl font-bold text-[var(--accent)] ring-2 ring-[var(--accent-dim)]">
                MC
              </div>
            </div>
            <div>
              <p className="font-bold text-[var(--text-primary)]">
                Marcus Chen
              </p>
              <p className="text-xs font-[var(--font-mono)] text-[var(--text-tertiary)]">
                m.chen@esexpress.logistics
              </p>
            </div>
          </div>
          <button className="w-full bg-[var(--bg-elevated)] hover:bg-[var(--bg-overlay)] text-[var(--text-primary)] py-2.5 text-xs font-bold rounded border border-[var(--border-default)] transition-all uppercase tracking-widest">
            Update Password
          </button>
        </section>

        {/* Software Manifest */}
        <section className="bg-[var(--bg-surface)] p-6 rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <span className="text-[var(--accent)]">&#x2139;</span>
              <h3 className="font-bold text-[var(--text-primary)] uppercase tracking-wide text-sm">
                Software Manifest
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-[var(--bg-base)] p-3 rounded">
                <span className="text-xs font-medium text-[var(--text-tertiary)]">
                  VERSION
                </span>
                <span className="font-[var(--font-mono)] text-xs text-[var(--accent)] font-bold">
                  2.0.4
                </span>
              </div>
              <div className="flex justify-between items-center bg-[var(--bg-base)] p-3 rounded">
                <span className="text-xs font-medium text-[var(--text-tertiary)]">
                  ENVIRONMENT
                </span>
                <span className="font-[var(--font-mono)] text-[10px] px-2 py-0.5 bg-[var(--status-ready-dim)] text-[var(--status-ready)] rounded border border-[var(--status-ready)] font-bold uppercase tracking-widest">
                  Production
                </span>
              </div>
            </div>
          </div>
          <div className="mt-6 text-[10px] text-[var(--text-tertiary)] font-[var(--font-mono)] text-right">
            BUILD_ID: 992-0X-F012
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="pt-8 border-t border-[var(--border-subtle)] text-center">
        <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.2em]">
          &copy; 2024 EsExpress v2 Industrial Dispatch Systems &bull; All Rights
          Reserved
        </p>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mock data                                                                 */
/* -------------------------------------------------------------------------- */

const INTEGRATIONS = [
  { name: "PropX Interface", latency: "42ms", checked: "15:00:12" },
  { name: "PCS Dispatch", latency: "128ms", checked: "15:00:14" },
  { name: "JotForm Webhooks", latency: "215ms", checked: "15:00:09" },
];
