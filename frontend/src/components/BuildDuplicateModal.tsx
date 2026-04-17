import { useState } from "react";
import { useBuildDuplicate } from "../hooks/use-workbench";

interface BuildDuplicateModalProps {
  open: boolean;
  assignmentIds: number[];
  onClose: () => void;
  onSuccess: () => void;
}

export function BuildDuplicateModal({
  open,
  assignmentIds,
  onClose,
  onSuccess,
}: BuildDuplicateModalProps) {
  const [notes, setNotes] = useState("");
  const mutation = useBuildDuplicate();

  if (!open) return null;

  const submit = async () => {
    await mutation.mutateAsync({ assignmentIds, notes: notes || undefined });
    setNotes("");
    onSuccess();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-lg w-[480px] max-w-[90vw] space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-headline">
          Build + Duplicate ({assignmentIds.length}{" "}
          {assignmentIds.length === 1 ? "load" : "loads"})
        </h2>
        <p className="text-sm text-on-surface-variant">
          Stages the selected loads into <strong>Building</strong>. You'll paste
          them into PCS via Copy Report after you close this dialog.
        </p>
        <textarea
          className="w-full h-24 bg-surface-variant rounded p-2 text-sm"
          placeholder="Optional batch notes (e.g. 'Well 32 morning batch')"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {mutation.isError ? (
          <div className="text-sm text-red-400">
            Failed: {String((mutation.error as Error)?.message ?? "unknown")}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded border border-surface-variant"
            disabled={mutation.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={mutation.isPending || assignmentIds.length === 0}
            className="px-3 py-1.5 text-sm rounded bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? "Building…" : "Build + Duplicate"}
          </button>
        </div>
      </div>
    </div>
  );
}
