import { useState, useEffect, Component, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  useUpdateLoadField,
  useBolReconciliation,
  useAdvanceStage,
  useFlagToUncertain,
  useUpdatePcsNumber,
  useUpdateAssignmentNotes,
} from "../hooks/use-workbench";
import { reportError } from "../lib/sentry";

/**
 * Isolated error boundary for the expand-drawer content. Prevents a render
 * error in the drawer from blanking the whole workbench surface (the
 * "loads then goes blank" bug reported 2026-04-20). Fallback shows the
 * actual error message so the row stays auditable — the user can still
 * see what's going on even when a single assignment's data trips a render.
 */
class DrawerErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode; onReset: () => void }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[WorkbenchDrawer] render error", error, info);
    reportError(error, {
      boundary: "workbench-drawer",
      componentStack: info.componentStack,
    });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="bg-rose-50 border border-rose-400 rounded-md mt-1 mb-2 p-4 space-y-2">
          <div className="text-sm font-semibold text-rose-900">
            Couldn't render this row's detail view.
          </div>
          <div className="text-xs text-rose-800 font-mono break-all">
            {this.state.error.message || String(this.state.error)}
          </div>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset();
            }}
            className="px-3 py-1 text-xs rounded border border-rose-400 text-rose-900 bg-white hover:bg-rose-100"
          >
            Close
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { StagePill } from "./StagePill";
import { PhotoLightbox } from "./PhotoLightbox";
import type { WorkbenchRow, UncertainReason } from "../types/api";

interface WorkbenchDrawerProps {
  row: WorkbenchRow;
  onClose: () => void;
}

interface EditableFieldProps {
  label: string;
  value: string | null;
  ocrValue?: string | null;
  onSave: (next: string) => void;
  isSaving?: boolean;
  type?: "text" | "number";
  placeholder?: string;
}

/** "Use OCR" + "Keep" quick-accept buttons that surface only when the OCR
 *  value disagrees with the load value. One-click resolves the discrepancy
 *  without going into manual edit mode. */
interface OcrAcceptButtonsProps {
  ocrValue: string;
  onUseOcr: () => void;
  onKeep: () => void;
  isSaving?: boolean;
}
function OcrAcceptButtons({
  ocrValue,
  onUseOcr,
  onKeep,
  isSaving,
}: OcrAcceptButtonsProps) {
  return (
    <div data-ocr-accept className="mt-1 flex items-center gap-1">
      <button
        type="button"
        disabled={isSaving}
        onClick={onUseOcr}
        title={`Replace load value with OCR value (${ocrValue})`}
        className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-100 text-emerald-900 border border-emerald-500 hover:bg-emerald-200 disabled:opacity-50"
      >
        Use OCR
      </button>
      <button
        type="button"
        disabled={isSaving}
        onClick={onKeep}
        title="Keep current load value (acknowledge the mismatch)"
        className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-surface-container-low text-on-surface border border-outline-variant hover:bg-surface-variant disabled:opacity-50"
      >
        Keep
      </button>
    </div>
  );
}

/**
 * Inline editable field with OCR comparison strip underneath. Clicking the
 * value flips to edit mode; blur or Enter saves. Shows discrepancy badge
 * when load value and OCR value differ.
 */
