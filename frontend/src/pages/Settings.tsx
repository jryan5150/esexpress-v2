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
    <div className="pb-12 max-w-4xl mx-auto p-8 space-y-12">
      {/* Header */}
      <header>
        <h1 className="text-3xl font-extrabold text-[var(--es-text-primary)] mb-2">
          General Settings
        </h1>
        <p className="text-[var(--es-text-secondary)] font-medium">
          Manage your command center configuration and external connections.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Theme Control */}
        <section className="bg-[var(--es-bg-surface)] p-6 rounded-[var(--es-radius-sm)] border-l-4 border-[var(--es-accent)] shadow-[var(--es-shadow-lg)]">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[var(--es-accent)]">&#x1F3A8;</span>
            <h3 className="font-bold text-[var(--es-text-primary)] uppercase tracking-wide text-sm">
              System Appearance
            </h3>
          </div>
          <div className="flex p-1 bg-[var(--es-bg-inset)] rounded-[6px]">
            {THEME_OPTIONS.map((t) => (
              <button
                key={t}
                className={`flex-1 py-2 px-4 text-sm font-medium rounded-[2px] transition-all capitalize ${
                  activeTheme === t
                    ? "bg-[var(--es-bg-elevated)] text-[#ffb599] shadow-[var(--es-shadow-sm)]"
                    : "text-[var(--es-text-secondary)] hover:text-[var(--es-text-primary)]"
                }`}
                onClick={() => handleThemeChange(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--es-text-tertiary)] italic">
            Optimized for low-light terminal operations.
          </p>
        </section>

        {/* Sync Engine */}
        <section className="bg-[var(--es-bg-surface)] p-6 rounded-[var(--es-radius-sm)] shadow-[var(--es-shadow-lg)]">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="text-[var(--es-accent)]">&#x21BB;</span>
              <h3 className="font-bold text-[var(--es-text-primary)] uppercase tracking-wide text-sm">
                Sync Engine
              </h3>
            </div>
            <div className="font-[var(--es-font-mono)] text-[10px] bg-[var(--es-bg-overlay)] px-2 py-1 rounded text-[var(--es-ready)]">
              LIVE
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[var(--es-text-secondary)]">
                AUTO-SYNC INTERVAL
              </label>
              <select className="bg-[var(--es-bg-elevated)] border-none text-xs font-[var(--es-font-mono)] rounded px-3 py-1.5 text-[var(--es-text-primary)] focus:ring-1 focus:ring-[var(--es-accent)]">
                <option>2m</option>
                <option>5m</option>
                <option>10m</option>
              </select>
            </div>
            <div className="pt-2 border-t border-[rgba(89,66,57,0.1)] flex items-center justify-between">
              <div>
                <p className="text-[10px] text-[var(--es-text-secondary)] uppercase tracking-tighter">
                  Last Successful Sync
                </p>
                <p className="font-[var(--es-font-mono)] text-sm text-[var(--es-text-primary)] font-medium">
                  14:42:01 CST
                </p>
              </div>
              <button className="bg-[var(--es-bg-elevated)] hover:bg-[var(--es-bg-overlay)] text-[var(--es-text-primary)] px-4 py-2 text-xs font-bold rounded border border-[rgba(89,66,57,0.2)] transition-all flex items-center gap-2">
                &#x21BB; Manual Sync Now
              </button>
            </div>
          </div>
        </section>

        {/* External Integration Health */}
        <section className="md:col-span-2 bg-[var(--es-bg-surface)] p-6 rounded-[var(--es-radius-sm)] shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--es-accent)] opacity-5 blur-3xl -mr-16 -mt-16" />
          <div className="flex items-center gap-3 mb-8">
            <span className="text-[var(--es-accent)]">&#x26A1;</span>
            <h3 className="font-bold text-[var(--es-text-primary)] uppercase tracking-wide text-sm">
              External Integration Health
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {INTEGRATIONS.map((int) => (
              <div
                key={int.name}
                className="bg-[var(--es-bg-inset)] p-4 rounded border-l-2 border-[var(--es-ready)]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[var(--es-text-primary)]">
                    {int.name}
                  </span>
                  <span className="text-[var(--es-ready)]">&#x2713;</span>
                </div>
                <p className="text-[10px] text-[var(--es-text-secondary)] mb-1">
                  LATENCY: {int.latency}
                </p>
                <p className="font-[var(--es-font-mono)] text-[10px] text-[rgba(232,236,244,0.6)]">
                  CHECKED: {int.checked}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* User Profile */}
        <section className="bg-[var(--es-bg-surface)] p-6 rounded-[var(--es-radius-sm)] shadow-[var(--es-shadow-lg)]">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[var(--es-accent)]">&#x1F464;</span>
            <h3 className="font-bold text-[var(--es-text-primary)] uppercase tracking-wide text-sm">
              User Profile
            </h3>
          </div>
          <div className="flex items-center gap-5 mb-6">
            <div className="relative">
              <div className="w-16 h-16 rounded-[var(--es-radius-sm)] bg-[var(--es-bg-overlay)] flex items-center justify-center text-xl font-bold text-[var(--es-accent)] ring-2 ring-[var(--es-accent-dim)]">
                MC
              </div>
            </div>
            <div>
              <p className="font-bold text-[var(--es-text-primary)]">
                Marcus Chen
              </p>
              <p className="text-xs font-[var(--es-font-mono)] text-[var(--es-text-tertiary)]">
                m.chen@esexpress.logistics
              </p>
            </div>
          </div>
          <button className="w-full bg-[var(--es-bg-elevated)] hover:bg-[var(--es-bg-overlay)] text-[var(--es-text-primary)] py-2.5 text-xs font-bold rounded border border-[rgba(89,66,57,0.2)] transition-all uppercase tracking-widest">
            Update Password
          </button>
        </section>

        {/* Software Manifest */}
        <section className="bg-[var(--es-bg-surface)] p-6 rounded-[var(--es-radius-sm)] shadow-[var(--es-shadow-lg)] flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <span className="text-[var(--es-accent)]">&#x2139;</span>
              <h3 className="font-bold text-[var(--es-text-primary)] uppercase tracking-wide text-sm">
                Software Manifest
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-[var(--es-bg-inset)] p-3 rounded">
                <span className="text-xs font-medium text-[var(--es-text-secondary)]">
                  VERSION
                </span>
                <span className="font-[var(--es-font-mono)] text-xs text-[var(--es-accent)] font-bold">
                  2.0.4
                </span>
              </div>
              <div className="flex justify-between items-center bg-[var(--es-bg-inset)] p-3 rounded">
                <span className="text-xs font-medium text-[var(--es-text-secondary)]">
                  ENVIRONMENT
                </span>
                <span className="font-[var(--es-font-mono)] text-[10px] px-2 py-0.5 bg-[var(--es-ready-dim)] text-[var(--es-ready)] rounded border border-[rgba(52,211,153,0.3)] font-bold uppercase tracking-widest">
                  Production
                </span>
              </div>
            </div>
          </div>
          <div className="mt-6 text-[10px] text-[rgba(90,100,120,0.4)] font-[var(--es-font-mono)] text-right">
            BUILD_ID: 992-0X-F012
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="pt-8 border-t border-[rgba(89,66,57,0.1)] text-center">
        <p className="text-[10px] text-[rgba(139,149,168,0.5)] uppercase tracking-[0.2em]">
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
