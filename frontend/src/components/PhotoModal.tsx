import { useState, useEffect, useRef } from "react";
import { Button } from "./Button";
import { useUpdateLoad } from "../hooks/use-wells";
import { useToast } from "./Toast";

interface PhotoModalProps {
  photoUrls: string[];
  loadId: number;
  loadNo: string;
  wellName: string;
  bolNo: string | null;
  driverName: string | null;
  truckNo: string | null;
  carrierName: string | null;
  weightTons: string | null;
  ticketNo: string | null;
  autoMapScore: string | null;
  onClose: () => void;
  onValidate?: () => void;
  onFlag?: () => void;
  showValidateButton?: boolean;
}

/** Single editable field row matching mockup: label left, value right */
function EditableField({
  label,
  value,
  fieldKey,
  onSave,
  mono = false,
}: {
  label: string;
  value: string | null;
  fieldKey: string;
  onSave: (key: string, value: string) => void;
  mono?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    if (draft !== (value || "")) {
      onSave(fieldKey, draft);
    }
    setEditing(false);
  };

  return (
    <div className="flex justify-between items-start py-2.5 border-b border-outline-variant/30 last:border-b-0">
      <span className="text-[10px] font-semibold text-outline tracking-[0.06em] uppercase pt-0.5">
        {label}
      </span>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(value || "");
              setEditing(false);
            }
          }}
          className={`text-right bg-background border border-primary/40 rounded px-2 py-0.5 text-[13px] font-semibold text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/30 w-40 ${mono ? "font-label tabular-nums" : ""}`}
        />
      ) : (
        <button
          onClick={() => {
            setDraft(value || "");
            setEditing(true);
          }}
          className={`text-right text-[13px] font-semibold text-on-surface hover:text-primary cursor-pointer transition-colors ${mono ? "font-label tabular-nums" : ""}`}
          title="Click to edit"
        >
          {value || <span className="text-outline/40">--</span>}
        </button>
      )}
    </div>
  );
}

