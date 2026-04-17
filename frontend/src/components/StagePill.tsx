import type { HandlerStage } from "../types/api";

const STAGE_LABELS: Record<HandlerStage, string> = {
  uncertain: "Uncertain",
  ready_to_build: "Ready to Build",
  building: "Building",
  entered: "Entered",
  cleared: "Cleared",
};

// Neutral palette so the pill complements — not competes with — the
// per-user color stripe on the left edge of the row.
const STAGE_CLASSES: Record<HandlerStage, string> = {
  uncertain: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  ready_to_build: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  building: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  entered: "bg-teal-500/15 text-teal-300 border-teal-500/40",
  cleared: "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

interface StagePillProps {
  stage: HandlerStage;
}

export function StagePill({ stage }: StagePillProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${STAGE_CLASSES[stage]}`}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
