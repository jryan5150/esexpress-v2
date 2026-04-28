/**
 * StageStrip — clickable 5-stage progress bar for the v2 handler-stage
 * lifecycle. Mirrors the dispatch team's mental model:
 *
 *   Uncertain → Ready → Building → Entered → Cleared
 *
 * Current stage is highlighted; past stages render in green; future
 * stages render neutral. Click any stage (including a backwards stage)
 * to set it directly via the supplied `onAdvance` mutation.
 *
 * Lives in its own component so both the cell-drawer's inline-expand
 * panel AND the standalone Load Center page can share the exact same
 * stage-control UX.
 */

const STAGES: Array<{ key: string; label: string; help: string }> = [
  {
    key: "uncertain",
    label: "Uncertain",
    help: "Not enough info to build yet (missing fields, photo doesn't match, well not assigned, etc.). Sits here until someone resolves the issue.",
  },
  {
    key: "ready_to_build",
    label: "Ready",
    help: "Photo + fields look right; this load is ready to be entered into PCS. Builder picks it up next.",
  },
  {
    key: "building",
    label: "Building",
    help: "Builder is actively typing this load into PCS right now. Lock — don't double-claim.",
  },
  {
    key: "entered",
    label: "Entered",
    help: "Builder finished entering the load in PCS. Awaiting clearance from the customer.",
  },
  {
    key: "cleared",
    label: "Cleared",
    help: "Customer has cleared this load in PCS. Done — drops off the active worksurface into history.",
  },
];

interface Props {
  currentStage: string;
  onAdvance: (stage: string) => Promise<unknown>;
  isPending: boolean;
}

export function StageStrip({ currentStage, onAdvance, isPending }: Props) {
  const currentIdx = STAGES.findIndex((s) => s.key === currentStage);

  return (
    <div className="flex items-center gap-0.5">
      {STAGES.map((s, i) => {
        const isCurrent = i === currentIdx;
        const isPast = i < currentIdx;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onAdvance(s.key)}
            disabled={isPending || isCurrent}
            className={`
              flex-1 px-1.5 py-1 text-[10px] font-medium border transition-colors
              ${i === 0 ? "rounded-l" : ""}
              ${i === STAGES.length - 1 ? "rounded-r" : ""}
              ${
                isCurrent
                  ? "bg-accent text-white border-accent"
                  : isPast
                    ? "bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200"
                    : "bg-bg-primary text-text-secondary border-border hover:bg-bg-tertiary"
              }
              disabled:cursor-default
            `}
            title={`${s.label} — ${s.help}\n\nClick to set handler stage to ${s.label}.`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
