import { useState, useEffect, Component, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useUpdateLoadField,
  useBolReconciliation,
  useAdvanceStage,
  useFlagToUncertain,
  useUpdatePcsNumber,
  useUpdateAssignmentNotes,
  useAssignmentPhotos,
} from "../hooks/use-workbench";
import { api } from "../lib/api";
import { reportError } from "../lib/sentry";
import { resolvePhotoUrl } from "../lib/photo-url";
import { DiscrepancyPanel } from "./DiscrepancyPanel";

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
import { BOLDisplay } from "./BOLDisplay";
import { PhotoStateBadge } from "./PhotoStateBadge";
import type { WorkbenchRow, UncertainReason } from "../types/api";

interface WorkbenchDrawerProps {
  row?: WorkbenchRow;
  onClose: () => void;
  cellContext?: CellContext;
}

/**
 * Optional cell-mode context for opening the drawer from a Worksurface
 * grid cell (well + day) instead of a single load. When provided, the
 * drawer renders a cell-summary header + context-aware action bar driven
 * by the v2-derived workflow status (Wave 1 of unified worksurface).
 *
 * Action handlers are stubs in Wave 1 — actual write-throughs land in
 * Phase 1.5 once the cell-summary surface is validated with the team.
 */
export interface CellContext {
  wellId: number;
  wellName: string;
  billTo: string | null;
  weekStart: string;
  dow: number; // 0..6 (Sun-Sat)
  loadCount: number;
  derivedStatus: string;
  paintedStatus?: string | null;
  // Real action wiring (Phase 1.5 #1). When the parent loads the
  // cell's loads via /diag/well-grid/cell, it passes these IDs in so
  // the drawer's Confirm button can fire bulk-confirm without a
  // second round-trip.
  assignmentIds?: number[];
  // Loads list for the cell — rendered as the drawer body.
  loads?: Array<{
    load_id: number;
    assignment_id: number;
    assignment_status: string;
    photo_status: string | null;
    load_no: string | null;
    driver_name: string | null;
    bol_no: string | null;
    ticket_no: string | null;
    weight_tons: string | null;
    weight_lbs: string | null;
    delivered_on: string | null;
  }>;
  isConfirming?: boolean;
  confirmResult?: string | null; // success/error message after bulk-confirm
  onConfirm?: () => void;
  onMatchBol?: () => void;
  onAssignDriver?: () => void;
  onAddComment?: (body: string) => void;
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

/**
 * Re-run Claude Vision OCR on this assignment's latest BOL submission.
 * Any dispatcher can hit this (per 2026-04-22 client ask: "I want the OCR
 * for everyone") — not admin-gated. Resets retryCount so MAX_RETRY
 * doesn't block.
 *
 * Use cases: OCR extracted wrong BOL# or weight, photo was rotated after
 * initial pass, driver uploaded a cleaner copy, original confidence low.
 */
function RerunOcrButton({ assignmentId }: { assignmentId: number }) {
  const qc = useQueryClient();
  const [flash, setFlash] = useState<null | { ok: boolean; msg: string }>(null);
  const mut = useMutation({
    mutationFn: async () =>
      api.post<{
        success: boolean;
        data: {
          submissionId: number;
          extraction: { overallConfidence: number };
          validation: { isValid: boolean };
        };
      }>(`/dispatch/workbench/${assignmentId}/rerun-ocr`, {}),
    onSuccess: (r) => {
      const conf = Math.round(
        (r.data?.extraction?.overallConfidence ?? 0) * 100,
      );
      setFlash({
        ok: r.data?.validation?.isValid ?? false,
        msg: r.data?.validation?.isValid
          ? `OCR re-ran — ${conf}% confidence`
          : `OCR re-ran — ${conf}% confidence, validation warnings`,
      });
      qc.invalidateQueries({ queryKey: ["workbench"] });
      setTimeout(() => setFlash(null), 6000);
    },
    onError: (err: Error) => {
      setFlash({ ok: false, msg: `Re-run failed: ${err.message}` });
      setTimeout(() => setFlash(null), 8000);
    },
  });

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          mut.mutate();
        }}
        disabled={mut.isPending}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-white/20 bg-black/40 text-white hover:bg-black/60 disabled:opacity-50"
        title="Re-run Claude Vision OCR on the latest BOL photo"
      >
        {mut.isPending ? "Re-running OCR…" : "Re-run OCR"}
      </button>
      {flash && (
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            flash.ok
              ? "bg-emerald-100 text-emerald-900"
              : "bg-amber-100 text-amber-900"
          }`}
        >
          {flash.msg}
        </span>
      )}
    </div>
  );
}

export function WorkbenchDrawer(props: WorkbenchDrawerProps) {
  // Cell-mode: opened from a Worksurface grid cell (well + day) instead of
  // a single load row. Renders the cell-summary header + action bar only.
  // Per-load drill-down list is deferred to Phase 1.5.
  if (props.cellContext && !props.row) {
    return (
      <DrawerErrorBoundary onReset={props.cellContext.onClose}>
        <CellSummaryDrawerBody cellContext={props.cellContext} />
      </DrawerErrorBoundary>
    );
  }
  // Existing load-mode (per-load drawer) — unchanged behavior.
  if (!props.row) return null;
  return (
    <DrawerErrorBoundary onReset={props.onClose}>
      <WorkbenchDrawerBody row={props.row} onClose={props.onClose} />
    </DrawerErrorBoundary>
  );
}

/**
 * Cell-mode drawer body: renders a fixed-position right-side panel showing
 * the cell summary (well + bill-to + day + v2 status / count) and a
 * context-aware action bar whose primary CTA changes verbatim with the
 * v2-derived workflow status.
 *
 * Action handlers are stubs in Wave 1 — actual write-throughs land in
 * Phase 1.5 once the surface is validated with the dispatch team.
 */
function CellSummaryDrawerBody({ cellContext }: { cellContext: CellContext }) {
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [commentBody, setCommentBody] = useState("");

  // ESC key dismisses the drawer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") cellContext.onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [cellContext]);

  const dayLabel = (() => {
    const d = new Date(cellContext.weekStart + "T00:00:00");
    d.setDate(d.getDate() + cellContext.dow);
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  })();

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px]"
        onClick={cellContext.onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md lg:max-w-sm xl:max-w-md bg-bg-primary border-l border-border shadow-2xl flex flex-col">
        <div className="border-b border-border bg-bg-secondary p-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs text-text-secondary">
                {cellContext.billTo ?? "—"}
              </div>
              <h2 className="text-lg font-semibold">{cellContext.wellName}</h2>
              <div className="text-xs text-text-secondary mt-1">{dayLabel}</div>
            </div>
            <button
              type="button"
              onClick={cellContext.onClose}
              className="text-text-secondary hover:text-text-primary"
              aria-label="Close drawer"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-border bg-bg-primary/40 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-text-secondary">
                v2 status
              </div>
              <div className="font-semibold">
                {cellContext.derivedStatus.replace(/_/g, " ")}
              </div>
            </div>
            <div className="rounded-md border border-border bg-bg-primary/40 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-text-secondary">
                v2 count
              </div>
              <div className="font-semibold">{cellContext.loadCount}</div>
            </div>
            {cellContext.paintedStatus && (
              <div className="col-span-2 rounded-md border border-border bg-bg-primary/40 px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wide text-text-secondary">
                  sheet-painted
                </div>
                <div className="font-semibold">
                  {cellContext.paintedStatus.replace(/_/g, " ")}
                </div>
              </div>
            )}
          </div>
          {/* Action bar — context-aware on derivedStatus */}
          <div className="mt-3 flex flex-wrap gap-2">
            {cellContext.derivedStatus === "missing_tickets" && (
              <button
                type="button"
                onClick={cellContext.onMatchBol}
                className="px-3 py-1.5 text-sm rounded-md bg-accent text-white hover:opacity-90"
              >
                Match BOL
              </button>
            )}
            {cellContext.derivedStatus === "missing_driver" && (
              <button
                type="button"
                onClick={cellContext.onAssignDriver}
                className="px-3 py-1.5 text-sm rounded-md bg-accent text-white hover:opacity-90"
              >
                Assign Driver
              </button>
            )}
            {cellContext.derivedStatus === "loads_being_built" && (
              <button
                type="button"
                onClick={cellContext.onConfirm}
                disabled={
                  cellContext.isConfirming ||
                  (cellContext.assignmentIds?.length ?? 0) === 0
                }
                className="px-3 py-1.5 text-sm rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  cellContext.assignmentIds?.length
                    ? `Bulk-advance ${cellContext.assignmentIds.length} loads to built`
                    : "No loads to advance"
                }
              >
                {cellContext.isConfirming
                  ? "Confirming..."
                  : `Confirm (${cellContext.assignmentIds?.length ?? 0})`}
              </button>
            )}
            {cellContext.derivedStatus === "loads_completed" && (
              <button
                type="button"
                disabled
                className="px-3 py-1.5 text-sm rounded-md bg-bg-tertiary text-text-secondary border border-border opacity-60 cursor-not-allowed"
                title="PCS push awaiting enablement"
              >
                Push to PCS
              </button>
            )}
            {cellContext.derivedStatus === "need_rate_info" && (
              <button
                type="button"
                onClick={() =>
                  window.open(
                    `/admin/wells?well=${cellContext.wellId}`,
                    "_blank",
                  )
                }
                className="px-3 py-1.5 text-sm rounded-md bg-amber-500 text-white hover:opacity-90"
              >
                → Set rate on Well page
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCommentForm((v) => !v)}
              className="px-3 py-1.5 text-sm rounded-md border border-border bg-transparent text-text-primary hover:bg-bg-tertiary"
            >
              {showCommentForm ? "Cancel comment" : "Add Comment"}
            </button>
          </div>
          {showCommentForm && (
            <div className="mt-3 space-y-2">
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder={`Comment on this cell (${cellContext.wellName})…`}
                rows={3}
                autoFocus
                className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-bg-primary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (commentBody.trim()) {
                      cellContext.onAddComment?.(commentBody.trim());
                      setCommentBody("");
                      setShowCommentForm(false);
                    }
                  }}
                  disabled={!commentBody.trim()}
                  className="px-3 py-1 text-xs rounded-md bg-accent text-white disabled:opacity-50"
                >
                  Save comment
                </button>
              </div>
            </div>
          )}
          {cellContext.confirmResult && (
            <div className="mt-3 px-3 py-2 rounded-md text-xs bg-bg-primary border border-border">
              {cellContext.confirmResult}
            </div>
          )}
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {(cellContext.loads ?? []).length === 0 ? (
            <div className="text-xs text-text-secondary text-center py-6">
              No loads in this cell.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-text-secondary uppercase tracking-wide">
                <tr className="border-b border-border">
                  <th className="text-left py-1.5 pr-2">Driver</th>
                  <th className="text-left py-1.5 pr-2">Ticket #</th>
                  <th className="text-right py-1.5 pr-2">Wt</th>
                  <th className="text-left py-1.5 pr-2">Status</th>
                  <th className="text-left py-1.5 pr-2">Photo</th>
                  <th className="text-right py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {(cellContext.loads ?? []).map((l) => (
                  <tr
                    key={l.load_id}
                    className="border-b border-border/40 cursor-pointer hover:bg-bg-tertiary/50"
                    onClick={() =>
                      window.open(`/load-report?load=${l.load_id}`, "_blank")
                    }
                    title="Open load detail (driver, photo, audit log)"
                  >
                    <td className="py-1.5 pr-2">
                      {l.driver_name ?? (
                        <span className="text-amber-600">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums">
                      {l.ticket_no ?? "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {l.weight_tons
                        ? Number(l.weight_tons).toFixed(2)
                        : l.weight_lbs
                          ? `${(Number(l.weight_lbs) / 2000).toFixed(2)}`
                          : "—"}
                    </td>
                    <td className="py-1.5 pr-2">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-bg-primary border border-border">
                        {l.assignment_status}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2">
                      {l.photo_status === "attached" ? (
                        <span className="text-green-600" title="Attached">
                          ●
                        </span>
                      ) : l.photo_status === "pending" ? (
                        <span className="text-amber-500" title="Pending">
                          ○
                        </span>
                      ) : (
                        <span className="text-red-500" title="Missing">
                          ✕
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right text-text-secondary text-[10px]">
                      open →
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

interface WorkbenchDrawerBodyProps {
  row: WorkbenchRow;
  onClose: () => void;
}

function WorkbenchDrawerBody({ row, onClose }: WorkbenchDrawerBodyProps) {
  const update = useUpdateLoadField();
  const bol = useBolReconciliation(row.loadId);
  const advance = useAdvanceStage();
  const flag = useFlagToUncertain();
  const pcsUpdate = useUpdatePcsNumber();
  const notesUpdate = useUpdateAssignmentNotes();
  const [lightbox, setLightbox] = useState(false);
  // Lazy-fetch the full photo array only when the drawer thinks there's
  // more than one. Most rows have 0-1 photos and paying for this query on
  // every drawer open isn't worth it.
  const needsPhotoList = (row.photoCount ?? 0) > 1;
  const photosQuery = useAssignmentPhotos(
    needsPhotoList ? row.assignmentId : null,
  );
  const photoUrls: string[] =
    photosQuery.data && photosQuery.data.length > 0
      ? photosQuery.data
      : row.photoThumbUrl
        ? [row.photoThumbUrl]
        : [];
  const [photoIdx, setPhotoIdx] = useState(0);
  useEffect(() => {
    setPhotoIdx(0);
  }, [row.assignmentId]);
  // Route through resolvePhotoUrl so JotForm absolute URLs go via the
  // proxy (which auto-rotates EXIF). Relative `/api/v1/...` URLs are
  // already-proxied and pass through with just the API base prefix.
  const rawCurrentPhoto = photoUrls[photoIdx] ?? row.photoThumbUrl ?? null;
  const currentPhoto = rawCurrentPhoto
    ? resolvePhotoUrl(rawCurrentPhoto)
    : null;
  const stepPhoto = (delta: number) => {
    if (photoUrls.length < 2) return;
    const n = photoUrls.length;
    setPhotoIdx((i) => (i + delta + n) % n);
  };
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
        <div className="relative bg-black/20 rounded flex flex-col items-center justify-center min-h-[280px] p-4 gap-3">
          {currentPhoto ? (
            <>
              <img
                src={currentPhoto}
                alt="BOL"
                className="max-h-[360px] w-auto cursor-zoom-in rounded"
                loading="eager"
                decoding="async"
                onClick={() => setLightbox(true)}
                onError={(e) => {
                  // Transient fetch failure (proxy 503, CDN edge miss).
                  // One retry with a cache-buster — if that fails, leave
                  // the broken image and let the user Run Check.
                  const img = e.currentTarget;
                  if (!img.dataset.retried) {
                    img.dataset.retried = "1";
                    const sep = currentPhoto.includes("?") ? "&" : "?";
                    img.src = `${currentPhoto}${sep}_r=${Date.now()}`;
                  }
                }}
              />
              {photoUrls.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={(e) => {
                      e.stopPropagation();
                      stepPhoto(-1);
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white hover:bg-black/70 flex items-center justify-center"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={(e) => {
                      e.stopPropagation();
                      stepPhoto(1);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white hover:bg-black/70 flex items-center justify-center"
                  >
                    ›
                  </button>
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full tabular-nums">
                    {photoIdx + 1} / {photoUrls.length}
                  </div>
                </>
              )}
              <RerunOcrButton assignmentId={row.assignmentId} />
            </>
          ) : (
            <>
              <PhotoStateBadge row={row} />
              <div className="text-on-surface-variant text-sm">
                No photo attached
              </div>
              {/* Manual hunt — when a row is missing a photo, give the user
                  a one-click path into BOL Center with the load's BOL (or
                  driver, if no BOL) pre-searched across JotForm + matched
                  PropX. Critical during historical back-mapping where the
                  matcher can't auto-attach but evidence may still exist. */}
              {(row.bolNo || row.driverName || row.ticketNo) &&
                (() => {
                  // Pass the richest matching term we have so BOL Center's
                  // server-side ILIKE has multiple chances to hit a submission.
                  // Order: bol → ticket → driver. Additional context (date,
                  // weight, destination) piggybacks as URL params so a future
                  // BOL Center enhancement can rank candidates by full-load
                  // context instead of single-field search.
                  const primary =
                    row.bolNo || row.ticketNo || row.driverName || "";
                  const params = new URLSearchParams({
                    tab: "submissions",
                    search: primary,
                  });
                  if (row.driverName && primary !== row.driverName) {
                    params.set("ctx_driver", row.driverName);
                  }
                  if (row.deliveredOn)
                    params.set("ctx_date", row.deliveredOn.slice(0, 10));
                  if (row.wellName) params.set("ctx_well", row.wellName);
                  const allCandidates = [
                    row.bolNo,
                    row.ticketNo,
                    row.driverName,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <Link
                      to={`/bol?${params.toString()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/40 bg-primary/5 text-primary text-xs font-semibold hover:bg-primary/10 transition-colors"
                      title={`Search BOL Center for: ${allCandidates}`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        search
                      </span>
                      Find matches in BOL Center
                      <span className="material-symbols-outlined text-sm">
                        open_in_new
                      </span>
                    </Link>
                  );
                })()}
            </>
          )}
        </div>

        {/* Editable fields */}
        <div className="grid grid-cols-2 gap-2">
          {/* BOL — rendered read-only via the unified BOLDisplay. The paper
              ticket number IS the BOL (vocabulary decision with Jessica,
              2026-04-21); the Logistiq/PropX system identifier is shown only
              as a muted suffix. To edit the ticket number itself, use the
              "Ticket #" field below — this avoids the previous confusion
              where a "BOL #" editable exposed the system ID as if it were
              dispatcher-owned data. */}
          <div className="col-span-2 flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">
              BOL
            </span>
            <BOLDisplay
              ticketNo={row.ticketNo}
              bolNo={row.bolNo}
              loadSource={row.loadSource}
              size="md"
              showSourcePrefix={false}
            />
          </div>
          <EditableField
            label="Ticket #"
            value={row.ticketNo}
            onSave={saveField("ticketNo")}
            isSaving={update.isPending}
          />
          {/* Vocabulary disambiguation — Logistiq-sourced loads carry an
              internal code (e.g. AU26...) that the source system calls a
              "BOL," but the dispatch team uses the scale-ticket number as
              the BOL in everyday speech. Surface the mapping only when the
              two differ so the user sees both identifiers for the same
              load without hunting. */}
          {row.bolNo &&
            row.ticketNo &&
            row.bolNo.trim() !== row.ticketNo.trim() && (
              <div className="col-span-2 -mt-1 text-[11px] text-on-surface-variant bg-primary/5 border border-primary/15 rounded px-2 py-1.5 leading-snug">
                <span className="font-semibold text-primary">Heads up —</span>{" "}
                System ID (Logistiq internal code) differs from the paper ticket
                number — both identify the same load.
              </div>
            )}
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

      {/* PCS Cross-Check — discrepancies between v2 and PCS for this load.
          Empty when v2 and PCS agree (collapses to a small "agree" line).
          Surfaces status drift, weight drift, well mismatch, rate drift in
          the dispatcher's flow without requiring a tab switch. */}
      <div className="px-4 pb-3">
        <DiscrepancyPanel assignmentId={row.assignmentId} />
      </div>

      {/* Stage transition timeline — audit trail of how this row moved
          through the pipeline. Shows the last 6 transitions by default,
          with a "Show all" toggle for audit sessions where the full
          history matters.

          Build #2 (2026-04-21) — enhanced to distinguish system/auto
          actions from dispatcher-initiated ones. Jessica's Apr 21 email
          flagged: "loads showing cleared from the 20th — I haven't
          cleared anything." The distinction now surfaces directly in
          the drawer: Auto-Mapper / system entries render in muted with
          a gear icon; named dispatcher actions render with a person
          icon in primary color.

          Fallback: when statusHistory is empty/null but the row is
          already in a terminal stage (`cleared`), synthesize an entry
          explaining the Apr 20 backfill so the row isn't unexplained. */}
      {(() => {
        const history = Array.isArray(row.statusHistory)
          ? row.statusHistory
          : [];
        // Synthetic entry for the mass-clear backfill case: cleared rows
        // with no recorded history came from migration 0011 or the Apr
        // 20 re-run. stageChangedAt is the only timestamp we have.
        const needsBackfillSynth =
          history.length === 0 && row.handlerStage === "cleared";
        const entries = needsBackfillSynth
          ? [
              {
                status: "stage:cleared",
                changedAt: row.stageChangedAt ?? null,
                changedBy: undefined as number | undefined,
                changedByName: "Auto-Mapper (historical backfill)",
                notes:
                  "Cleared by system backfill on 2026-04-20 — load was already terminal upstream (Delivered or Completed in PropX/Logistiq). Not a dispatcher action.",
              },
            ]
          : history;
        if (entries.length === 0) return null;

        const isSystemActor = (name: string | undefined | null): boolean => {
          if (!name) return true;
          const n = name.toLowerCase();
          return (
            n.includes("auto-mapper") ||
            n.includes("automapper") ||
            n === "system" ||
            n.includes("reconciliation") ||
            n.includes("backfill")
          );
        };

        return (
          <div className="bg-surface-variant/20 border border-surface-variant rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                Audit Log
                <span className="ml-1 text-on-surface-variant/60 normal-case tracking-normal">
                  ({entries.length} {entries.length === 1 ? "entry" : "entries"}
                  )
                </span>
              </span>
              {entries.length > 6 && (
                <button
                  type="button"
                  onClick={() => setTimelineExpanded((v) => !v)}
                  className="text-[10px] font-semibold text-primary hover:underline uppercase tracking-wider"
                >
                  {timelineExpanded
                    ? "Show last 6"
                    : `Show all (${entries.length})`}
                </button>
              )}
            </div>
            <ul className="space-y-1.5">
              {[...entries]
                .reverse()
                .slice(0, timelineExpanded ? entries.length : 6)
                .map((h, i) => {
                  const when = h.changedAt
                    ? new Date(h.changedAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "--";
                  const actor = h.changedByName ?? "system";
                  const isSystem = isSystemActor(h.changedByName);
                  return (
                    <li
                      key={`${h.changedAt ?? "none"}-${i}`}
                      className="flex items-start gap-2 text-xs"
                    >
                      <span
                        className={`material-symbols-outlined text-[14px] mt-0.5 shrink-0 ${
                          isSystem
                            ? "text-on-surface-variant/70"
                            : "text-primary"
                        }`}
                        title={
                          isSystem
                            ? "System / Auto-Mapper action — not initiated by a dispatcher"
                            : "Dispatcher action"
                        }
                      >
                        {isSystem ? "settings" : "person"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div
                          className={
                            isSystem
                              ? "text-on-surface-variant"
                              : "text-on-surface"
                          }
                        >
                          <span className="font-medium">{h.status}</span>
                          <span
                            className={
                              isSystem
                                ? "text-on-surface-variant/70"
                                : "text-on-surface-variant"
                            }
                          >
                            {" "}
                            —{" "}
                            <span
                              className={isSystem ? "italic" : "font-medium"}
                            >
                              {actor}
                            </span>
                            {" · "}
                            {when}
                          </span>
                        </div>
                        {h.notes && (
                          <div
                            className={`text-[11px] mt-0.5 italic ${
                              isSystem
                                ? "text-on-surface-variant/60"
                                : "text-on-surface-variant"
                            }`}
                          >
                            &ldquo;{h.notes}&rdquo;
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>
            {needsBackfillSynth && (
              <div className="mt-2 pt-2 border-t border-surface-variant/60 text-[10px] text-on-surface-variant/70 italic">
                Heads up — this entry is inferred from the stage timestamp. The
                Apr 20 backfill ran without per-row audit entries, so future
                clearing actions will be attributed explicitly.
              </div>
            )}
          </div>
        );
      })()}

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

      {/* Lightbox — shared component. Passes the full array so cycling
          in the lightbox matches cycling in the drawer thumbnail. */}
      <PhotoLightbox
        urls={lightbox ? photoUrls : undefined}
        initialIndex={photoIdx}
        alt={`Load ${row.loadNo} BOL`}
        onClose={() => setLightbox(false)}
      />
    </div>
  );
}
