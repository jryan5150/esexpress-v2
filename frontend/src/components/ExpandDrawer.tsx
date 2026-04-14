import { useState, useRef, useEffect } from "react";
import { useUpdateLoad, useDuplicateLoad } from "../hooks/use-wells";
import { useToast } from "./Toast";

/**
 * Free-form notes editor for an assignment (O-05). Saves on blur / Cmd+Enter.
 * Falls back to read-only display when no onSave handler is provided so older
 * call sites (validation page, etc.) still render without changes.
 */
function DispatcherNotesField({
  initial,
  onSave,
  isSaving,
  readOnlyFallback,
}: {
  initial: string;
  onSave?: (notes: string) => Promise<void> | void;
  isSaving?: boolean;
  readOnlyFallback?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [dirty, setDirty] = useState(false);
  // Reset when the row changes underneath us
  useEffect(() => {
    setValue(initial);
    setDirty(false);
  }, [initial]);

  if (!onSave) {
    if (!readOnlyFallback) return null;
    return (
      <div className="bg-surface-container-high/40 rounded-md p-2.5">
        <span className="text-[9px] font-semibold text-outline tracking-[0.08em] uppercase">
          Dispatcher Notes
        </span>
        <p className="text-xs text-on-surface-variant mt-1 whitespace-pre-wrap">
          {initial}
        </p>
      </div>
    );
  }

  const commit = async () => {
    if (!dirty) return;
    await onSave(value.trim());
    setDirty(false);
  };

  return (
    <div className="bg-surface-container-high/40 rounded-md p-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-semibold text-outline tracking-[0.08em] uppercase">
          Dispatcher Notes
        </span>
        {dirty && (
          <span className="text-[9px] font-bold text-primary uppercase tracking-wide">
            {isSaving ? "saving…" : "unsaved"}
          </span>
        )}
      </div>
      <textarea
        value={value}
        rows={2}
        placeholder="e.g. held for rate, Liberty asked us to recheck weight…"
        disabled={isSaving}
        onChange={(e) => {
          setValue(e.target.value);
          setDirty(e.target.value !== initial);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
        }}
        className="w-full text-xs text-on-surface-variant bg-background/60 border border-outline-variant/40 rounded px-2 py-1.5 focus:outline-none focus:border-primary/60 resize-y disabled:opacity-60"
        aria-label="Dispatcher notes"
      />
      <div className="text-[9px] text-outline mt-1">
        Saves on blur or ⌘/Ctrl+Enter
      </div>
    </div>
  );
}

/** Shape of the match_audit jsonb written by the auto-mapper. */
interface MatchAudit {
  suggestion: {
    wellId: number;
    wellName: string;
    matchType: string;
    score: number;
  };
  alternatives: Array<{
    wellId: number;
    wellName: string;
    matchType: string;
    score: number;
  }>;
  evidence: {
    exactNameMatch: boolean;
    exactAliasMatch: boolean;
    propxJobIdMatch: boolean;
    fuzzyMatch: boolean;
    confirmedMapping: boolean;
    crossSourceBoost: boolean;
    aboveConfidenceFloor: boolean;
  };
  tierBeforeRules: 1 | 2 | 3;
  tierAfterRules: 1 | 2 | 3;
  rulesApplied: string[];
  reason: string;
}

interface ExpandDrawerProps {
  loadId: number;
  loadNo: string;
  wellName: string;
  driverName: string | null;
  truckNo: string | null;
  trailerNo: string | null;
  carrierName: string | null;
  productDescription: string | null;
  weightTons: string | null;
  netWeightTons: string | null;
  bolNo: string | null;
  ticketNo: string | null;
  rate: string | null;
  mileage: string | null;
  deliveredOn: string | null;
  photoUrls: string[];
  autoMapScore: string | null;
  autoMapTier: number | null;
  assignmentStatus: string;
  matchAudit?: MatchAudit | null;
  pickupTime?: string | null;
  arrivalTime?: string | null;
  transitTime?: string | null;
  assignedTime?: string | null;
  acceptedTime?: string | null;
  grossWeightLbs?: number | null;
  netWeightLbs?: number | null;
  tareWeightLbs?: number | null;
  terminalName?: string | null;
  // Financial
  lineHaul?: string | number | null;
  fuelSurcharge?: string | number | null;
  totalCharge?: string | number | null;
  customerRate?: string | number | null;
  // Identity
  orderNo?: string | null;
  invoiceNo?: string | null;
  poNo?: string | null;
  referenceNo?: string | null;
  // Operations
  loaderName?: string | null;
  jobName?: string | null;
  loadStatus?: string | null;
  // Demurrage
  demurrageAtLoader?: string | number | null;
  demurrageAtLoaderHours?: string | number | null;
  demurrageAtLoaderMinutes?: string | number | null;
  demurrageAtDestination?: string | number | null;
  demurrageAtDestHours?: string | number | null;
  demurrageAtDestMinutes?: string | number | null;
  // Timeline gaps
  loadOutTime?: string | null;
  loadTotalTime?: string | number | null;
  unloadTotalTime?: string | number | null;
  appointmentTime?: string | null;
  // Additional identity
  settlementDate?: string | null;
  shipperBol?: string | null;
  dispatcherNotes?: string | null;
  // Editable assignment-level notes (added 2026-04-14, O-05).
  // Falls back to dispatcherNotes for read-only display when not provided.
  assignmentId?: number;
  notes?: string | null;
  onSaveNotes?: (notes: string) => Promise<void> | void;
  isSavingNotes?: boolean;
  // BOL verification
  jotformBolNo?: string | null;
  jotformDriverName?: string | null;
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

function CopyBtn({ text }: { text: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="text-outline/30 hover:text-primary cursor-pointer transition-colors"
      title="Copy"
      aria-label="Copy value"
    >
      <span className="material-symbols-outlined text-[11px]">
        {copied ? "check" : "content_copy"}
      </span>
    </button>
  );
}

/** Inline editable field — click value to edit, blur/Enter to save */
function EditField({
  label,
  value,
  fieldKey,
  onSave,
  mono = false,
  inputType = "text",
}: {
  label: string;
  value: string | null;
  fieldKey: string;
  onSave: (key: string, val: string) => void;
  mono?: boolean;
  inputType?: string;
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
      <div className="flex items-center gap-1">
        <span className="text-[9px] font-semibold text-outline tracking-[0.08em] uppercase">
          {label}
        </span>
        <CopyBtn text={value} />
      </div>
      {editing ? (
        <input
          ref={ref}
          type={inputType}
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
  trailerNo,
  carrierName,
  productDescription,
  weightTons,
  netWeightTons,
  bolNo,
  ticketNo,
  rate,
  mileage,
  deliveredOn,
  photoUrls,
  autoMapScore,
  autoMapTier,
  assignmentStatus,
  matchAudit,
  pickupTime,
  arrivalTime,
  transitTime,
  assignedTime,
  acceptedTime,
  grossWeightLbs,
  netWeightLbs,
  tareWeightLbs,
  lineHaul,
  fuelSurcharge,
  totalCharge,
  customerRate,
  orderNo,
  invoiceNo,
  poNo,
  referenceNo,
  loaderName,
  jobName,
  loadStatus,
  terminalName,
  demurrageAtLoader,
  demurrageAtLoaderHours,
  demurrageAtLoaderMinutes,
  demurrageAtDestination,
  demurrageAtDestHours,
  demurrageAtDestMinutes,
  loadOutTime,
  loadTotalTime,
  unloadTotalTime,
  appointmentTime,
  settlementDate,
  shipperBol,
  dispatcherNotes,
  notes: notesProp,
  onSaveNotes,
  isSavingNotes,
  jotformBolNo,
  jotformDriverName,
  onValidate,
  onClose,
}: ExpandDrawerProps) {
  const updateLoad = useUpdateLoad();
  const dupLoad = useDuplicateLoad();
  const { toast } = useToast();
  const [photoIdx, setPhotoIdx] = useState(0);
  const [dupCount, setDupCount] = useState(1);
  const [showDup, setShowDup] = useState(false);

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

  const handleCopyAll = () => {
    const lines = [
      `Load #: ${loadNo}`,
      driverName && `Driver: ${driverName}`,
      truckNo && `Truck: ${truckNo}`,
      carrierName && `Carrier: ${carrierName}`,
      bolNo && `BOL: ${bolNo}`,
      ticketNo && `Ticket: ${ticketNo}`,
      weightTons && `Weight: ${weightTons} tons`,
      rate && `Rate: $${rate}/ton`,
      mileage && `Mileage: ${mileage}`,
      deliveredOn && `Delivered: ${formatTime(deliveredOn)}`,
      orderNo && `Order #: ${orderNo}`,
      invoiceNo && `Invoice #: ${invoiceNo}`,
    ]
      .filter(Boolean)
      .join("\n");
    navigator.clipboard.writeText(lines);
    toast("Copied to clipboard", "success");
  };

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
                className="w-full h-48 object-cover rounded-lg border border-outline-variant/30 cursor-zoom-in hover:opacity-90 transition-opacity"
                onClick={() =>
                  window.open(resolveUrl(photoUrls[photoIdx]), "_blank")
                }
                title="Click to view full size"
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
            <span
              className="text-[9px] font-semibold text-outline/60 uppercase tracking-wider"
              title={matchAudit?.reason ?? undefined}
            >
              Tier {autoMapTier}
            </span>
          )}
        </div>

        {/* Match Audit — shows why this tier/match was chosen */}
        {matchAudit && (
          <div className="px-4 pb-2">
            <details className="text-xs">
              <summary className="cursor-pointer text-outline hover:text-on-surface transition-colors flex items-center gap-1.5 select-none">
                <span className="material-symbols-outlined text-sm">
                  {matchAudit.tierAfterRules === 1
                    ? "verified"
                    : matchAudit.tierAfterRules === 2
                      ? "help"
                      : "priority_high"}
                </span>
                <span className="font-medium">Match Reasoning</span>
                <span className="text-outline/60 font-normal">
                  — {matchAudit.reason}
                </span>
              </summary>
              <div className="mt-2 ml-5 space-y-2 text-on-surface-variant">
                <div>
                  <span className="text-outline/70 text-[11px] uppercase tracking-wide">
                    Matched
                  </span>
                  <div className="font-medium">
                    {matchAudit.suggestion.wellName}{" "}
                    <span className="text-outline/60 font-normal">
                      ({matchAudit.suggestion.matchType},{" "}
                      {matchAudit.suggestion.score.toFixed(2)})
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-outline/70 text-[11px] uppercase tracking-wide">
                    Evidence
                  </span>
                  <ul className="mt-0.5 space-y-0.5">
                    {matchAudit.evidence.confirmedMapping && (
                      <li className="text-primary">
                        ✓ Confirmed mapping (human-approved)
                      </li>
                    )}
                    {matchAudit.evidence.propxJobIdMatch && (
                      <li className="text-primary">✓ PropX job ID match</li>
                    )}
                    {matchAudit.evidence.exactNameMatch && (
                      <li className="text-primary">✓ Exact well name match</li>
                    )}
                    {matchAudit.evidence.exactAliasMatch && (
                      <li className="text-primary">✓ Exact alias match</li>
                    )}
                    {matchAudit.evidence.crossSourceBoost && (
                      <li className="text-primary">
                        ✓ Cross-source BOL corroboration
                      </li>
                    )}
                    {matchAudit.evidence.fuzzyMatch && (
                      <li className="text-outline">
                        ⚠ Fuzzy match (requires exact backing)
                      </li>
                    )}
                    {!matchAudit.evidence.aboveConfidenceFloor && (
                      <li className="text-outline">
                        ⚠ Score below 0.85 confidence floor
                      </li>
                    )}
                  </ul>
                </div>

                {matchAudit.rulesApplied.length > 0 && (
                  <div>
                    <span className="text-outline/70 text-[11px] uppercase tracking-wide">
                      Rules Applied (demotions)
                    </span>
                    <ul className="mt-0.5 space-y-0.5 text-outline">
                      {matchAudit.rulesApplied.map((r) => (
                        <li key={r} className="font-mono text-[11px]">
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {matchAudit.alternatives.length > 0 && (
                  <div>
                    <span className="text-outline/70 text-[11px] uppercase tracking-wide">
                      Alternatives Considered
                    </span>
                    <ul className="mt-0.5 space-y-0.5">
                      {matchAudit.alternatives.slice(0, 3).map((alt) => (
                        <li key={alt.wellId} className="text-outline">
                          {alt.wellName}{" "}
                          <span className="text-outline/60">
                            ({alt.matchType}, {alt.score.toFixed(2)})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          </div>
        )}

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
            label="Trailer #"
            value={trailerNo}
            fieldKey="trailerNo"
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
          <div className="space-y-0.5">
            <EditField
              label="BOL #"
              value={bolNo}
              fieldKey="bolNo"
              onSave={handleSave}
              mono
            />
            {jotformBolNo &&
              bolNo &&
              (() => {
                const loadLast4 = bolNo.replace(/\D/g, "").slice(-4);
                const jotLast4 = jotformBolNo.replace(/\D/g, "").slice(-4);
                const match = loadLast4 === jotLast4 && loadLast4.length >= 4;
                return (
                  <div
                    className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${match ? "bg-[#d1fae5] text-[#065f46]" : "bg-[#fee2e2] text-[#991b1b]"}`}
                  >
                    <span className="material-symbols-outlined text-[10px]">
                      {match ? "verified" : "warning"}
                    </span>
                    {match ? "BOL last-4 match" : `Photo BOL: ...${jotLast4}`}
                  </div>
                );
              })()}
          </div>
          <EditField
            label="Ticket #"
            value={ticketNo}
            fieldKey="ticketNo"
            onSave={handleSave}
            mono
          />
          <EditField
            label="Rate ($/ton)"
            value={rate}
            fieldKey="rate"
            onSave={handleSave}
            mono
          />
          <EditField
            label="Mileage"
            value={mileage}
            fieldKey="mileage"
            onSave={handleSave}
            mono
          />
          <EditField
            label="Delivered"
            value={
              deliveredOn
                ? new Date(deliveredOn).toISOString().slice(0, 10)
                : null
            }
            fieldKey="deliveredOn"
            onSave={handleSave}
            mono
            inputType="date"
          />
        </div>

        {/* Right Panel: Timeline + Actions */}
        <div className="border-l border-outline-variant/30 p-4 flex flex-col gap-3 max-h-[420px] overflow-y-auto">
          {/* Timeline */}
          <div className="space-y-2">
            <span className="text-[9px] font-semibold text-outline tracking-[0.08em] uppercase">
              Timeline
            </span>
            <div className="space-y-1.5 text-xs">
              {[
                { label: "Assigned", time: assignedTime, icon: "assignment" },
                { label: "Accepted", time: acceptedTime, icon: "thumb_up" },
                { label: "Pickup", time: pickupTime, icon: "local_shipping" },
                { label: "Load Out", time: loadOutTime, icon: "logout" },
                { label: "Transit", time: transitTime, icon: "route" },
                { label: "ETA", time: appointmentTime, icon: "schedule" },
                { label: "Arrival", time: arrivalTime, icon: "pin_drop" },
                { label: "Delivered", time: deliveredOn, icon: "check_circle" },
              ]
                .filter((step) => step.time)
                .map((step) => (
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
            {(loadTotalTime || unloadTotalTime) && (
              <div className="flex gap-3">
                {loadTotalTime && (
                  <div className="flex items-center gap-1 text-[10px] text-outline">
                    <span className="material-symbols-outlined text-xs">
                      timer
                    </span>
                    Load: {loadTotalTime}m
                  </div>
                )}
                {unloadTotalTime && (
                  <div className="flex items-center gap-1 text-[10px] text-outline">
                    <span className="material-symbols-outlined text-xs">
                      timer
                    </span>
                    Unload: {unloadTotalTime}m
                  </div>
                )}
              </div>
            )}
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
              {tareWeightLbs && (
                <div className="flex justify-between text-xs">
                  <span className="text-outline">Tare</span>
                  <span className="font-label text-on-surface tabular-nums">
                    {Number(tareWeightLbs).toLocaleString()} lbs
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

          {/* Financial Detail */}
          {(lineHaul || fuelSurcharge || totalCharge) && (
            <div className="bg-surface-container-high/40 rounded-md p-2.5 space-y-1">
              <span className="text-[9px] font-semibold text-outline tracking-[0.08em] uppercase">
                Financial
              </span>
              {lineHaul && (
                <div className="flex justify-between text-xs">
                  <span className="text-outline">Line Haul</span>
                  <span className="font-label text-on-surface tabular-nums">
                    ${Number(lineHaul).toFixed(2)}
                  </span>
                </div>
              )}
              {fuelSurcharge && (
                <div className="flex justify-between text-xs">
                  <span
                    className="text-outline"
                    title="FSC (Fuel Surcharge): per-load fee that adjusts with diesel price index"
                  >
                    FSC
                  </span>
                  <span className="font-label text-on-surface tabular-nums">
                    ${Number(fuelSurcharge).toFixed(2)}
                  </span>
                </div>
              )}
              {totalCharge && (
                <div className="flex justify-between text-xs">
                  <span className="text-outline">Total</span>
                  <span className="font-label text-on-surface font-bold tabular-nums">
                    ${Number(totalCharge).toFixed(2)}
                  </span>
                </div>
              )}
              {customerRate && (
                <div className="flex justify-between text-xs">
                  <span className="text-outline">Customer Rate</span>
                  <span className="font-label text-on-surface tabular-nums">
                    ${Number(customerRate).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Demurrage */}
          {(demurrageAtLoader || demurrageAtDestination) && (
            <div className="bg-surface-container-high/40 rounded-md p-2.5 space-y-1">
              <span
                className="text-[9px] font-semibold text-outline tracking-[0.08em] uppercase"
                title="Demurrage: detention fees billed when a truck waits beyond the contracted free time at loader or destination"
              >
                Demurrage
              </span>
              {demurrageAtLoader && (
                <div className="flex justify-between text-xs">
                  <span className="text-outline">At Loader</span>
                  <span className="font-label text-on-surface tabular-nums">
                    ${Number(demurrageAtLoader).toFixed(2)}
                    {demurrageAtLoaderHours || demurrageAtLoaderMinutes
                      ? ` (${demurrageAtLoaderHours ?? 0}h ${demurrageAtLoaderMinutes ?? 0}m)`
                      : ""}
                  </span>
                </div>
              )}
              {demurrageAtDestination && (
                <div className="flex justify-between text-xs">
                  <span className="text-outline">At Destination</span>
                  <span className="font-label text-on-surface tabular-nums">
                    ${Number(demurrageAtDestination).toFixed(2)}
                    {demurrageAtDestHours || demurrageAtDestMinutes
                      ? ` (${demurrageAtDestHours ?? 0}h ${demurrageAtDestMinutes ?? 0}m)`
                      : ""}
                  </span>
                </div>
              )}
              {demurrageAtLoader && demurrageAtDestination && (
                <div className="border-t border-outline-variant/30 pt-1 flex justify-between text-xs">
                  <span className="text-outline font-semibold">
                    Total Demurrage
                  </span>
                  <span className="font-label text-on-surface font-semibold tabular-nums">
                    $
                    {(
                      Number(demurrageAtLoader) + Number(demurrageAtDestination)
                    ).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Load Calculator */}
          {rate && weightTons && (
            <div className="bg-primary/5 border border-primary/10 rounded-md p-2.5 space-y-1.5">
              <span className="text-[9px] font-semibold text-primary tracking-[0.08em] uppercase">
                Load Calculator
              </span>
              {(() => {
                const r = Number(rate);
                const w = Number(weightTons);
                const m = mileage ? Number(mileage) : null;
                const loadTotal = r * w;
                const perMile = m && m > 0 ? loadTotal / m : null;
                return (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-outline">Rate x Weight</span>
                      <span className="font-label text-on-surface font-bold tabular-nums">
                        ${loadTotal.toFixed(2)}
                      </span>
                    </div>
                    {perMile !== null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-outline">$/mile</span>
                        <span className="font-label text-on-surface tabular-nums">
                          ${perMile.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {fuelSurcharge && (
                      <div className="flex justify-between text-xs">
                        <span
                          className="text-outline"
                          title="FSC (Fuel Surcharge): per-load fee that adjusts with diesel price index"
                        >
                          + FSC
                        </span>
                        <span className="font-label text-on-surface tabular-nums">
                          ${Number(fuelSurcharge).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="border-t border-primary/10 pt-1 flex justify-between text-xs">
                      <span className="text-primary font-bold">Est. Total</span>
                      <span className="font-label text-primary font-bold tabular-nums">
                        $
                        {(
                          loadTotal +
                          (fuelSurcharge ? Number(fuelSurcharge) : 0)
                        ).toFixed(2)}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Identity / References */}
          {(orderNo ||
            invoiceNo ||
            poNo ||
            referenceNo ||
            loaderName ||
            jobName) && (
            <div className="bg-surface-container-high/40 rounded-md p-2.5 space-y-1">
              <span className="text-[9px] font-semibold text-outline tracking-[0.08em] uppercase">
                References
              </span>
              {[
                { label: "Order #", value: orderNo },
                { label: "Invoice #", value: invoiceNo },
                { label: "PO #", value: poNo },
                { label: "Ref #", value: referenceNo },
                { label: "Loader", value: loaderName },
                { label: "Job", value: jobName },
                { label: "Shipper BOL", value: shipperBol },
                { label: "Settlement", value: settlementDate },
              ]
                .filter((f) => f.value)
                .map((f) => (
                  <div key={f.label} className="flex justify-between text-xs">
                    <span className="text-outline">{f.label}</span>
                    <span className="font-label text-on-surface-variant truncate max-w-[140px]">
                      {String(f.value)}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* Dispatcher Notes — editable when onSaveNotes is wired (O-05). */}
          <DispatcherNotesField
            initial={notesProp ?? dispatcherNotes ?? ""}
            onSave={onSaveNotes}
            isSaving={isSavingNotes}
            readOnlyFallback={!onSaveNotes && !!dispatcherNotes}
          />

          {/* Actions */}
          <div className="mt-auto flex flex-col gap-1.5">
            <button
              onClick={handleCopyAll}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-primary-container hover:text-on-surface hover:bg-surface-container-high border border-outline-variant/30 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">
                content_paste
              </span>
              Copy All Fields
            </button>
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
            {/* Duplicate */}
            {showDup ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={dupCount}
                  onChange={(e) =>
                    setDupCount(
                      Math.max(1, Math.min(100, Number(e.target.value))),
                    )
                  }
                  className="w-14 bg-background border border-outline-variant/40 rounded px-2 py-1.5 text-xs font-label tabular-nums text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <button
                  onClick={() => {
                    dupLoad.mutate(
                      { loadId, count: dupCount },
                      {
                        onSuccess: () => {
                          toast(`Duplicated ${dupCount} load(s)`, "success");
                          setShowDup(false);
                          setDupCount(1);
                        },
                        onError: (err) =>
                          toast(
                            `Duplicate failed: ${(err as Error).message}`,
                            "error",
                          ),
                      },
                    );
                  }}
                  disabled={dupLoad.isPending}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-bold bg-primary text-on-primary hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
                >
                  {dupLoad.isPending ? "Creating..." : `Create ${dupCount}`}
                </button>
                <button
                  onClick={() => setShowDup(false)}
                  className="px-2 py-1.5 rounded-md text-xs text-outline hover:text-on-surface transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">
                    close
                  </span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDup(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-primary-container hover:text-on-surface hover:bg-surface-container-high border border-outline-variant/30 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">
                  content_copy
                </span>
                Duplicate
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
