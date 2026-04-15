import { useState, useRef, useEffect } from "react";
import {
  useBolQueue,
  useBolStats,
  useMissingTickets,
  useManualMatchJotform,
  useJotformLoadSearch,
  useCorrectJotformBol,
} from "../hooks/use-bol";
import { Pagination } from "../components/Pagination";
import { useToast } from "../components/Toast";

const API_BASE = import.meta.env.VITE_API_URL || "";
const resolveUrl = (url: string) =>
  url.startsWith("/") ? `${API_BASE}${url}` : url;

interface JotFormDiscrepancy {
  field: string;
  severity: "critical" | "warning" | "info";
  jotformValue: string | null;
  loadValue: string | null;
  message: string;
}

interface JotFormItem {
  submission: {
    id: number;
    bolNumber: string | null;
    driverName: string | null;
    truckNo: string | null;
    weight: string | null;
    photoUrls: string[];
    status: string;
    submittedAt: string | null;
    createdAt: string | null;
  };
  matchedLoad: {
    id: number;
    loadNo: string;
    driverName: string | null;
    destinationName: string | null;
    ticketNo: string | null;
  } | null;
  discrepancies: JotFormDiscrepancy[];
}

function formatDate(d: string | null): string {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

type Tab = "reconciliation" | "submissions" | "missing";

/**
 * Inline-editable BOL number for the reconciliation queue. Click to edit,
 * Enter or blur to save, Escape to cancel. Server preserves the original
 * OCR value and re-runs the matcher, so a corrected BOL can promote a
 * pending row to matched without leaving the queue.
 */
function EditableBol({
  importId,
  value,
}: {
  importId: number;
  value: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const correct = useCorrectJotformBol();
  const { toast } = useToast();

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === (value ?? "")) {
      setEditing(false);
      return;
    }
    correct.mutate(
      { importId, bolNo: trimmed },
      {
        onSuccess: (res) => {
          const data = (res as any)?.data;
          const note = data?.matched
            ? ` — matched to load ${data.matchedLoadId}`
            : "";
          toast(`BOL updated to ${trimmed}${note}`, "success");
          setEditing(false);
        },
        onError: (err) =>
          toast(`Update failed: ${(err as Error).message}`, "error"),
      },
    );
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        disabled={correct.isPending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        className="font-label text-sm font-bold text-on-surface bg-background border border-primary/40 rounded px-2 py-0.5 w-32 focus:outline-none focus:ring-1 focus:ring-primary/30"
      />
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setDraft(value ?? "");
        setEditing(true);
      }}
      title="Click to fix the BOL — original OCR value is preserved"
      className="font-label text-sm font-bold text-on-surface inline-flex items-center gap-1 hover:text-primary transition-colors"
    >
      BOL {value || "--"}
      <span className="material-symbols-outlined text-[12px] text-outline/60">
        edit
      </span>
    </button>
  );
}

