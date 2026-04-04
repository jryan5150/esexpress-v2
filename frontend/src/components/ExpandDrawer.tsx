import { useState, useRef, useEffect } from "react";
import { useUpdateLoad } from "../hooks/use-wells";
import { useToast } from "./Toast";

interface ExpandDrawerProps {
  loadId: number;
  loadNo: string;
  wellName: string;
  driverName: string | null;
  truckNo: string | null;
  carrierName: string | null;
  productDescription: string | null;
  weightTons: string | null;
  netWeightTons: string | null;
  bolNo: string | null;
  ticketNo: string | null;
  deliveredOn: string | null;
  photoUrls: string[];
  autoMapScore: string | null;
  autoMapTier: number | null;
  assignmentStatus: string;
  pickupTime?: string | null;
  arrivalTime?: string | null;
  grossWeightLbs?: number | null;
  netWeightLbs?: number | null;
  terminalName?: string | null;
  onValidate?: () => void;
  onClose: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL || "";
const resolveUrl = (url: string) =>
  url.startsWith("/") ? `${API_BASE}${url}` : url;

function formatTime(d: string | null | undefined): string {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

/** Inline editable field — click value to edit, blur/Enter to save */
function EditField({
  label,
  value,
  fieldKey,
  onSave,
  mono = false,
}: {
  label: string;
  value: string | null;
  fieldKey: string;
  onSave: (key: string, val: string) => void;
  mono?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const commit = () => {
    if (draft !== (value || "")) onSave(fieldKey, draft);
    setEditing(false);
  };

  return (
    <div className="space-y-0.5">
      <span className="text-[9px] font-semibold text-outline tracking-[0.08em] uppercase">
        {label}
      </span>
      {editing ? (
        <input
          ref={ref}
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
          className={`block w-full bg-background border border-primary/30 rounded px-2 py-1 text-[13px] text-on-surface font-medium focus:outline-none focus:ring-1 focus:ring-primary/30 ${mono ? "font-label tabular-nums" : ""}`}
        />
      ) : (
        <button
          onClick={() => {
            setDraft(value || "");
            setEditing(true);
          }}
          className={`block text-[13px] font-medium text-on-surface hover:text-primary cursor-pointer transition-colors ${mono ? "font-label tabular-nums" : ""}`}
          title="Click to edit"
        >
          {value || <span className="text-outline/40">--</span>}
        </button>
      )}
    </div>
  );
}

export function ExpandDrawer({
  loadId,
  loadNo,
  wellName,
  driverName,
  truckNo,
  carrierName,
  productDescription,
  weightTons,
  netWeightTons,
  bolNo,
  ticketNo,
  deliveredOn,
  photoUrls,
  autoMapScore,
  autoMapTier,
  assignmentStatus,
  pickupTime,
  arrivalTime,
  grossWeightLbs,
  netWeightLbs,
  terminalName,
  onValidate,
  onClose,
}: ExpandDrawerProps) {
  const updateLoad = useUpdateLoad();
  const { toast } = useToast();
  const [photoIdx, setPhotoIdx] = useState(0);

  const handleSave = (fieldKey: string, value: string) => {
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

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/40 border-t-0 rounded-b-[10px] -mt-1 shadow-sm overflow-hidden animate-slide-down">
      <div
        className="grid gap-0"
        style={{ gridTemplateColumns: "200px 1fr 280px" }}
      >
        {/* Photo Panel */}
        <div className="bg-background border-r border-outline-variant/30 p-4 flex flex-col items-center gap-2">
          {photoUrls.length > 0 ? (
            <>
              <img
                src={resolveUrl(photoUrls[photoIdx])}
                alt={`Ticket ${photoIdx + 1}`}
                className="w-full h-36 object-cover rounded-lg border border-outline-variant/30"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPhotoIdx(Math.max(0, photoIdx - 1))}
                  disabled={photoIdx === 0}
                  className="text-outline hover:text-on-surface disabled:opacity-30 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">
                    chevron_left
                  </span>
                </button>
                <span className="font-label text-[10px] text-outline tabular-nums">
                  {photoIdx + 1}/{photoUrls.length}
                </span>
                <button
                  onClick={() =>
                    setPhotoIdx(Math.min(photoUrls.length - 1, photoIdx + 1))
                  }
                  disabled={photoIdx >= photoUrls.length - 1}
                  className="text-outline hover:text-on-surface disabled:opacity-30 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">
                    chevron_right
                  </span>
                </button>
              </div>
            </>
          ) : (
            <div className="w-full h-36 bg-surface-container-high/50 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <span className="material-symbols-outlined text-3xl text-outline/30">
                  no_photography
                </span>
                <p className="text-[10px] text-outline/50 mt-1">No photos</p>
              </div>
            </div>
          )}

          {/* Match score */}
          {matchPct !== null && (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                matchPct >= 90
                  ? "bg-[#d1fae5] text-[#065f46]"
                  : matchPct >= 70
                    ? "bg-[#ede9f8] text-primary"
                    : "bg-[#fee2e2] text-[#991b1b]"
              }`}
            >
              <span className="material-symbols-outlined text-xs">
                {matchPct >= 90 ? "verified" : "help"}
              </span>
              {matchPct}% match
            </span>
          )}
          {autoMapTier && (
            <span className="text-[9px] font-semibold text-outline/60 uppercase tracking-wider">
              Tier {autoMapTier}
            </span>
          )}
        </div>

        {/* Editable Fields */}
        <div className="p-4 grid grid-cols-3 gap-x-6 gap-y-3 content-start">
          <EditField
            label="Driver"
            value={driverName}
            fieldKey="driverName"
            onSave={handleSave}
          />
          <EditField
            label="Truck #"
            value={truckNo}
            fieldKey="truckNo"
            onSave={handleSave}
            mono
          />
          <EditField
            label="Carrier"
            value={carrierName}
            fieldKey="carrierName"
            onSave={handleSave}
          />
          <EditField
            label="Weight (tons)"
            value={weightTons}
            fieldKey="weightTons"
            onSave={handleSave}
            mono
          />
          <EditField
            label="Net Weight"
            value={netWeightTons}
            fieldKey="netWeightTons"
            onSave={handleSave}
            mono
          />
          <EditField
            label="Product"
            value={productDescription}
            fieldKey="productDescription"
            onSave={handleSave}
          />
          <EditField
            label="BOL #"
            value={bolNo}
            fieldKey="bolNo"
            onSave={handleSave}
            mono
          />
          <EditField
            label="Ticket #"
            value={ticketNo}
            fieldKey="ticketNo"
            onSave={handleSave}
            mono
          />
          <div className="space-y-0.5">
            <span className="text-[9px] font-semibold text-outline tracking-[0.08em] uppercase">
              Delivered
            </span>
            <p className="text-[13px] font-medium text-on-surface font-label tabular-nums">
              {formatTime(deliveredOn)}
            </p>
          </div>
        </div>

        {/* Right Panel: Timeline + Actions */}
        <div className="border-l border-outline-variant/30 p-4 flex flex-col gap-3">
          {/* Timeline */}
          <div className="space-y-2">
            <span className="text-[9px] font-semibold text-outline tracking-[0.08em] uppercase">
              Timeline
            </span>
            <div className="space-y-1.5 text-xs">
              {[
                { label: "Pickup", time: pickupTime, icon: "local_shipping" },
                { label: "Arrival", time: arrivalTime, icon: "pin_drop" },
                { label: "Delivered", time: deliveredOn, icon: "check_circle" },
              ].map((step) => (
                <div key={step.label} className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-outline/60">
                    {step.icon}
                  </span>
                  <span className="text-outline w-14">{step.label}</span>
                  <span className="font-label text-on-surface-variant tabular-nums">
                    {formatTime(step.time as string | null)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Weight Detail */}
          {(grossWeightLbs || netWeightLbs) && (
            <div className="bg-surface-container-high/40 rounded-md p-2.5 space-y-1">
              <span className="text-[9px] font-semibold text-outline tracking-[0.08em] uppercase">
                Weight Detail
              </span>
              {grossWeightLbs && (
                <div className="flex justify-between text-xs">
                  <span className="text-outline">Gross</span>
                  <span className="font-label text-on-surface tabular-nums">
                    {Number(grossWeightLbs).toLocaleString()} lbs
                  </span>
                </div>
              )}
              {netWeightLbs && (
                <div className="flex justify-between text-xs">
                  <span className="text-outline">Net</span>
                  <span className="font-label text-on-surface tabular-nums">
                    {Number(netWeightLbs).toLocaleString()} lbs
                  </span>
                </div>
              )}
              {terminalName && (
                <div className="flex justify-between text-xs">
                  <span className="text-outline">Terminal</span>
                  <span className="text-on-surface-variant truncate max-w-[140px]">
                    {terminalName}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-auto flex flex-col gap-1.5">
            {onValidate &&
              assignmentStatus !== "dispatched" &&
              assignmentStatus !== "delivered" && (
                <button
                  onClick={onValidate}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wide bg-tertiary text-on-tertiary hover:brightness-110 transition-all cursor-pointer"
                >
                  <span
                    className="material-symbols-outlined text-sm"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    verified
                  </span>
                  Validate
                </button>
              )}
            <button
              onClick={onClose}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              Collapse
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
