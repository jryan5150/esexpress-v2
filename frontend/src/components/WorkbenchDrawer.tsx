import { useState, useEffect } from "react";
import {
  useUpdateLoadField,
  useBolReconciliation,
  useAdvanceStage,
  useFlagToUncertain,
} from "../hooks/use-workbench";
import { StagePill } from "./StagePill";
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

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

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

  return (
    <div className="bg-surface-variant/40 rounded p-2 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
          {label}
        </span>
        {isSaving && (
          <span className="text-[10px] text-primary">saving…</span>
        )}
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
          className="w-full text-left text-sm px-2 py-1 hover:bg-background/60 rounded"
        >
          {value ?? <span className="text-on-surface-variant">--</span>}
        </button>
      )}
      {ocrValue != null && (
        <div
          className={`mt-1 text-[10px] flex items-center gap-1 ${
            ocrMismatch ? "text-amber-400" : "text-on-surface-variant"
          }`}
          title="OCR-extracted value from the BOL photo"
        >
          <span>OCR:</span>
          <span className="font-mono truncate">{String(ocrValue)}</span>
          {ocrMismatch && <span className="ml-auto">⚠ mismatch</span>}
        </div>
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
};

export function WorkbenchDrawer({ row, onClose }: WorkbenchDrawerProps) {
  const update = useUpdateLoadField();
  const bol = useBolReconciliation(row.loadId);
  const advance = useAdvanceStage();
  const flag = useFlagToUncertain();
  const [lightbox, setLightbox] = useState(false);

  const ocr = bol.data;

  const saveField = (key: string) => (next: string) => {
    const value = next.trim() === "" ? null : next.trim();
    update.mutate({ loadId: row.loadId, updates: { [key]: value } });
  };

  const advanceToNext = () => {
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
    const next = nextByStage[row.handlerStage];
    if (next) {
      advance.mutate({ id: row.assignmentId, stage: next });
    }
  };

  const flagBack = () => {
    const reason = prompt("Why flag back to uncertain?");
    if (reason)
      flag.mutate({ id: row.assignmentId, reason, notes: undefined });
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
              {row.wellName ?? "— no well"} · {row.driverName ?? "no driver"}{" "}
              · {row.carrierName ?? ""}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-on-surface-variant hover:text-on-surface"
          aria-label="Close detail"
        >
          ✕ Close
        </button>
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
        </div>
      </div>

      {/* Reconciliation / uncertain reasons */}
      {(row.uncertainReasons.length > 0 ||
        (ocr?.discrepancies?.length ?? 0) > 0) && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300 mb-2">
            What matching caught
          </div>
          <ul className="text-sm space-y-1">
            {row.uncertainReasons.map((r) => (
              <li key={r} className="flex items-start gap-2">
                <span className="text-amber-400">●</span>
                <span>{REASON_LABEL[r]}</span>
              </li>
            ))}
            {ocr?.discrepancies.map((d, i) => (
              <li
                key={`${d.field}-${i}`}
                className="flex items-start gap-2 text-on-surface-variant"
              >
                <span className="text-amber-400">●</span>
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
                    <span className="ml-2 text-xs text-red-400">
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
              {ocr.matchScore != null ? `${ocr.matchScore}% confidence` : "no score"}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-surface-variant">
        <div className="text-xs text-on-surface-variant">
          Handler:{" "}
          <span className="font-medium" style={{ color: row.currentHandlerColor ?? undefined }}>
            {row.currentHandlerName ?? "unclaimed"}
          </span>
        </div>
        <div className="flex gap-2">
          {row.handlerStage !== "uncertain" && (
            <button
              type="button"
              onClick={flagBack}
              disabled={flag.isPending}
              className="px-3 py-1.5 text-sm rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
            >
              Flag back to Uncertain
            </button>
          )}
          {row.handlerStage !== "cleared" && (
            <button
              type="button"
              onClick={advanceToNext}
              disabled={advance.isPending}
              className="px-3 py-1.5 text-sm rounded bg-primary text-on-primary disabled:opacity-50"
            >
              {advance.isPending ? "Advancing…" : "Advance →"}
            </button>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && row.photoThumbUrl && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 cursor-zoom-out"
          onClick={() => setLightbox(false)}
        >
          <img
            src={row.photoThumbUrl}
            alt="BOL"
            className="max-h-[90vh] max-w-[90vw]"
          />
        </div>
      )}
    </div>
  );
}