export function PhotoModal({
  photoUrls,
  loadId,
  loadNo,
  wellName,
  bolNo,
  driverName,
  truckNo,
  carrierName,
  weightTons,
  ticketNo,
  autoMapScore,
  onClose,
  onValidate,
  onFlag,
  showValidateButton = true,
}: PhotoModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const updateLoad = useUpdateLoad();
  const { toast } = useToast();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "ArrowLeft" && currentIndexRef.current > 0)
        setCurrentIndex((prev) => prev - 1);
      if (
        e.key === "ArrowRight" &&
        currentIndexRef.current < photoUrls.length - 1
      )
        setCurrentIndex((prev) => prev + 1);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [photoUrls.length]);

  // Focus trap
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();
    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    modal.addEventListener("keydown", trapFocus);
    return () => modal.removeEventListener("keydown", trapFocus);
  }, []);

  const handleFieldSave = (fieldKey: string, value: string) => {
    updateLoad.mutate(
      { loadId, updates: { [fieldKey]: value || null } },
      {
        onSuccess: () => toast(`${fieldKey} updated`, "success"),
        onError: (err) =>
          toast(`Update failed: ${(err as Error).message}`, "error"),
      },
    );
  };

  const matchPct = autoMapScore ? Math.round(Number(autoMapScore) * 100) : null;

  const fullUrl = (url: string) =>
    url.startsWith("/") ? `${import.meta.env.VITE_API_URL || ""}${url}` : url;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/55 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="bg-surface-container-lowest border border-surface-container-highest rounded-[14px] w-[72vw] max-w-[900px] max-h-[85vh] overflow-hidden flex flex-col shadow-lg"
        style={{
          boxShadow:
            "0 8px 32px rgba(30,27,24,0.14), 0 0 0 1px rgba(109,40,217,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-modal-title"
      >
        {/* Header — matches mockup: purple icon + BOL # + subtitle + close */}
        <div className="flex items-center gap-3.5 px-[22px] py-[18px] border-b border-outline-variant/30 bg-surface-container-lowest">
          <div className="w-10 h-10 bg-primary rounded-[10px] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-on-primary text-xl">
              description
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="photo-modal-title"
              className="font-headline text-[17px] font-bold text-on-surface tabular-nums"
            >
              BOL #{bolNo || "--"}
            </h2>
            <p className="text-xs text-outline mt-0.5">
              Load #{loadNo} &middot; {wellName} &middot;{" "}
              {driverName || "Unknown"} / {carrierName || "--"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-md border border-outline-variant/40 flex items-center justify-center text-outline hover:bg-surface-container-high hover:text-on-surface transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Body — split: photo left, info right */}
        <div
          className="grid min-h-[340px]"
          style={{ gridTemplateColumns: "1fr 300px" }}
        >
          {/* Photo area */}
          <div className="bg-background border-r border-outline-variant/30 flex items-center justify-center flex-col gap-3 p-8">
            {photoUrls.length > 0 ? (
              <>
                <img
                  src={fullUrl(photoUrls[currentIndex])}
                  alt={`Photo ${currentIndex + 1}`}
                  className="max-w-full max-h-[50vh] object-contain rounded-lg"
                />
                <span className="font-label text-[11px] font-medium text-outline bg-surface-container-high px-2.5 py-0.5 rounded-full">
                  Photo {currentIndex + 1} of {photoUrls.length}
                </span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-6xl text-surface-container-highest">
                  receipt_long
                </span>
                <p className="text-xs text-outline">BOL Photo Placeholder</p>
                <span className="font-label text-[11px] font-medium text-outline bg-surface-container-high px-2.5 py-0.5 rounded-full">
                  Photo 0 of 0
                </span>
              </>
            )}
          </div>

          {/* Info panel — editable fields matching mockup layout */}
          <div className="p-5 flex flex-col">
            <div className="flex-1">
              <EditableField
                label="Driver"
                value={driverName}
                fieldKey="driverName"
                onSave={handleFieldSave}
              />
              <EditableField
                label="Truck"
                value={truckNo}
                fieldKey="truckNo"
                onSave={handleFieldSave}
                mono
              />
              <EditableField
                label="Carrier"
                value={carrierName}
                fieldKey="carrierName"
                onSave={handleFieldSave}
              />
              <EditableField
                label="Weight"
                value={weightTons ? `${weightTons}` : null}
                fieldKey="weightTons"
                onSave={handleFieldSave}
                mono
              />
              <EditableField
                label="BOL #"
                value={bolNo}
                fieldKey="bolNo"
                onSave={handleFieldSave}
                mono
              />
              <EditableField
                label="Ticket #"
                value={ticketNo}
                fieldKey="ticketNo"
                onSave={handleFieldSave}
                mono
              />
              {matchPct !== null && (
                <div className="flex justify-between items-center py-2.5">
                  <span className="text-[10px] font-semibold text-outline tracking-[0.06em] uppercase">
                    Match Score
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                      matchPct >= 90
                        ? "bg-[#d1fae5] text-[#065f46]"
                        : matchPct >= 70
                          ? "bg-[#ede9f8] text-primary"
                          : "bg-[#fee2e2] text-[#991b1b]"
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">
                      {matchPct >= 90 ? "verified" : "help"}
                    </span>
                    {matchPct}% Match
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer — nav + actions */}
        <div className="flex items-center justify-between px-[22px] py-3.5 border-t border-outline-variant/30 bg-surface-container-lowest">
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              icon="arrow_back"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex(currentIndex - 1)}
            >
              Previous
            </Button>
            <span className="font-label text-xs text-outline tabular-nums mx-1.5">
              {photoUrls.length > 0
                ? `${currentIndex + 1} of ${photoUrls.length}`
                : "No photos"}
            </span>
            <Button
              variant="ghost"
              icon="arrow_forward"
              disabled={currentIndex >= photoUrls.length - 1}
              onClick={() => setCurrentIndex(currentIndex + 1)}
            >
              Next
            </Button>
          </div>
          <div className="flex items-center gap-2.5">
            {onFlag && (
              <button
                onClick={onFlag}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-error/25 text-xs font-semibold text-error hover:bg-error/5 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">flag</span>
                Flag Issue
              </button>
            )}
            {showValidateButton && onValidate && (
              <button
                onClick={onValidate}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-xs font-bold uppercase tracking-wide bg-tertiary text-on-tertiary hover:brightness-110 transition-all cursor-pointer shadow-md shadow-tertiary/20"
              >
                <span
                  className="material-symbols-outlined text-sm"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  verified
                </span>
                Validate This Load
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
