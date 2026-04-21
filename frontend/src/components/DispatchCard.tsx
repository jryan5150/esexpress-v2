import { useState, memo } from "react";
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
  pickupTime?: string | null;
  arrivalTime?: string | null;
  grossWeightLbs?: number | null;
  netWeightLbs?: number | null;
  terminalName?: string | null;
  netWeightTons?: string | null;
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
      className="flex items-center justify-between py-1 px-2 hover:bg-surface-container-high/30 rounded transition-colors group cursor-pointer"
      onClick={handleCopy}
    >
      <div className="min-w-0">
        <span className="text-[9px] font-label font-medium uppercase tracking-[0.15em] text-on-surface-variant block leading-tight">
          {label}
        </span>
        <span
          className={`font-label text-[13px] font-semibold block truncate tabular-nums ${value ? "text-on-surface" : "text-on-surface/15"}`}
        >
          {display}
        </span>
      </div>
      {value && (
        <span
          className={`text-[9px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity ${copied ? "text-tertiary" : "text-on-surface-variant"}`}
        >
          {copied ? "Copied" : "Copy"}
        </span>
      )}
    </div>
  );
}

export const DispatchCard = memo(function DispatchCard({
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
  pickupTime,
  arrivalTime,
  grossWeightLbs,
  netWeightLbs,
  terminalName,
  netWeightTons,
}: DispatchCardProps) {
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
        className={`bg-surface-container-lowest rounded-xl overflow-hidden ring-1 ring-on-surface/5 transition-all hover-lift ${entered ? "opacity-40" : ""}`}
      >
        {/* Header — load ID + timeline + photo status */}
        <div className="px-5 py-2.5 bg-surface-container-high/20 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-headline text-base font-bold text-on-surface tracking-tight">
                {wellName}
              </span>
              <span className="text-on-surface/10">--</span>
              <span className="font-label text-base font-bold text-primary-container tracking-tight">
                {loadNo}
              </span>
              {pcsNumber && (
                <>
                  <span className="text-on-surface/10 font-light">|</span>
                  <span className="font-label text-xs text-on-surface/35">
                    PCS #{pcsNumber}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-surface-container-high/50 px-2.5 py-1 rounded-md">
                <span
                  className={`material-symbols-outlined text-sm ${photoColor}`}
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {photoIcon}
                </span>
                <span className="font-label text-[10px] font-medium text-on-surface-variant uppercase tracking-[0.1em]">
                  {photoStatus || "missing"}
                </span>
              </div>
              {entered && (
                <span className="font-label text-[10px] bg-tertiary/10 text-tertiary px-2.5 py-1 rounded-md font-bold uppercase tracking-wide">
                  Entered
                </span>
              )}
            </div>
          </div>
          {/* Timeline row */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-on-surface/25">
                local_shipping
              </span>
              <span className="text-[9px] font-label font-medium uppercase tracking-[0.1em] text-on-surface/25">
                Pickup
              </span>
              <span className="font-label text-[11px] text-on-surface/60 tabular-nums">
                {formatDeliveryTime(pickupTime)}
              </span>
            </div>
            <span className="material-symbols-outlined text-on-surface/10 text-[10px]">
              east
            </span>
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-on-surface/25">
                pin_drop
              </span>
              <span className="text-[9px] font-label font-medium uppercase tracking-[0.1em] text-on-surface/25">
                Arrived
              </span>
              <span className="font-label text-[11px] text-on-surface/60 tabular-nums">
                {formatDeliveryTime(arrivalTime)}
              </span>
            </div>
            <span className="material-symbols-outlined text-on-surface/10 text-[10px]">
              east
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className="material-symbols-outlined text-sm text-tertiary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                check_circle
              </span>
              <span className="text-[9px] font-label font-medium uppercase tracking-[0.1em] text-on-surface/25">
                Delivered
              </span>
              <span className="font-label text-[11px] font-bold text-on-surface tabular-nums">
                {formatDeliveryTime(deliveredOn)}
              </span>
            </div>
          </div>
        </div>

        {/* Body — two columns: fields left, photos right */}
        <div className="flex">
          {/* Left: load fields */}
          <div className="flex-1 px-4 py-2.5 space-y-0">
            <Field label="BOL #" value={bolNo} />
            <Field label="Ticket #" value={ticketNo} />
            <Field label="Driver" value={driverName} />
            <Field label="Carrier" value={carrierName} />
            <Field label="Truck #" value={truckNo} />
            <Field label="Product" value={productDescription} />
            <Field label="Weight (tons)" value={weightTons} />
          </div>

          {/* Right: ticket info / weight / attachments */}
          <div className="w-52 bg-surface-container-low/30 p-2.5 flex flex-col gap-2">
            {/* Weight summary */}
            <div className="bg-surface-container-high/50 rounded-lg p-3 space-y-2">
              <span className="text-[9px] font-label font-medium uppercase tracking-[0.15em] text-on-surface-variant">
                Weight
              </span>
              <div className="font-label text-lg font-bold text-on-surface tabular-nums">
                {weightTons
                  ? `${parseFloat(weightTons).toFixed(2)} tons`
                  : "--"}
              </div>
              {(grossWeightLbs || netWeightLbs) && (
                <div className="text-[10px] font-label text-on-surface-variant space-y-0.5 tabular-nums">
                  {grossWeightLbs && (
                    <div>
                      Gross: {Number(grossWeightLbs).toLocaleString()} lbs
                    </div>
                  )}
                  {netWeightLbs && (
                    <div>Net: {Number(netWeightLbs).toLocaleString()} lbs</div>
                  )}
                </div>
              )}
            </div>

            {/* Terminal / Origin */}
            {terminalName && (
              <div className="px-1">
                <span className="text-[9px] font-label font-medium uppercase tracking-[0.15em] text-on-surface-variant block">
                  Origin
                </span>
                <span className="text-xs text-on-surface/70 font-label">
                  {terminalName}
                </span>
              </div>
            )}

            {/* Photo / ticket */}
            {hasPhotos ? (
              <div className="space-y-2">
                <span className="text-[9px] font-label font-medium uppercase tracking-[0.15em] text-on-surface-variant px-1">
                  Weight Ticket
                </span>
                {photoUrls.map((url, i) => {
                  const fullUrl = url.startsWith("/")
                    ? `${import.meta.env.VITE_API_URL || ""}${url}`
                    : url;
                  return (
                    <a
                      key={i}
                      href={fullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full aspect-[3/4] rounded-lg overflow-hidden bg-surface-container-high ring-1 ring-on-surface/8 hover:ring-2 hover:ring-tertiary transition-all"
                    >
                      <img
                        src={fullUrl}
                        alt={`Ticket ${i + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-4">
                <span className="material-symbols-outlined text-2xl text-on-surface/10">
                  no_photography
                </span>
                <span className="text-[10px] text-on-surface-variant font-label uppercase">
                  No ticket
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-2 bg-surface-container-high/10">
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
    </>
  );
});