export function BolQueue() {
  const [activeTab, setActiveTab] = useState<Tab>("reconciliation");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filter, setFilter] = useState<"all" | "matched" | "pending">("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    x: number;
    y: number;
    px: number;
    py: number;
  } | null>(null);
  useEffect(() => {
    if (photoModal) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [photoModal]);

  const statsQuery = useBolStats();
  const queueQuery = useBolQueue({ page, limit: pageSize });
  const missingQuery = useMissingTickets({ page, limit: pageSize });

  const stats = statsQuery.data as Record<string, unknown> | undefined;
  const total = Number(stats?.total ?? 0);
  const matchRate = String(stats?.matchRate ?? "0%");
  const byStatus = (stats?.byStatus ?? {}) as Record<string, number>;

  const response = queueQuery.data as any;
  const rawItems: JotFormItem[] =
    response?.data ?? (Array.isArray(response) ? response : []);
  const queueTotal = response?.meta?.total ?? rawItems.length;

  const filtered =
    filter === "all"
      ? rawItems
      : rawItems.filter((i) =>
          filter === "matched"
            ? i.submission.status === "matched"
            : i.submission.status === "pending",
        );

  const missingResponse = missingQuery.data as any;
  const missingLoads: any[] = missingResponse?.data ?? [];
  const missingTotal = missingResponse?.meta?.total ?? missingLoads.length;

  const tabs: { id: Tab; label: string; count: number; color?: string }[] = [
    { id: "reconciliation", label: "Reconciliation", count: queueTotal },
    {
      id: "submissions",
      label: "JotForm Submissions",
      count: total,
    },
    {
      id: "missing",
      label: "Missing Tickets",
      count: missingTotal,
      color: missingTotal > 0 ? "text-error" : undefined,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="px-7 pt-5 pb-4 border-b border-outline-variant/40 bg-surface-container-lowest shrink-0 header-gradient">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-primary rounded-sm shrink-0" />
          <div>
            <h1 className="font-headline text-[22px] font-extrabold tracking-tight text-on-surface uppercase leading-tight">
              BOL Queue
            </h1>
            <p className="text-[11px] font-medium text-outline tracking-[0.08em] uppercase mt-0.5">
              Weight Ticket Reconciliation // JotForm Pipeline
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-7 pt-5 pb-6 space-y-4">
        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: "Total Submissions",
              value: total,
              icon: "receipt_long",
              color: "primary",
            },
            {
              label: "Matched",
              value: byStatus.matched ?? 0,
              icon: "link",
              color: "tertiary",
            },
            {
              label: "Unmatched",
              value: byStatus.pending ?? 0,
              icon: "link_off",
              color: "error",
            },
            {
              label: "Missing Tickets",
              value: missingTotal,
              icon: "warning",
              color: missingTotal > 0 ? "error" : "outline",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-surface-container-lowest border border-outline-variant/40 rounded-[12px] p-5 card-rest stat-glow"
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`material-symbols-outlined text-${s.color} text-base`}
                >
                  {s.icon}
                </span>
                <span className="text-[10px] uppercase tracking-[0.06em] font-bold text-outline">
                  {s.label}
                </span>
              </div>
              <div
                className={`font-data text-2xl font-bold text-${s.color} tabular-nums`}
              >
                {statsQuery.isLoading ? "..." : s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 bg-surface-container-lowest border border-outline-variant/40 rounded-[12px] p-1 card-rest">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === tab.id
                  ? "bg-primary-container/12 text-primary-container shadow-sm"
                  : "text-outline hover:text-on-surface hover:bg-surface-container-high/60"
              }`}
            >
              {tab.label}
              <span
                className={`inline-flex items-center justify-center rounded-[10px] text-[10px] font-bold px-1.5 py-px ml-1.5 tabular-nums ${
                  tab.color
                    ? `bg-error/10 ${tab.color}`
                    : activeTab === tab.id
                      ? "bg-primary-container/15 text-primary-container"
                      : "bg-surface-container-highest text-outline"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* ─── TAB: Reconciliation ─── */}
        {activeTab === "reconciliation" && (
          <>
            {/* Sub-filter */}
            <div className="flex gap-1.5">
              {(["all", "matched", "pending"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    filter === f
                      ? "bg-primary-container/12 text-primary-container shadow-sm"
                      : "text-outline hover:bg-surface-container-high/60 hover:text-on-surface"
                  }`}
                >
                  {f === "all"
                    ? `All (${rawItems.length})`
                    : f === "matched"
                      ? `Matched (${rawItems.filter((i) => i.submission.status === "matched").length})`
                      : `Unmatched (${rawItems.filter((i) => i.submission.status === "pending").length})`}
                </button>
              ))}
            </div>

            {/* Queue List */}
            {queueQuery.isLoading ? (
              <div className="space-y-1.5">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="bg-surface-container-lowest border border-outline-variant/40 rounded-[10px] h-16 animate-pulse"
                  />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-[10px] p-12 text-center">
                <span className="material-symbols-outlined text-4xl text-outline/30 mb-2">
                  inbox
                </span>
                <p className="text-outline text-sm">
                  {filter === "all"
                    ? "No JotForm submissions yet"
                    : `No ${filter} submissions`}
                </p>
              </div>
            ) : (
              <div className="space-y-px bg-outline-variant/20 rounded-[10px] overflow-hidden border border-outline-variant/40">
                {filtered.map((item) => {
                  const sub = item.submission;
                  const load = item.matchedLoad;
                  const isExpanded = expandedId === sub.id;
                  const hasPhoto = sub.photoUrls && sub.photoUrls.length > 0;

                  return (
                    <div key={sub.id}>
                      <div
                        onClick={() =>
                          setExpandedId(isExpanded ? null : sub.id)
                        }
                        className="bg-surface-container-lowest hover:bg-surface-container-high transition-all px-5 py-3.5 flex items-center gap-5 cursor-pointer"
                      >
                        {/* Photo thumbnail */}
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-container-high shrink-0 border border-outline-variant/30">
                          {hasPhoto ? (
                            <img
                              src={resolveUrl(sub.photoUrls[0])}
                              alt="Weight ticket"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="material-symbols-outlined text-outline/30 text-sm">
                                no_photography
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <EditableBol
                              importId={sub.id}
                              value={sub.bolNumber}
                            />
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                sub.status === "matched"
                                  ? "bg-[#d1fae5] text-[#065f46]"
                                  : "bg-[#fee2e2] text-[#991b1b]"
                              }`}
                            >
                              {sub.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-outline mt-0.5 flex gap-3">
                            <span>{sub.driverName || "Unknown driver"}</span>
                            <span>Truck {sub.truckNo || "--"}</span>
                            <span>{formatDate(sub.submittedAt)}</span>
                          </div>
                        </div>

                        {/* Discrepancy badge */}
                        {item.discrepancies.length > 0 && (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              item.discrepancies.some(
                                (d) => d.severity === "critical",
                              )
                                ? "bg-error/15 text-error"
                                : item.discrepancies.some(
                                      (d) => d.severity === "warning",
                                    )
                                  ? "bg-[#fef3c7] text-[#92400e]"
                                  : "bg-surface-container-high text-outline"
                            }`}
                            title={item.discrepancies
                              .map((d) => `${d.field}: ${d.message}`)
                              .join("\n")}
                          >
                            <span className="material-symbols-outlined text-[12px]">
                              warning
                            </span>
                            {item.discrepancies.length} mismatch
                            {item.discrepancies.length > 1 ? "es" : ""}
                          </span>
                        )}

                        {/* Matched load */}
                        {load && (
                          <div className="text-right">
                            <span className="text-[10px] text-outline uppercase tracking-wider">
                              Matched to
                            </span>
                            <p className="font-label text-sm font-bold text-on-surface">
                              Load {load.loadNo || `#${load.id}`}
                            </p>
                          </div>
                        )}

                        <span
                          className={`material-symbols-outlined text-sm text-outline/40 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        >
                          chevron_right
                        </span>
                      </div>

                      {/* Expanded Detail */}
                      {isExpanded && (
                        <div className="bg-background px-5 py-4 border-t border-outline-variant/30 space-y-3">
                          {hasPhoto && (
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {sub.photoUrls.map((url, i) => (
                                <button
                                  key={i}
                                  onClick={() => setPhotoModal(resolveUrl(url))}
                                  className="w-28 h-36 rounded-lg overflow-hidden bg-surface-container-high border border-outline-variant/30 shrink-0 hover:ring-2 hover:ring-primary transition-all cursor-pointer"
                                >
                                  <img
                                    src={resolveUrl(url)}
                                    alt={`Ticket photo ${i + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                              { label: "BOL / Ticket #", value: sub.bolNumber },
                              { label: "Driver", value: sub.driverName },
                              { label: "Truck #", value: sub.truckNo },
                              { label: "Weight", value: sub.weight },
                              {
                                label: "Submitted",
                                value: formatDate(sub.submittedAt),
                              },
                              { label: "Status", value: sub.status },
                              ...(load
                                ? [
                                    {
                                      label: "Matched Load",
                                      value: load.loadNo || `#${load.id}`,
                                    },
                                    {
                                      label: "Well / Destination",
                                      value: load.destinationName,
                                    },
                                  ]
                                : [
                                    {
                                      label: "Matched Load",
                                      value: "-- UNMATCHED --",
                                    },
                                  ]),
                            ].map((f) => (
                              <div key={f.label} className="space-y-0.5">
                                <span className="text-[10px] uppercase tracking-[0.06em] font-bold text-outline">
                                  {f.label}
                                </span>
                                <p className="text-[13px] text-on-surface font-label">
                                  {f.value || (
                                    <span className="text-outline/40">--</span>
                                  )}
                                </p>
                              </div>
                            ))}
                          </div>
                          {!load && <ManualMatchPanel importId={sub.id} />}
                          {load && item.discrepancies.length > 0 && (
                            <DiscrepancyPanel
                              discrepancies={item.discrepancies}
                              importId={sub.id}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {queueTotal > 0 && (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={queueTotal}
                onPageChange={setPage}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
                loading={queueQuery.isLoading}
              />
            )}
          </>
        )}

        {/* ─── TAB: JotForm Submissions ─── */}
        {activeTab === "submissions" && (
          <>
            <p className="text-xs text-outline">
              Raw JotForm weight ticket submissions — {total} total, {matchRate}{" "}
              match rate
            </p>

            {queueQuery.isLoading ? (
              <div className="space-y-1.5">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-surface-container-lowest border border-outline-variant/40 rounded-[10px] h-12 animate-pulse"
                  />
                ))}
              </div>
            ) : rawItems.length === 0 ? (
              <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-[10px] p-12 text-center">
                <span className="material-symbols-outlined text-4xl text-outline/30">
                  receipt_long
                </span>
                <p className="text-outline text-sm mt-2">
                  No JotForm submissions imported yet
                </p>
              </div>
            ) : (
              <>
                {/* Column headers */}
                <div
                  className="grid items-center gap-3 px-3.5 pb-1"
                  style={{
                    gridTemplateColumns: "40px 1fr 120px 100px 80px 100px 80px",
                  }}
                >
                  <div />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline">
                    Driver / BOL
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline">
                    Truck
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline text-right">
                    Weight
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline text-center">
                    Status
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline">
                    Matched To
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline text-right">
                    Date
                  </span>
                </div>

                <div className="space-y-1">
                  {rawItems.map((item) => {
                    const sub = item.submission;
                    const load = item.matchedLoad;
                    const hasPhoto = sub.photoUrls?.length > 0;

                    return (
                      <div
                        key={sub.id}
                        className="grid items-center gap-3 bg-surface-container-lowest border border-outline-variant/40 rounded-[10px] px-3.5 py-2.5 shadow-sm hover:border-primary/20 hover:shadow-md transition-all cursor-pointer"
                        style={{
                          gridTemplateColumns:
                            "40px 1fr 120px 100px 80px 100px 80px",
                        }}
                        onClick={() =>
                          setExpandedId(expandedId === sub.id ? null : sub.id)
                        }
                      >
                        {/* Photo thumb */}
                        <div className="w-8 h-8 rounded-md overflow-hidden bg-surface-container-high border border-outline-variant/30 shrink-0">
                          {hasPhoto ? (
                            <img
                              src={resolveUrl(sub.photoUrls[0])}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="material-symbols-outlined text-xs text-outline/30">
                                no_photography
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Driver / BOL */}
                        <div className="min-w-0">
                          <div className="font-semibold text-[13px] text-on-surface truncate">
                            {sub.driverName || "--"}
                          </div>
                          <div className="font-label text-[11px] text-outline truncate">
                            {sub.bolNumber || "--"}
                          </div>
                        </div>

                        {/* Truck */}
                        <span className="font-label text-[11px] text-on-surface-variant">
                          {sub.truckNo || "--"}
                        </span>

                        {/* Weight */}
                        <span className="font-label text-[13px] font-medium text-on-surface-variant text-right tabular-nums">
                          {sub.weight
                            ? `${parseFloat(sub.weight).toFixed(1)}t`
                            : "--"}
                        </span>

                        {/* Status */}
                        <div className="text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              sub.status === "matched"
                                ? "bg-[#d1fae5] text-[#065f46]"
                                : "bg-[#fee2e2] text-[#991b1b]"
                            }`}
                          >
                            {sub.status}
                          </span>
                        </div>

                        {/* Matched To */}
                        <span className="font-label text-[11px] text-on-surface-variant truncate">
                          {load ? `Load ${load.loadNo}` : "--"}
                        </span>

                        {/* Date */}
                        <span className="text-[11px] text-outline text-right whitespace-nowrap">
                          {formatDate(sub.submittedAt)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={queueTotal}
                  onPageChange={setPage}
                  onPageSizeChange={(s) => {
                    setPageSize(s);
                    setPage(1);
                  }}
                  loading={queueQuery.isLoading}
                />
              </>
            )}
          </>
        )}

        {/* ─── TAB: Missing Tickets ─── */}
        {activeTab === "missing" && (
          <>
            {missingTotal > 0 && (
              <div className="flex items-center gap-3 bg-[#fee2e2] border border-error/20 rounded-[10px] px-4 py-3">
                <span className="material-symbols-outlined text-error text-lg badge-pulse">
                  warning
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#991b1b]">
                    {missingTotal} loads have no weight ticket
                  </p>
                  <p className="text-xs text-[#991b1b]/70">
                    These loads cannot be safely dispatched — PCS is POST-only,
                    no corrections after dispatch.
                  </p>
                </div>
              </div>
            )}

            {missingQuery.isLoading ? (
              <div className="space-y-1.5">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-surface-container-lowest border border-outline-variant/40 rounded-[10px] h-12 animate-pulse"
                  />
                ))}
              </div>
            ) : missingLoads.length === 0 ? (
              <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-[10px] p-12 text-center">
                <span className="material-symbols-outlined text-4xl text-tertiary/40">
                  verified
                </span>
                <p className="text-tertiary text-sm font-semibold mt-2">
                  All loads have tickets
                </p>
                <p className="text-outline text-xs mt-1">
                  No missing tickets — clear to dispatch
                </p>
              </div>
            ) : (
              <>
                {/* Column headers */}
                <div
                  className="grid items-center gap-3 px-3.5 pb-1"
                  style={{
                    gridTemplateColumns: "90px 120px 1fr 100px 100px 80px 80px",
                  }}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline">
                    Status
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline">
                    Load #
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline">
                    Driver
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline">
                    Well
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline">
                    BOL
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline text-right">
                    Weight
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline text-right">
                    Date
                  </span>
                </div>

                <div className="space-y-1">
                  {missingLoads.map((load: any) => (
                    <div
                      key={load.assignmentId}
                      className="grid items-center gap-3 bg-surface-container-lowest border border-error/15 rounded-[10px] px-3.5 py-2.5 shadow-sm border-l-4 border-l-error"
                      style={{
                        gridTemplateColumns:
                          "90px 120px 1fr 100px 100px 80px 80px",
                      }}
                    >
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#fee2e2] text-[#991b1b] w-fit">
                        <span className="w-[5px] h-[5px] rounded-full bg-error" />
                        No Ticket
                      </span>
                      <span className="font-label text-xs font-medium text-on-surface-variant tabular-nums">
                        #{load.loadNo}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-[13px] text-on-surface truncate">
                          {load.driverName || "--"}
                        </div>
                        <div className="text-[11px] text-outline truncate">
                          {load.carrierName || "--"}
                        </div>
                      </div>
                      <span className="text-[11px] text-on-surface-variant truncate">
                        {load.wellName}
                      </span>
                      <span className="font-label text-[11px] text-on-surface-variant">
                        {load.bolNo || "--"}
                      </span>
                      <span className="font-label text-[11px] text-on-surface-variant text-right tabular-nums">
                        {load.weightTons
                          ? `${parseFloat(load.weightTons).toFixed(1)}t`
                          : "--"}
                      </span>
                      <span className="text-[11px] text-outline text-right whitespace-nowrap">
                        {formatDate(load.deliveredOn)}
                      </span>
                    </div>
                  ))}
                </div>

                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={missingTotal}
                  onPageChange={setPage}
                  onPageSizeChange={(s) => {
                    setPageSize(s);
                    setPage(1);
                  }}
                  loading={missingQuery.isLoading}
                />
              </>
            )}
          </>
        )}

        {/* Photo Modal — zoomable */}
        {photoModal && (
          <div
            className="fixed inset-0 bg-on-surface/80 z-50 flex items-center justify-center p-8"
            onClick={() => setPhotoModal(null)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPhotoModal(null);
              }}
              aria-label="Close"
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-surface-container-lowest/90 text-on-surface flex items-center justify-center hover:bg-surface-container-high transition-colors z-10"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-surface-container-lowest/95 rounded-full px-2 py-1 shadow-lg z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                aria-label="Zoom out"
                disabled={zoom <= 0.5}
                className="w-9 h-9 rounded-full hover:bg-surface-container-high text-on-surface flex items-center justify-center disabled:opacity-30"
              >
                <span className="material-symbols-outlined">zoom_out</span>
              </button>
              <button
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className="px-3 h-9 rounded-full hover:bg-surface-container-high text-on-surface text-xs font-bold tabular-nums min-w-[60px]"
                title="Reset"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
                aria-label="Zoom in"
                disabled={zoom >= 5}
                className="w-9 h-9 rounded-full hover:bg-surface-container-high text-on-surface flex items-center justify-center disabled:opacity-30"
              >
                <span className="material-symbols-outlined">zoom_in</span>
              </button>
            </div>
            <div
              className="w-full h-full flex items-center justify-center overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.15 : 0.15;
                setZoom((z) => Math.min(5, Math.max(0.5, z + delta)));
              }}
              onMouseDown={(e) => {
                if (zoom <= 1) return;
                dragRef.current = {
                  x: e.clientX,
                  y: e.clientY,
                  px: pan.x,
                  py: pan.y,
                };
              }}
              onMouseMove={(e) => {
                if (!dragRef.current) return;
                setPan({
                  x: dragRef.current.px + (e.clientX - dragRef.current.x),
                  y: dragRef.current.py + (e.clientY - dragRef.current.y),
                });
              }}
              onMouseUp={() => {
                dragRef.current = null;
              }}
              onMouseLeave={() => {
                dragRef.current = null;
              }}
              style={{
                cursor:
                  zoom > 1
                    ? dragRef.current
                      ? "grabbing"
                      : "grab"
                    : "zoom-in",
              }}
            >
              <img
                src={photoModal}
                alt="Weight ticket"
                draggable={false}
                onDoubleClick={() => {
                  if (zoom === 1) {
                    setZoom(2);
                  } else {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }
                }}
                className="max-w-full max-h-full object-contain rounded-lg select-none"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transition: dragRef.current
                    ? "none"
                    : "transform 0.15s ease-out",
                  transformOrigin: "center center",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Inline manual-match control. Lets a dispatcher search loads (by load #,
 * BOL, ticket, or driver) and link an unmatched JotForm submission to the
 * right load when auto-match couldn't figure it out.
 */
function ManualMatchPanel({ importId }: { importId: number }) {
  const [query, setQuery] = useState("");
  const [pickedLoadId, setPickedLoadId] = useState<number | null>(null);
  const search = useJotformLoadSearch(query, query.trim().length >= 2);
  const match = useManualMatchJotform();
  const { toast } = useToast();
  const hits = (search.data as any[] | undefined) ?? [];

  const submit = () => {
    if (!pickedLoadId) return;
    match.mutate(
      { importId, loadId: pickedLoadId },
      {
        onSuccess: (res: any) => {
          const photoNote = res?.data?.photoAttached ? " — photo attached" : "";
          toast(`Linked to load ${pickedLoadId}${photoNote}`, "success");
          setQuery("");
          setPickedLoadId(null);
        },
        onError: (err) =>
          toast(`Match failed: ${(err as Error).message}`, "error"),
      },
    );
  };

  return (
    <div className="bg-surface-container-lowest border border-primary/30 rounded-md p-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-primary">
          Match this photo to a load
        </span>
        <span className="text-[10px] text-outline">
          Search by load #, BOL, ticket, or driver
        </span>
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPickedLoadId(null);
        }}
        placeholder="e.g. 12345, AU2604142548, Roy Arambula"
        className="w-full bg-background border border-outline-variant/40 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-primary/60 mb-2"
        autoFocus
      />
      {query.trim().length >= 2 && (
        <div className="space-y-1 max-h-56 overflow-y-auto mb-2">
          {search.isFetching && (
            <div className="text-[11px] text-outline px-2 py-1">Searching…</div>
          )}
          {!search.isFetching && hits.length === 0 && (
            <div className="text-[11px] text-outline px-2 py-1">
              No loads matched "{query}"
            </div>
          )}
          {hits.map((h) => {
            const isPicked = pickedLoadId === h.id;
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => setPickedLoadId(h.id)}
                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                  isPicked
                    ? "bg-primary/15 border border-primary/40"
                    : "hover:bg-surface-container-high border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-on-surface tabular-nums">
                    #{h.loadNo}
                  </span>
                  <span className="text-[10px] uppercase text-outline">
                    {h.source}
                  </span>
                  {isPicked && (
                    <span className="text-[10px] uppercase font-bold text-primary ml-auto">
                      selected
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-outline mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>{h.driverName ?? "no driver"}</span>
                  <span>BOL {h.bolNo ?? "--"}</span>
                  <span>Ticket {h.ticketNo ?? "--"}</span>
                  <span>
                    {h.deliveredOn
                      ? new Date(h.deliveredOn).toLocaleDateString()
                      : "no date"}
                  </span>
                  {h.destinationName && <span>→ {h.destinationName}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={!pickedLoadId || match.isPending}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary text-on-primary text-xs font-bold uppercase tracking-wide disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:brightness-110 transition-all"
      >
        <span className="material-symbols-outlined text-sm">link</span>
        {match.isPending
          ? "Linking…"
          : pickedLoadId
            ? `Link to Load #${pickedLoadId}`
            : "Pick a load above"}
      </button>
    </div>
  );
}

/**
 * Renders the field-level conflicts between a JotForm submission and the
 * load it auto-matched to. Critical = BOL/ticket disagreement (likely wrong
 * match). Warning = driver name disagreement. Info = >10% weight delta.
 */
function DiscrepancyPanel({
  discrepancies,
  importId,
}: {
  discrepancies: JotFormDiscrepancy[];
  importId: number;
}) {
  const [showRelink, setShowRelink] = useState(false);
  const SEVERITY_STYLES: Record<
    JotFormDiscrepancy["severity"],
    { dot: string; text: string; bg: string; label: string }
  > = {
    critical: {
      dot: "bg-error",
      text: "text-error",
      bg: "bg-error/8",
      label: "Critical",
    },
    warning: {
      dot: "bg-[#d97706]",
      text: "text-[#92400e]",
      bg: "bg-[#fef3c7]/40",
      label: "Warning",
    },
    info: {
      dot: "bg-outline",
      text: "text-on-surface-variant",
      bg: "bg-surface-container-high/40",
      label: "Info",
    },
  };

  return (
    <div className="bg-surface-container-lowest border border-warning/20 rounded-md p-3 mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px] text-error">
            warning
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-on-surface">
            {discrepancies.length} field
            {discrepancies.length > 1 ? "s" : ""} mismatch the matched load
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowRelink((s) => !s)}
          className="text-[10px] font-bold uppercase tracking-wide text-primary hover:underline cursor-pointer"
        >
          {showRelink ? "Cancel" : "Relink to a different load"}
        </button>
      </div>
      <div className="space-y-1">
        {discrepancies.map((d, i) => {
          const s = SEVERITY_STYLES[d.severity];
          return (
            <div
              key={i}
              className={`grid items-center gap-2 px-2 py-1.5 rounded ${s.bg}`}
              style={{ gridTemplateColumns: "8px 90px 1fr" }}
            >
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              <span className={`text-[11px] font-bold uppercase ${s.text}`}>
                {d.field}
              </span>
              <span className="text-[12px] text-on-surface">
                <span className="text-outline">photo:</span>{" "}
                <span className="font-label">{d.jotformValue ?? "--"}</span>
                <span className="text-outline mx-2">·</span>
                <span className="text-outline">load:</span>{" "}
                <span className="font-label">{d.loadValue ?? "--"}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-outline">
        Use "Relink" if the auto-match guessed the wrong load. Otherwise the
        photo stays attached and the discrepancy is just a flag for your eyes.
      </div>
      {showRelink && <ManualMatchPanel importId={importId} />}
    </div>
  );
}
