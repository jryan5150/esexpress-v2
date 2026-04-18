import type { HandlerStage } from "../types/api";

const STAGE_LABELS: Record<HandlerStage, string> = {
  uncertain: "Uncertain",
  ready_to_build: "Ready to Build",
  building: "Building",
  entered: "Entered",
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
const STAGE_CLASSES: Record<HandlerStage, string> = {
  uncertain: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  ready_to_build: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40",
  building: "bg-yellow-600/20 text-yellow-200 border-yellow-600/50",
  entered: "bg-pink-500/15 text-pink-300 border-pink-500/40",
  cleared: "bg-pink-500/10 text-pink-300/80 border-pink-500/30",
};

const UNCERTAIN_CLEAN_CLASS =
  "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
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
