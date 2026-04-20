import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { WorkbenchRow } from "../types/api";

interface Props {
  score: number;
  tier: WorkbenchRow["matchTier"];
  drivers: WorkbenchRow["matchDrivers"];
}

// Light-theme palette: tinted background + dark text on the same hue.
// Original text-{color}-300 was tuned for dark theme and rendered invisible
// on the cream background.
const TIER_COLORS: Record<Props["tier"], string> = {
  high: "bg-emerald-100 text-emerald-900 border-emerald-500",
  medium: "bg-yellow-100 text-yellow-900 border-yellow-600",
  low: "bg-orange-100 text-orange-900 border-orange-500",
  uncertain: "bg-rose-100 text-rose-900 border-rose-500",
};

const FEATURE_LABELS: Record<string, string> = {
  bolMatch: "BOL match",
  weightDeltaPct: "Weight Δ",
  hasPhoto: "Photo",
  driverSimilarity: "Driver",
  autoMapTier: "Auto-map",
  wellAssigned: "Well",
  hasTicket: "Ticket#",
  hasRate: "Rate",
  deliveredRecent: "Recent",
  // Phase 6
  truckOcrMatch: "Truck# OCR",
  carrierSimilarity: "Carrier",
  grossTareConsistency: "Gross-Tare math",
  hasAnomalyNote: "Notes anomaly",
  ocrOverallConfidence: "OCR confidence",
};

function fmtContribution(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "" : " ";
  return `${sign}${rounded.toFixed(3)}`;
}

export function MatchScoreBadge({ score, tier, drivers }: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const anchorRef = useRef<HTMLButtonElement>(null);
  const pct = Math.round(score * 100);
  const label = `${pct}`;

  // Compute viewport-relative coords from the anchor's bounding rect. Using
  // fixed positioning + a Portal escapes the scroll container's overflow-auto
  // which was clipping the tooltip (discovered during demo prep 2026-04-20).
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const tooltipWidth = 256; // w-64
    // Align tooltip right-edge with badge right-edge, dropping below
    const left = Math.max(8, rect.right - tooltipWidth);
    const top = rect.bottom + 4;
    setCoords({ top, left });
  }, [open]);

  return (
    <span
      data-match-score-badge
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        ref={anchorRef}
        type="button"
        tabIndex={0}
        aria-label={`Match confidence ${pct}% (${tier})`}
        className={`inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 text-[10px] font-mono rounded border ${TIER_COLORS[tier]}`}
      >
        {label}
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            role="tooltip"
            style={{ top: coords.top, left: coords.left }}
            className="fixed z-50 w-64 rounded-md shadow-lg border border-outline-variant bg-surface-container-low text-xs"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
          >
            <div className="p-2">
              <div className="flex items-center justify-between pb-1 mb-1 border-b border-outline-variant">
                <span className="font-semibold text-on-surface">
                  Match {pct}%
                </span>
                <span className="text-on-surface-variant uppercase tracking-wider text-[9px]">
                  {tier}
                </span>
              </div>
              <ul className="space-y-0.5">
                {drivers
                  .filter((d) => d.contribution !== 0)
                  .slice(0, 6)
                  .map((d) => {
                    const lbl = FEATURE_LABELS[d.feature] ?? d.feature;
                    const neg = d.contribution < 0;
                    return (
                      <li
                        key={d.feature}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="text-on-surface-variant truncate">
                          {lbl}
                        </span>
                        <span
                          className={`font-mono font-semibold ${neg ? "text-rose-700" : "text-emerald-700"}`}
                        >
                          {fmtContribution(d.contribution)}
                        </span>
                      </li>
                    );
                  })}
                {drivers.filter((d) => d.contribution === 0).length > 0 && (
                  <li className="text-on-surface-variant text-[10px] italic pt-1">
                    {drivers.filter((d) => d.contribution === 0).length}{" "}
                    feature(s) at zero
                  </li>
                )}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