function EditableField({
  label,
  value,
  ocrValue,
  onSave,
  isSaving,
  type = "text",
  placeholder,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  // Local "acknowledged" flag so "Keep" can dismiss the mismatch warning
  // without round-tripping the value through the API.
  const [keepAcked, setKeepAcked] = useState(false);

  useEffect(() => {
    setDraft(value ?? "");
    setKeepAcked(false);
  }, [value, ocrValue]);

  const commit = () => {
    if (draft !== (value ?? "")) onSave(draft);
    setEditing(false);
  };

  const ocrMismatch =
    ocrValue != null &&
    value != null &&
    String(ocrValue).trim() !== "" &&
    String(value).trim() !== "" &&
    String(ocrValue).trim() !== String(value).trim();
  const showAcceptButtons = ocrMismatch && !keepAcked;

  return (
    <div
      className={`rounded p-2 min-w-0 border ${
        ocrMismatch && !keepAcked
          ? "bg-amber-50 border-amber-400"
          : "bg-surface-variant/40 border-transparent"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
          {label}
        </span>
        {isSaving && <span className="text-[10px] text-primary">saving…</span>}
      </div>
      {editing ? (
        <input
          autoFocus
          type={type}
          value={draft}
          disabled={isSaving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") {
              setDraft(value ?? "");
              setEditing(false);
            }
          }}
          className="w-full bg-background border border-primary/60 rounded px-2 py-1 text-sm focus:outline-none"
          placeholder={placeholder}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full text-left text-sm px-2 py-1 hover:bg-background/60 rounded text-on-surface"
        >
          {value ?? <span className="text-on-surface-variant">--</span>}
        </button>
      )}
      {ocrValue != null && (
        <div
          className={`mt-1 text-[10px] flex items-center gap-1 ${
            ocrMismatch && !keepAcked
              ? "text-amber-900 font-semibold"
              : "text-on-surface-variant"
          }`}
          title="OCR-extracted value from the BOL photo"
        >
          <span>OCR:</span>
          <span className="font-mono truncate">{String(ocrValue)}</span>
          {ocrMismatch && !keepAcked && (
            <span className="ml-auto">⚠ mismatch</span>
          )}
        </div>
      )}
      {showAcceptButtons && (
        <OcrAcceptButtons
          ocrValue={String(ocrValue)}
          onUseOcr={() => {
            onSave(String(ocrValue));
            setKeepAcked(true);
          }}
          onKeep={() => setKeepAcked(true)}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}

const REASON_LABEL: Record<UncertainReason, string> = {
  unassigned_well: "Unassigned well",
  fuzzy_match: "Fuzzy photo match",
  bol_mismatch: "BOL number mismatch",
  weight_mismatch: "Weight mismatch",
  no_photo_48h: "Photo missing >48h",
  rate_missing: "Rate missing",
  missing_driver: "Driver missing",
  missing_tickets: "Ticket missing / not arrived",
};

export function WorkbenchDrawer(props: WorkbenchDrawerProps) {
  return (
    <DrawerErrorBoundary onReset={props.onClose}>
      <WorkbenchDrawerBody {...props} />
    </DrawerErrorBoundary>
  );
}

function WorkbenchDrawerBody({ row, onClose }: WorkbenchDrawerProps) {
  const update = useUpdateLoadField();
  const bol = useBolReconciliation(row.loadId);
  const advance = useAdvanceStage();
  const flag = useFlagToUncertain();
  const pcsUpdate = useUpdatePcsNumber();
  const notesUpdate = useUpdateAssignmentNotes();
  const [lightbox, setLightbox] = useState(false);
  // Notes state — defensive coerce: old workbench responses may not include
  // the `notes` field at all; old ones may have null. Either way map to "".
  const initialNotes = typeof row.notes === "string" ? row.notes : "";
  const [notesDraft, setNotesDraft] = useState(initialNotes);
  const [notesDirty, setNotesDirty] = useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  useEffect(() => {
    const next = typeof row.notes === "string" ? row.notes : "";
    setNotesDraft(next);
    setNotesDirty(false);
    setTimelineExpanded(false);
    // Only re-sync when the row actually changes. Tracking row.notes as a
    // dep was correct but if the value stays the same across refetches the
    // effect is a no-op anyway — assignmentId alone is sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.assignmentId]);

  const ocr = bol.data;

  const saveField = (key: string) => (next: string) => {
    const value = next.trim() === "" ? null : next.trim();
    update.mutate({ loadId: row.loadId, updates: { [key]: value } });
  };

  const savePcsNumber = (next: string) => {
    const value = next.trim() === "" ? null : next.trim();
    pcsUpdate.mutate({ assignmentId: row.assignmentId, pcsNumber: value });
  };

  const nextByStage: Record<
    typeof row.handlerStage,
    typeof row.handlerStage | null
  > = {
    uncertain: "ready_to_build",
    ready_to_build: "building",
    building: "entered",
    entered: "cleared",
    cleared: null,
  };

  // Stage-specific verb + explanation for the advance button. Generic "Advance →"
  // didn't tell Jessica what action would happen or what state she was moving to.
  const ADVANCE_COPY: Record<
    typeof row.handlerStage,
    { label: string; title: string }
  > = {
    uncertain: {
      label: "Confirm → Ready to Build",
      title:
        "All validation checks pass — move this load to the Ready-to-Build queue for the builder.",
    },
    ready_to_build: {
      label: "Start Build (→ Building)",
      title:
        "Begin building this load in PCS. Moves the row to the Building stage while you're copying into PCS.",
    },
    building: {
      label: "Mark Entered (→ Entered)",
      title:
        "PCS load has been created and entered. Moves the row to the Entered stage, awaiting clearance.",
    },
    entered: {
      label: "Mark Cleared",
      title:
        "PCS has cleared this load. Moves it out of the active workbench into Cleared history.",
    },
    cleared: { label: "", title: "" },
  };

  const advanceToNext = () => {
    const next = nextByStage[row.handlerStage];
    if (next) {
      advance.mutate({ id: row.assignmentId, stage: next });
    }
  };

  const flagBack = () => {
    const reason = prompt("Why flag back to uncertain?");
    if (reason) flag.mutate({ id: row.assignmentId, reason, notes: undefined });
  };

  return (
    <div className="bg-surface-variant/30 border border-surface-variant rounded-md mt-1 mb-2 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <StagePill stage={row.handlerStage} />
          <div>
            <div className="font-medium">{row.loadNo}</div>
            <div className="text-xs text-on-surface-variant">
              {row.wellName ?? "— no well"} · {row.driverName ?? "no driver"} ·{" "}
              {row.carrierName ?? ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/bol?search=${encodeURIComponent(row.loadNo ?? "")}`}
            className="text-xs text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 px-2 py-1 rounded border border-outline-variant/40 hover:border-primary/50"
            title="Open this load's BOL submissions in the BOL Center for deeper photo review / OCR correction"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="material-symbols-outlined text-[14px]">
              receipt_long
            </span>
            BOL Center
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-on-surface-variant hover:text-on-surface"
            aria-label="Close detail"
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Photo + fields layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* BOL Photo */}
        <div className="bg-black/20 rounded flex items-center justify-center min-h-[280px]">
          {row.photoThumbUrl ? (
            <img
              src={row.photoThumbUrl}
              alt="BOL"
              className="max-h-[360px] w-auto cursor-zoom-in rounded"
              onClick={() => setLightbox(true)}
            />
          ) : (
            <div className="text-on-surface-variant text-sm">
              No photo attached
            </div>
          )}
        </div>

        {/* Editable fields */}
        <div className="grid grid-cols-2 gap-2">
          <EditableField
            label="BOL #"
            value={row.bolNo}
            ocrValue={ocr?.ocrBolNo}
            onSave={saveField("bolNo")}
            isSaving={update.isPending}
          />
          <EditableField
            label="Ticket #"
            value={row.ticketNo}
            onSave={saveField("ticketNo")}
            isSaving={update.isPending}
          />
          <EditableField
            label="Driver"
            value={row.driverName}
            ocrValue={ocr?.ocrDriverName}
            onSave={saveField("driverName")}
            isSaving={update.isPending}
          />
          <EditableField
            label="Truck #"
            value={row.truckNo}
            onSave={saveField("truckNo")}
            isSaving={update.isPending}
          />
          <EditableField
            label="Weight (tons)"
            value={row.weightTons}
            ocrValue={
              ocr?.ocrWeightLbs != null
                ? (ocr.ocrWeightLbs / 2000).toFixed(2)
                : null
            }
            onSave={saveField("weightTons")}
            isSaving={update.isPending}
            type="number"
          />
          <EditableField
            label="Rate"
            value={row.rate}
            onSave={saveField("rate")}
            isSaving={update.isPending}
            type="number"
            placeholder="$/ton"
          />
          <div data-pcs-number>
            <EditableField
              label="PCS #"
              value={row.pcsNumber}
              onSave={savePcsNumber}
              isSaving={pcsUpdate.isPending}
              placeholder="Enter after build"
            />
          </div>
        </div>
      </div>

      {/* Reconciliation / uncertain reasons — defensive: old responses may
          omit uncertainReasons or discrepancies entirely, so coerce before
          length/map. Without these guards a single shape-drifted row would
          blank the whole drawer. */}
      {(() => {
        const reasons = Array.isArray(row.uncertainReasons)
          ? row.uncertainReasons
          : [];
        const discrepancies = Array.isArray(ocr?.discrepancies)
          ? ocr!.discrepancies
          : [];
        return reasons.length > 0 || discrepancies.length > 0 ? (
          <div className="bg-amber-50 border border-amber-400 rounded p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-900 mb-2">
              What matching caught
            </div>
            <ul className="text-sm space-y-1">
              {reasons.map((r) => (
                <li key={r} className="flex items-start gap-2">
                  <span className="text-amber-700">●</span>
                  <span className="text-on-surface">
                    {REASON_LABEL[r] ?? r}
                  </span>
                </li>
              ))}
              {discrepancies.map((d, i) => (
                <li
                  key={`${d.field}-${i}`}
                  className="flex items-start gap-2 text-on-surface-variant"
                >
                  <span className="text-amber-700">●</span>
                  <span>
                    <span className="font-mono text-xs">{d.field}</span>: load ={" "}
                    <span className="text-on-surface">
                      {String(d.expected ?? "--")}
                    </span>{" "}
                    · OCR ={" "}
                    <span className="text-on-surface">
                      {String(d.actual ?? "--")}
                    </span>
                    {d.severity === "critical" && (
                      <span className="ml-2 text-xs text-rose-700 font-semibold">
                        ({d.severity})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {ocr && (
              <div className="text-[10px] text-on-surface-variant mt-2">
                Match: {ocr.matchMethod ?? "none"} ·{" "}
                {ocr.matchScore != null
                  ? `${ocr.matchScore}% confidence`
                  : "no score"}
              </div>
            )}
          </div>
        ) : null;
      })()}

      {/* Dispatcher notes — free-form persistent note. Save on blur. */}
      <div className="bg-surface-variant/20 border border-surface-variant rounded p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Dispatcher Notes
          </span>
          {notesDirty && (
            <span className="text-[10px] font-bold text-primary uppercase tracking-wide">
              {notesUpdate.isPending ? "saving…" : "unsaved"}
            </span>
          )}
        </div>
        <textarea
          value={notesDraft}
          rows={2}
          placeholder="Context for the next handler: follow-up needed, rate pending, held for driver callback…"
          disabled={notesUpdate.isPending}
          onChange={(e) => {
            setNotesDraft(e.target.value);
            setNotesDirty(e.target.value !== (row.notes ?? ""));
          }}
          onBlur={() => {
            if (!notesDirty) return;
            const next = notesDraft.trim() === "" ? null : notesDraft.trim();
            notesUpdate.mutate(
              { assignmentId: row.assignmentId, notes: next },
              {
                onSuccess: () => setNotesDirty(false),
              },
            );
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          className="w-full text-sm text-on-surface bg-background/60 border border-outline-variant/40 rounded px-2 py-1.5 focus:outline-none focus:border-primary/60 resize-y disabled:opacity-60"
          aria-label="Dispatcher notes"
        />
      </div>

      {/* Stage transition timeline — audit trail of how this row moved
          through the pipeline. Shows the last 6 transitions by default,
          with a "Show all" toggle for audit sessions where the full
          history matters.
          Defensive: old backend responses may not include status_history
          yet, so guard Array.isArray explicitly rather than rely on types. */}
      {Array.isArray(row.statusHistory) && row.statusHistory.length > 0 && (
        <div className="bg-surface-variant/20 border border-surface-variant rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Timeline
              <span className="ml-1 text-on-surface-variant/60 normal-case tracking-normal">
                ({row.statusHistory.length} transition
                {row.statusHistory.length === 1 ? "" : "s"})
              </span>
            </span>
            {row.statusHistory.length > 6 && (
              <button
                type="button"
                onClick={() => setTimelineExpanded((v) => !v)}
                className="text-[10px] font-semibold text-primary hover:underline uppercase tracking-wider"
              >
                {timelineExpanded
                  ? "Show last 6"
                  : `Show all (${row.statusHistory.length})`}
              </button>
            )}
          </div>
          <ul className="space-y-1.5">
            {[...row.statusHistory]
              .reverse()
              .slice(0, timelineExpanded ? row.statusHistory.length : 6)
              .map((h, i) => {
                const when = h.changedAt
                  ? new Date(h.changedAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "--";
                return (
                  <li
                    key={`${h.changedAt}-${i}`}
                    className="flex items-start gap-2 text-xs"
                  >
                    <span className="text-outline-variant mt-1">●</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-on-surface">
                        <span className="font-medium">{h.status}</span>
                        <span className="text-on-surface-variant">
                          {" "}
                          — {h.changedByName ?? "system"} · {when}
                        </span>
                      </div>
                      {h.notes && (
                        <div className="text-[11px] text-on-surface-variant mt-0.5 italic">
                          “{h.notes}”
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-surface-variant">
        <div className="text-xs text-on-surface-variant">
          Handler:{" "}
          <span
            className="font-medium"
            style={{ color: row.currentHandlerColor ?? undefined }}
          >
            {row.currentHandlerName ?? "unclaimed"}
          </span>
        </div>
        <div className="flex gap-2">
          {row.handlerStage !== "uncertain" && (
            <button
              type="button"
              data-flag-button
              onClick={flagBack}
              disabled={flag.isPending}
              title="Send this load back to the Uncertain queue for re-review. Requires a reason you'll type next."
              className="px-3 py-1.5 text-sm rounded border border-amber-500 text-amber-900 bg-amber-50 hover:bg-amber-100 disabled:opacity-50"
            >
              Flag back to Uncertain
            </button>
          )}
          {row.handlerStage !== "cleared" && (
            <button
              type="button"
              data-primary-action
              onClick={advanceToNext}
              disabled={advance.isPending}
              title={ADVANCE_COPY[row.handlerStage].title}
              className="px-3 py-1.5 text-sm rounded bg-primary text-on-primary disabled:opacity-50"
            >
              {advance.isPending
                ? "Advancing…"
                : ADVANCE_COPY[row.handlerStage].label}
            </button>
          )}
        </div>
      </div>

      {/* Lightbox — shared component */}
      <PhotoLightbox
        url={lightbox ? row.photoThumbUrl : null}
        alt={`Load ${row.loadNo} BOL`}
        onClose={() => setLightbox(false)}
      />
    </div>
  );
}
