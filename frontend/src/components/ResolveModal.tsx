import { useState } from "react";
import { useRouteUncertain } from "../hooks/use-workbench";
import type {
  WorkbenchRow,
  UncertainReason,
} from "../types/api";
import type { ResolveAction } from "../hooks/use-workbench";

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
  missing_driver: "Add the driver",
  missing_tickets: "Ticket missing / not arrived",
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
  missing_driver:
    "Driver field is blank. Enter the driver name so dispatch + payroll can match.",
  missing_tickets:
    "Ticket number is blank or the load hasn't shown as arrived. Enter ticket when known, or flag for follow-up.",
};

interface ActionDef {
  action: ResolveAction;
  icon: string;
  title: string;
  desc: string;
  bg: string;
}

const ACTIONS: ActionDef[] = [
  {
    action: "confirm",
    icon: "✓",
    title: "Confirm & route to build",
    desc: "Override the flag — I already checked this one.",
    bg: "bg-emerald-600",
  },
  {
    action: "needs_rate",
    icon: "$",
    title: "Send to Needs Rate",
    desc: "Hold until the facility rate is set.",
    bg: "bg-orange-600",
  },
  {
    action: "missing_ticket",
    icon: "✕",
    title: "Missing Ticket",
    desc: "No ticket on file or load hasn't arrived.",
    bg: "bg-purple-600",
  },
  {
    action: "missing_driver",
    icon: "?",
    title: "Missing Driver",
    desc: "Driver field is blank or the name is wrong.",
    bg: "bg-cyan-600",
  },
  {
    action: "flag_other",
    icon: "↩",
    title: "Flag back (other)",
    desc: "Not one of the above — add a note.",
    bg: "bg-slate-600",
  },
];

export function ResolveModal({
  open,
  row,
  onClose,
  onResolved,
}: ResolveModalProps) {
  const route = useRouteUncertain();
  const [otherNote, setOtherNote] = useState("");

  if (!open || !row) return null;

  const run = async (action: ResolveAction) => {
    try {
      const notes =
        action === "flag_other"
          ? otherNote.trim() || "flag_other — no note provided"
          : undefined;
      await route.mutateAsync({ id: row.assignmentId, action, notes });
      setOtherNote("");
      onResolved();
    } catch {
      // error surfaces via route.isError below
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-lg w-[640px] max-w-[90vw] space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-headline">
              Resolve load {row.loadNo}
            </h2>
            <p className="text-xs text-on-surface-variant mt-1">
              {row.wellName ?? "— no well"} · {row.driverName ?? "no driver"} ·{" "}
              {row.bolNo ?? row.ticketNo ?? "--"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-on-surface-variant hover:text-on-surface"
          >
            ✕
          </button>
        </div>

        {/* What matching found */}
        {row.uncertainReasons.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300 mb-2">
              What matching caught
            </div>
            <ul className="text-sm space-y-2">
              {row.uncertainReasons.map((reason) => (
                <li key={reason}>
                  <div className="font-medium">{REASON_LABEL[reason]}</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">
                    {REASON_HINT[reason]}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 5 granular actions */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant mb-2">
            What to do
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {ACTIONS.map((a) => (
              <button
                key={a.action}
                type="button"
                disabled={route.isPending}
                onClick={() => run(a.action)}
                className="flex items-start gap-3 p-3 bg-surface-variant rounded border border-surface-variant hover:border-primary/50 text-left disabled:opacity-50"
              >
                <div
                  className={`w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${a.bg}`}
                >
                  {a.icon}
                </div>
                <div>
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">
                    {a.desc}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Free-form note for "flag_other" */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant mb-1">
            Optional note (required for Flag back · other)
          </label>
          <textarea
            value={otherNote}
            onChange={(e) => setOtherNote(e.target.value)}
            placeholder="What's going on with this load?"
            className="w-full bg-surface-variant rounded p-2 text-sm h-16 resize-none"
          />
        </div>

        {route.isError ? (
          <div className="text-sm text-red-400">
            Failed:{" "}
            {route.error instanceof Error
              ? route.error.message
              : "unknown error"}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2 border-t border-surface-variant">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded border border-surface-variant"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
