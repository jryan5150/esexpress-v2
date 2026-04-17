import { useState } from "react";
import { useAdvanceStage } from "../hooks/use-workbench";
import type { WorkbenchRow, UncertainReason } from "../types/api";

interface ResolveModalProps {
  open: boolean;
  row: WorkbenchRow | null;
  onClose: () => void;
  onResolved: () => void;
}

const REASON_LABEL: Record<UncertainReason, string> = {
  unassigned_well: "Pick the destination well",
  fuzzy_match: "Confirm the fuzzy photo match",
  bol_mismatch: "Resolve BOL number mismatch",
  weight_mismatch: "Resolve weight mismatch",
  no_photo_48h: "Photo missing after 48h",
  rate_missing: "Enter rate",
};

const REASON_HINT: Record<UncertainReason, string> = {
  unassigned_well:
    "Open the well picker and assign this load. Also clears the trigger.",
  fuzzy_match:
    "Photo was matched via driver+date+weight only. Confirm it's right or reject it.",
  bol_mismatch:
    "Photo BOL and load BOL disagree on last 4 digits. Pick the source of truth.",
  weight_mismatch:
    "Photo weight differs from load weight by >5%. Edit or confirm.",
  no_photo_48h:
    "No photo submitted. Either attach one manually or flag this load missed.",
  rate_missing:
    "Open finance drawer and set the rate. Required for settlement.",
};

export function ResolveModal({
  open,
  row,
  onClose,
  onResolved,
}: ResolveModalProps) {
  const advance = useAdvanceStage();
  const [, setConfirm] = useState(false);

  if (!open || !row) return null;

  const tryAdvance = async () => {
    // Optimistic: if Jessica says "resolved", try to advance. Backend rejects
    // with 400 if uncertain_reasons isn't empty — that's the signal that she
    // still has work to do.
    try {
      await advance.mutateAsync({
        id: row.assignmentId,
        stage: "ready_to_build",
        notes: "resolved via modal",
      });
      onResolved();
    } catch {
      setConfirm(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-lg w-[560px] max-w-[90vw] space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-headline">Resolve load {row.loadNo}</h2>

        {row.uncertainReasons.length === 0 ? (
          <p className="text-sm text-emerald-400">
            No triggers firing. This load is ready to advance.
          </p>
        ) : (
          <ul className="space-y-3">
            {row.uncertainReasons.map((reason) => (
              <li
                key={reason}
                className="p-3 bg-surface-variant rounded border border-surface-variant"
              >
                <div className="font-medium">{REASON_LABEL[reason]}</div>
                <div className="text-sm text-on-surface-variant mt-1">
                  {REASON_HINT[reason]}
                </div>
                <div className="mt-2 text-xs text-primary">
                  Edit this on the load's detail page, then return here.
                </div>
              </li>
            ))}
          </ul>
        )}

        {advance.isError ? (
          <div className="text-sm text-amber-400">
            Still has open triggers — fix those first, then try Advance again.
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded border border-surface-variant"
          >
            Close
          </button>
          <button
            type="button"
            onClick={tryAdvance}
            disabled={advance.isPending}
            className="px-3 py-1.5 text-sm rounded bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50"
          >
            {advance.isPending
              ? "Advancing…"
              : "Mark Resolved → Ready to Build"}
          </button>
        </div>
      </div>
    </div>
  );
}
