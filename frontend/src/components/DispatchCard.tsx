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
}

function CopyField({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string | null;
  onEdit?: (newValue: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || "");

  const handleCopy = async () => {
    const toCopy = editValue || value;
    if (!toCopy) return;
    await navigator.clipboard.writeText(toCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = () => {
    setEditing(false);
    if (onEdit && editValue !== (value || "")) {
      onEdit(editValue);
    }
  };

  const displayValue = editValue || value || "\u2014";

  return (
    <div className="flex items-center justify-between py-2 px-3 hover:bg-surface-container-high/30 rounded transition-colors group">
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface/40 block">
          {label}
        </span>
        {editing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") {
                setEditValue(value || "");
                setEditing(false);
              }
            }}
            autoFocus
            className="w-full bg-surface-container-high border border-primary-container/40 rounded px-2 py-1 font-label text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary-container/50"
          />
        ) : (
          <span
            className={`font-label text-sm font-medium block truncate cursor-text ${value || editValue !== (value || "") ? "text-on-surface" : "text-on-surface/20"} ${editValue !== (value || "") ? "text-primary-container" : ""}`}
            onClick={() => {
              setEditValue(value || "");
              setEditing(true);
            }}
            title="Click to edit"
          >
            {editValue !== (value || "") ? editValue : displayValue}
            {editValue !== (value || "") && (
              <span className="text-[9px] text-primary-container/60 ml-1">
                (edited)
              </span>
            )}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!editing && (
          <button
            onClick={() => {
              setEditValue(value || "");
              setEditing(true);
            }}
            className="px-1.5 py-1 text-on-surface/20 hover:text-on-surface/60 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
            title="Edit"
          >
            <span className="material-symbols-outlined text-sm">edit</span>
          </button>
        )}
        {(value || editValue) && !editing && (
          <button
            onClick={handleCopy}
            className="ml-1 px-2.5 py-1 text-[10px] font-headline font-bold uppercase tracking-wider rounded border transition-all cursor-pointer opacity-0 group-hover:opacity-100"
            style={{
              backgroundColor: copied ? "var(--color-tertiary)" : "transparent",
              borderColor: copied
                ? "var(--color-tertiary)"
                : "var(--color-outline-variant)",
              color: copied
                ? "var(--color-on-tertiary)"
                : "var(--color-on-surface)",
            }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="pb-2 mb-1 border-b border-on-surface/5">
      <span className="text-[9px] font-headline font-black uppercase tracking-[0.2em] text-on-surface/25 px-3">
        {children}
      </span>
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
}: DispatchCardProps) {
  const [photoLoading, setPhotoLoading] = useState(false);

  const handleViewPhoto = async () => {
    if (photoStatus !== "attached") return;
    setPhotoLoading(true);
    try {
      const token = localStorage.getItem("esexpress-token");
      const apiBase = (import.meta.env.VITE_API_URL || "") + "/api/v1";
      // Fetch photo metadata for this load
      const metaRes = await fetch(
        `${apiBase}/verification/photos/load/${loadId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const metaJson = await metaRes.json();
      const photos = Array.isArray(metaJson.data) ? metaJson.data : [];
      if (photos.length === 0) {
        setPhotoLoading(false);
        return;
      }
      // Fetch the actual photo via backend proxy
      const sourceUrl = photos[0].sourceUrl;
      const proxyRes = await fetch(
        `${apiBase}/verification/photos/proxy?url=${encodeURIComponent(sourceUrl)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!proxyRes.ok) throw new Error("Photo proxy failed");
      const blob = await proxyRes.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
    } catch {
      // Photo unavailable — silent fail, badge already shows status
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleCopyAll = async () => {
    const fields = [
      `Load #: ${loadNo}`,
      `Driver: ${driverName || "\u2014"}`,
      `Truck #: ${truckNo || "\u2014"}`,
      `Carrier: ${carrierName || "\u2014"}`,
      `Consignee: ${wellName}`,
      `Product: ${productDescription || "\u2014"}`,
      `Weight: ${weightTons ? weightTons + " tons" : "\u2014"}`,
      `BOL #: ${bolNo || "\u2014"}`,
      `Ticket #: ${ticketNo || "\u2014"}`,
    ];
    await navigator.clipboard.writeText(fields.join("\n"));
  };

  const photoIcon =
    photoStatus === "attached"
      ? "check_circle"
      : photoStatus === "pending"
        ? "hourglass_top"
        : "cancel";
  const photoColor =
    photoStatus === "attached"
      ? "text-tertiary"
      : photoStatus === "pending"
        ? "text-primary-container"
        : "text-error";

  return (
    <div
      className={`bg-surface-container-lowest rounded-xl overflow-hidden border border-on-surface/5 transition-all ${entered ? "opacity-40" : ""}`}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-surface-container-high/30 border-b border-on-surface/5">
        <div className="flex items-center gap-4">
          <span className="font-label text-lg font-bold text-primary">
            {loadNo}
          </span>
          <span className="text-on-surface/20">&mdash;</span>
          {pcsNumber && (
            <span className="font-label text-sm font-bold text-on-surface/60">
              PCS #{pcsNumber}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined text-lg ${photoColor}`}>
            {photoIcon}
          </span>
          <span className="font-label text-[10px] text-on-surface/40 uppercase">
            {photoStatus || "missing"}
          </span>
          {entered && (
            <span className="font-label text-[10px] bg-tertiary/10 text-tertiary px-2 py-0.5 rounded-full font-bold uppercase">
              Entered
            </span>
          )}
        </div>
      </div>

      {/* Field Sections */}
      <div className="p-4 space-y-1">
        <SectionLabel>Carrier & Driver</SectionLabel>
        <CopyField label="Carrier" value={carrierName} />
        <CopyField label="Driver" value={driverName} />
        <CopyField label="Truck #" value={truckNo} />

        <div className="mt-3">
          <SectionLabel>Locations</SectionLabel>
        </div>
        <CopyField label="Consignee (Well)" value={wellName} />

        <div className="mt-3">
          <SectionLabel>Reference</SectionLabel>
        </div>
        <CopyField label="BOL / Cust Ref" value={bolNo} />
        <CopyField label="Ticket #" value={ticketNo} />

        <div className="mt-3">
          <SectionLabel>Commodity</SectionLabel>
        </div>
        <CopyField label="Product" value={productDescription} />
        <CopyField label="Weight (tons)" value={weightTons} />
      </div>

      {/* Card Footer */}
      <div className="flex items-center justify-between px-5 py-4 bg-surface-container-high/20 border-t border-on-surface/5">
        <div className="flex items-center gap-2">
          {photoStatus === "attached" && (
            <Button
              variant="ghost"
              icon="photo_camera"
              onClick={handleViewPhoto}
              disabled={photoLoading}
            >
              {photoLoading ? "Loading..." : "View Ticket"}
            </Button>
          )}
          <Button variant="ghost" icon="content_copy" onClick={handleCopyAll}>
            Copy All
          </Button>
        </div>
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
  );
}
