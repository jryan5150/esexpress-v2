import { useState } from "react";
import { LOAD_COUNT_STATUS } from "../lib/load-count-status";

/**
 * Legend popover that mirrors the "Color Key" tab of the team's Load Count
 * Sheet. Five statuses render as greyed "Coming soon" until we have the
 * data (PCS OAuth, finance, PropX export, well-rate flag).
 */
export function LoadCountLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-outline hover:text-on-surface hover:bg-surface-container-high/60 transition-all cursor-pointer"
        title="Show status color key"
      >
        <span className="material-symbols-outlined text-[14px]">palette</span>
        Color Key
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="absolute right-0 mt-1 w-72 rounded-lg border border-outline-variant/40 bg-surface-container-lowest shadow-lg z-50 p-2"
            role="dialog"
            aria-label="Status color key"
          >
            <div className="text-[11px] font-bold uppercase tracking-wide text-outline px-1.5 pb-1">
              Load status colors
            </div>
            <ul className="flex flex-col gap-0.5">
              {Object.entries(LOAD_COUNT_STATUS).map(([key, meta]) => (
                <li
                  key={key}
                  className={`flex items-center gap-2 px-1.5 py-1 rounded ${
                    meta.available ? "" : "opacity-50"
                  }`}
                  title={
                    meta.available
                      ? undefined
                      : "Coming soon — data not yet wired"
                  }
                >
                  <span
                    className="w-3 h-3 rounded-sm shrink-0 border border-black/10"
                    style={{ backgroundColor: meta.hex }}
                  />
                  <span className="text-[12px] text-on-surface flex-1">
                    {meta.label}
                  </span>
                  {!meta.available && (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-outline">
                      soon
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="text-[10px] text-outline px-1.5 pt-1.5 border-t border-outline-variant/40 mt-1">
              Mirrors the Color Key tab on your Load Count Sheet.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
