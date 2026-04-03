import { useState, useEffect } from "react";
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
      <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface/30 block">
        {label}
      </span>
      <p className="text-sm text-on-surface font-label mt-0.5">
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

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentIndex > 0)
        setCurrentIndex(currentIndex - 1);
      if (e.key === "ArrowRight" && currentIndex < photoUrls.length - 1)
        setCurrentIndex(currentIndex + 1);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, currentIndex, photoUrls.length]);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-container rounded-xl w-[70vw] max-w-5xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-surface-container-high/60">
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined text-primary-container">
              description
            </span>
            <div>
              <span className="font-label font-bold text-on-surface">
                BOL #{bolNo || "--"}
              </span>
              <span className="text-xs text-on-surface/40 ml-4">
                Load {loadNo} &middot; {wellName}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface/40 hover:text-on-surface transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined">close</span>
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
          <div className="w-64 bg-surface-container-low p-5 space-y-4 overflow-y-auto">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-on-surface/30">
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
        <div className="flex items-center justify-between px-6 py-3 bg-surface-container-high/60">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              icon="arrow_back"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex(currentIndex - 1)}
            >
              Previous
            </Button>
            <span className="font-label text-xs text-on-surface/40">
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
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-tertiary/10 text-tertiary hover:bg-tertiary/20 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">
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
