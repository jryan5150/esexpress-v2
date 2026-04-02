import { useState } from "react";
import { Button } from "./Button";

interface DispatchCardProps {
  loadNo: string;
  pcsNumber: number | null;
  driverName: string | null;
  truckNo: string | null;
  carrierName: string | null;
  productDescription: string | null;
  weightTons: string | null;
  bolNo: string | null;
  ticketNo: string | null;
  wellName: string;
  photoStatus: string | null;
  canEnter: boolean;
  entered: boolean;
  onMarkEntered: () => void;
  isPending?: boolean;
  loadId: number;
  deliveredOn?: string | null;
  photoUrls?: string[];
}

function formatDeliveryTime(d: string | null | undefined): string {
  if (!d) return "--";
  try {
    const date = new Date(d);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

function Field({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);
  const display = value || "--";

  const handleCopy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div
      className="flex items-center justify-between py-1.5 px-2 hover:bg-surface-container-high/30 rounded transition-colors group cursor-pointer"
      onClick={handleCopy}
    >
      <div className="min-w-0">
        <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface/30 block">
          {label}
        </span>
        <span
          className={`font-label text-sm block truncate ${value ? "text-on-surface" : "text-on-surface/20"}`}
        >
          {display}
        </span>
      </div>
      {value && (
        <span
          className={`text-[9px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity ${copied ? "text-tertiary" : "text-on-surface/30"}`}
        >
          {copied ? "Copied" : "Copy"}
        </span>
      )}
    </div>
  );
}

export function DispatchCard({
  loadNo,
  pcsNumber,
  driverName,
  truckNo,
  carrierName,
  productDescription,
  weightTons,
  bolNo,
  ticketNo,
  wellName,
  photoStatus,
  canEnter,
  entered,
  onMarkEntered,
  isPending,
  loadId,
  deliveredOn,
  photoUrls,
}: DispatchCardProps) {
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const hasPhotos = photoUrls && photoUrls.length > 0;

  const photoIcon =
    photoStatus === "attached" || photoStatus === "pending"
      ? "check_circle"
      : "cancel";
  const photoColor =
    photoStatus === "attached" || photoStatus === "pending"
      ? "text-tertiary"
      : "text-error";

  return (
    <>
      <div
        className={`bg-surface-container-lowest rounded-xl overflow-hidden border border-on-surface/5 transition-all ${entered ? "opacity-40" : ""}`}
      >
        {/* Header with delivery time */}
        <div className="flex items-center justify-between px-5 py-3 bg-surface-container-high/30 border-b border-on-surface/5">
          <div className="flex items-center gap-4">
            <span className="font-label text-lg font-bold text-primary-container">
              {loadNo}
            </span>
            {pcsNumber && (
              <>
                <span className="text-on-surface/15">|</span>
                <span className="font-label text-sm text-on-surface/50">
                  PCS #{pcsNumber}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            {/* Delivery time — prominent */}
            <div className="text-right">
              <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface/30 block">
                Delivered
              </span>
              <span className="font-label text-sm font-medium text-on-surface">
                {formatDeliveryTime(deliveredOn)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`material-symbols-outlined text-base ${photoColor}`}
              >
                {photoIcon}
              </span>
              <span className="font-label text-[10px] text-on-surface/40 uppercase">
                {photoStatus || "missing"}
              </span>
            </div>
            {entered && (
              <span className="font-label text-[10px] bg-tertiary/10 text-tertiary px-2 py-0.5 rounded-full font-bold uppercase">
                Entered
              </span>
            )}
          </div>
        </div>

        {/* Body — two columns: fields left, photos right */}
        <div className="flex">
          {/* Left: load fields */}
          <div className="flex-1 p-4 space-y-0.5">
            <Field label="Driver" value={driverName} />
            <Field label="Carrier" value={carrierName} />
            <Field label="Truck #" value={truckNo} />
            <Field label="Well" value={wellName} />
            <Field label="Product" value={productDescription} />
            <Field label="Weight (tons)" value={weightTons} />
            <Field label="BOL #" value={bolNo} />
            <Field label="Ticket #" value={ticketNo} />
          </div>

          {/* Right: photos / attachments */}
          <div className="w-48 border-l border-on-surface/5 p-3 flex flex-col gap-2">
            {hasPhotos ? (
              <>
                <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface/30 px-1">
                  Weight Tickets ({photoUrls.length})
                </span>
                {photoUrls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setPhotoModal(url)}
                    className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-surface-container-high border border-on-surface/10 hover:ring-2 hover:ring-primary-container transition-all cursor-pointer"
                  >
                    <img
                      src={url}
                      alt={`Ticket ${i + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const el = e.target as HTMLImageElement;
                        el.style.display = "none";
                        el.parentElement!.innerHTML =
                          '<div class="w-full h-full flex items-center justify-center text-on-surface/20"><span class="material-symbols-outlined">broken_image</span></div>';
                      }}
                    />
                  </button>
                ))}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
                <span className="material-symbols-outlined text-2xl text-on-surface/10">
                  no_photography
                </span>
                <span className="text-[10px] text-on-surface/20 font-label uppercase">
                  No photos
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 bg-surface-container-high/20 border-t border-on-surface/5">
          <Button
            variant={entered ? "ghost" : "primary"}
            icon={entered ? "check" : "done_all"}
            disabled={!canEnter || entered || isPending}
            onClick={onMarkEntered}
          >
            {entered ? "Entered" : isPending ? "Marking..." : "Mark Entered"}
          </Button>
        </div>
      </div>

      {/* Photo Modal */}
      {photoModal && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8"
          onClick={() => setPhotoModal(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setPhotoModal(null)}
              className="absolute -top-10 right-0 text-white/60 hover:text-white cursor-pointer"
            >
              <span className="material-symbols-outlined text-2xl">close</span>
            </button>
            <img
              src={photoModal}
              alt="Weight ticket"
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </>
  );
}
