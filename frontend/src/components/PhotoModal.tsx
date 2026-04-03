import { useState, useEffect, useRef } from "react";
import { Button } from "./Button";

interface PhotoModalProps {
  photoUrls: string[];
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

function InfoField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="text-[9px] font-label font-medium uppercase tracking-[0.15em] text-on-surface/30 block leading-tight">
        {label}
      </span>
      <p className="text-[13px] text-on-surface font-label font-semibold mt-0.5 tabular-nums">
        {value || <span className="text-on-surface/20">--</span>}
      </p>
    </div>
  );
}

export function PhotoModal({
  photoUrls,
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

  const matchPct = autoMapScore ? Math.round(Number(autoMapScore) * 100) : null;
  const matchColor =
    matchPct && matchPct >= 90
      ? "text-tertiary bg-tertiary/10"
      : matchPct && matchPct >= 70
        ? "text-primary-container bg-primary-container/10"
        : "text-error bg-error/10";

  const fullUrl = (url: string) =>
    url.startsWith("/") ? `${import.meta.env.VITE_API_URL || ""}${url}` : url;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/70 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="bg-surface-container rounded-2xl w-[72vw] max-w-5xl max-h-[85vh] overflow-hidden shadow-[0_25px_60px_-12px_rgba(0,0,0,0.25)] flex flex-col ring-1 ring-on-surface/5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-surface-container-high/40">
          <div className="flex items-center gap-4">
            <div className="bg-primary-container/10 p-2 rounded-lg">
              <span className="material-symbols-outlined text-primary-container text-lg">
                description
              </span>
            </div>
            <div>
              <span
                id="photo-modal-title"
                className="font-label font-bold text-on-surface text-base tabular-nums"
              >
                BOL #{bolNo || "--"}
              </span>
              <span className="text-xs text-on-surface/35 ml-3 font-label tabular-nums">
                Load {loadNo} &middot; {wellName}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close photo viewer"
            className="text-on-surface/30 hover:text-on-surface hover:bg-surface-container-high p-2 rounded-lg transition-all duration-150 cursor-pointer active:scale-95 hover:rotate-90"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Photo */}
          <div className="flex-1 bg-surface-container-lowest flex items-center justify-center p-4">
            {photoUrls.length > 0 ? (
              <img
                src={fullUrl(photoUrls[currentIndex])}
                alt={`Photo ${currentIndex + 1}`}
                className="max-w-full max-h-[60vh] object-contain rounded-lg"
              />
            ) : (
              <div className="text-center text-on-surface/20">
                <span className="material-symbols-outlined text-6xl block mb-2">
                  receipt_long
                </span>
                <p className="font-label text-sm">No photos available</p>
              </div>
            )}
          </div>

          {/* Info panel */}
          <div className="w-72 bg-surface-container-low/80 p-5 space-y-4 overflow-y-auto">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface/30">
              Load Details
            </h4>
            <div className="space-y-3">
              <InfoField label="Driver" value={driverName} />
              <InfoField label="Truck #" value={truckNo} />
              <InfoField label="Carrier" value={carrierName} />
              <InfoField label="Weight (tons)" value={weightTons} />
              <InfoField label="BOL #" value={bolNo} />
              <InfoField label="Ticket #" value={ticketNo} />
              {matchPct !== null && (
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface/30 block">
                    Match
                  </span>
                  <span
                    className={`font-label text-xs font-bold px-2 py-0.5 rounded inline-block mt-0.5 ${matchColor}`}
                  >
                    {matchPct}% Match
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-surface-container-high/40">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              icon="arrow_back"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex(currentIndex - 1)}
            >
              Previous
            </Button>
            <span className="font-label text-xs text-on-surface/40 tabular-nums">
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
          <div className="flex items-center gap-3">
            {onFlag && (
              <button
                onClick={onFlag}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-error/10 text-error hover:bg-error/20 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">flag</span>
                Flag Issue
              </button>
            )}
            {showValidateButton && onValidate && (
              <button
                onClick={onValidate}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide bg-tertiary text-on-tertiary hover:brightness-110 transition-all duration-150 cursor-pointer shadow-md shadow-tertiary/20 hover:shadow-lg hover:shadow-tertiary/30 active:scale-[0.97]"
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
