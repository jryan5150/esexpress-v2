import { useState } from "react";
import type { WorkbenchRow } from "../types/api";

interface Props {
  score: number;
  tier: WorkbenchRow["matchTier"];
  drivers: WorkbenchRow["matchDrivers"];
}

const TIER_COLORS: Record<Props["tier"], string> = {
  high: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  low: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  uncertain: "bg-rose-500/20 text-rose-300 border-rose-500/40",
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
};

function fmtContribution(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "" : " ";
  return `${sign}${rounded.toFixed(3)}`;
}

export function MatchScoreBadge({ score, tier, drivers }: Props) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(score * 100);
  const label = `${pct}`;

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
        type="button"
        tabIndex={0}
        aria-label={`Match confidence ${pct}% (${tier})`}
        className={`inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 text-[10px] font-mono rounded border ${TIER_COLORS[tier]}`}
      >
        {label}
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute z-30 right-0 top-full mt-1 w-64 p-2 rounded-md shadow-lg border border-surface-variant bg-surface text-xs"
        >
          <div className="flex items-center justify-between pb-1 mb-1 border-b border-surface-variant">
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
                const label = FEATURE_LABELS[d.feature] ?? d.feature;
                const neg = d.contribution < 0;
                return (
                  <li
                    key={d.feature}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-on-surface-variant truncate">
                      {label}
                    </span>
                    <span
                      className={`font-mono ${neg ? "text-rose-300" : "text-emerald-300"}`}
                    >
                      {fmtContribution(d.contribution)}
                    </span>
                  </li>
                );
              })}
            {drivers.filter((d) => d.contribution === 0).length > 0 && (
              <li className="text-on-surface-variant text-[10px] italic pt-1">
                {drivers.filter((d) => d.contribution === 0).length} feature(s)
                at zero
              </li>
            )}
          </ul>
        </div>
      )}
    </span>
  );
}
