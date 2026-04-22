import type { HandlerStage } from "../types/api";

// Label consolidation per Apr 21 call: "Entered" → "Completed" across
// all user-facing surfaces. The underlying handler_stage DB enum stays
// 'entered' (avoid migration + enum rename); only the display label
// changes. Scout's pref (Apr 9 team call: "I like completed after the
// load is built") + Jessica's endorsement. One word for the terminal
// state going forward.
const STAGE_LABELS: Record<HandlerStage, string> = {
  uncertain: "Uncertain",
  ready_to_build: "Ready to Build",
  building: "Building",
  entered: "Completed",
  cleared: "Cleared",
};

// Traffic-light palette from Jessica's Load Count sheet color key:
//   amber  = needs review (uncertain + open reasons)
//   green  = auto-validated / pending one-click confirm
//   yellow = ready / building / in queue
//   pink   = built or cleared (done)
// The `uncertain` stage defaults to amber; the <StagePill clean> variant
// renders the same stage in green for rows with no open reasons — the
// "one click Confirm → Yellow" fast path Jessica asked for.
// Light-theme palette: tinted background + high-contrast dark text on the
// matching hue family. Original values used text-{color}-300 which were tuned
// for a dark theme and rendered nearly invisible on the cream background.
const STAGE_CLASSES: Record<HandlerStage, string> = {
  uncertain: "bg-amber-100 text-amber-900 border-amber-400",
  ready_to_build: "bg-yellow-100 text-yellow-900 border-yellow-500",
  building: "bg-yellow-200 text-yellow-900 border-yellow-600",
  entered: "bg-pink-100 text-pink-900 border-pink-400",
  cleared: "bg-pink-50 text-pink-800 border-pink-300",
};

const UNCERTAIN_CLEAN_CLASS =
  "bg-emerald-100 text-emerald-900 border-emerald-500";
const UNCERTAIN_CLEAN_LABEL = "Pending Confirm";

interface StagePillProps {
  stage: HandlerStage;
  /**
   * When stage === "uncertain" and `clean` is true, render the pill in
   * green with "Pending Confirm" — Jessica's 100%-matched auto-validated
   * state that needs a one-click confirm to move to Ready to Build.
   */
  clean?: boolean;
}

export function StagePill({ stage, clean }: StagePillProps) {
  const isCleanUncertain = stage === "uncertain" && clean;
  const cls = isCleanUncertain ? UNCERTAIN_CLEAN_CLASS : STAGE_CLASSES[stage];
  const label = isCleanUncertain ? UNCERTAIN_CLEAN_LABEL : STAGE_LABELS[stage];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${cls}`}
    >
      {label}
    </span>
  );
}
