import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useValidationSummary,
  useValidationConfirm,
  useValidationReject,
  useUpdateLoad,
} from "../hooks/use-wells";
import { api } from "../lib/api";
import { qk } from "../lib/query-client";
import { useToast } from "../components/Toast";
import { WellPicker } from "../components/WellPicker";
import { Pagination } from "../components/Pagination";
import { BOLDisplay } from "../components/BOLDisplay";

/**
 * Inline editable field for the Validation page (O-09 / P2-4).
 * 2026-04-14: promoted to show an explicit pencil affordance, accept
 * date/number input types for the fields that need them, and preserve
 * empty-string semantics so a dispatcher can clear a value deliberately.
 */
function InlineEdit({
  label,
  value,
  fieldKey,
  loadId,
  inputType = "text",
}: {
  label: string;
  value: string | null;
  fieldKey: string;
  loadId: number;
  inputType?: "text" | "number" | "date";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const ref = useRef<HTMLInputElement>(null);
  const updateLoad = useUpdateLoad();
  const { toast } = useToast();

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const commit = () => {
    if (draft !== (value || "")) {
      // Send empty string as null so the dispatcher can deliberately clear.
      const payloadValue = draft.trim() === "" ? null : draft;
      updateLoad.mutate(
        { loadId, updates: { [fieldKey]: payloadValue } },
        {
          onSuccess: () => toast(`${label} updated`, "success"),
          onError: (err) =>
            toast(
              `Failed to update ${label}: ${(err as Error).message}`,
              "error",
            ),
        },
      );
    }
    setEditing(false);
  };

  return (
    <div className="space-y-1">
      <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
        {label}
      </span>
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
          className="block w-full bg-background border border-primary/30 rounded px-2 py-1 text-sm text-on-surface font-label focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      ) : (
        <button
          onClick={() => {
            setDraft(value || "");
            setEditing(true);
          }}
          className="group inline-flex items-center gap-1 text-sm text-on-surface font-label hover:text-primary cursor-pointer transition-colors"
          title={`Click to edit ${label.toLowerCase()}`}
          aria-label={`Edit ${label}`}
        >
          <span>
            {value || <span className="text-on-surface-variant">--</span>}
          </span>
          <span className="material-symbols-outlined text-[12px] text-on-surface-variant group-hover:text-primary transition-colors">
            edit
          </span>
        </button>
      )}
    </div>
  );
}

interface TierAssignment {
  id: number;
  wellId: number;
  loadId: number;
  status: string;
  autoMapTier: number | null;
  autoMapScore: string | null;
  photoStatus: string | null;
  createdAt: string;
  // Joined fields from backend
  loadNo: string;
  driverName: string | null;
  destinationName: string | null;
  carrierName: string | null;
  weightTons: string | null;
  ticketNo: string | null;
  bolNo: string | null;
  truckNo: string | null;
  trailerNo: string | null;
  deliveredOn: string | null;
  wellName: string;
  // Merged Desk additions (2026-04-15):
  photoUrls?: string[];
  jotformBolNo?: string | null;
  jotformDriverName?: string | null;
  jotformTruckNo?: string | null;
  jotformWeight?: string | null;
}

const API_BASE = import.meta.env.VITE_API_URL || "";
const resolveUrl = (url: string) =>
  url.startsWith("/") ? `${API_BASE}${url}` : url;

const TIER_META: Record<
  number,
  {
    label: string;
    description: string;
    icon: string;
    borderClass: string;
    textClass: string;
    bgClass: string;
  }
> = {
  1: {
    label: "Tier 1",
    description: "High Confidence -- Job ID Match",
    icon: "verified",
    borderClass: "border-tertiary",
    textClass: "text-tertiary",
    bgClass: "bg-tertiary",
  },
  2: {
    label: "Tier 2",
    description: "Medium Confidence -- Fuzzy Match",
    icon: "help",
    borderClass: "border-primary-container",
    textClass: "text-primary-container",
    bgClass: "bg-primary-container",
  },
  3: {
    label: "Tier 3",
    description: "Unresolved -- Manual Required",
    icon: "warning",
    borderClass: "border-error",
    textClass: "text-error",
    bgClass: "bg-error",
  },
};

function ConfidenceBadge({ score }: { score: string | null }) {
  if (score == null) return null;
  const pct = Math.round(Number(score) * 100);
  const color =
    pct >= 90
      ? "text-tertiary bg-tertiary/10"
      : pct >= 70
        ? "text-primary-container bg-primary-container/10"
        : "text-error bg-error/10";
  return (
    <span
      className={`font-label text-xs font-bold px-2 py-0.5 rounded ${color}`}
    >
      {pct}%
    </span>
  );
}

export function Validation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedTiers, setExpandedTiers] = useState<Set<number>>(
    new Set([1, 2, 3]),
  );
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Pagination state per tier
  const [tierPages, setTierPages] = useState<Record<number, number>>({
    1: 1,
    2: 1,
    3: 1,
  });
  const [tierPageSizes, setTierPageSizes] = useState<Record<number, number>>({
    1: 50,
    2: 50,
    3: 50,
  });

  const summaryQuery = useValidationSummary();
  const confirmMutation = useValidationConfirm();
  const rejectMutation = useValidationReject();

  const tier1Query = useQuery({
    queryKey: [...qk.validation.tier(1), tierPages[1], tierPageSizes[1]],
    queryFn: () =>
      api.get<any>(
        `/dispatch/validation/tier/1?page=${tierPages[1]}&limit=${tierPageSizes[1]}`,
      ),
  });
  const tier2Query = useQuery({
    queryKey: [...qk.validation.tier(2), tierPages[2], tierPageSizes[2]],
    queryFn: () =>
      api.get<any>(
        `/dispatch/validation/tier/2?page=${tierPages[2]}&limit=${tierPageSizes[2]}`,
      ),
  });
  const tier3Query = useQuery({
    queryKey: [...qk.validation.tier(3), tierPages[3], tierPageSizes[3]],
    queryFn: () =>
      api.get<any>(
        `/dispatch/validation/tier/3?page=${tierPages[3]}&limit=${tierPageSizes[3]}`,
      ),
  });

  const tierQueries: Record<number, typeof tier1Query> = {
    1: tier1Query,
    2: tier2Query,
    3: tier3Query,
  };

  const summary = summaryQuery.data as Record<string, unknown> | undefined;
  const tierCounts: Record<number, number> = {
    1: Number(summary?.tier1 ?? 0),
    2: Number(summary?.tier2 ?? 0),
    3: Number(summary?.tier3 ?? 0),
  };

  const toggleTier = (tier: number) => {
    setExpandedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  };

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.validation.all });
    queryClient.invalidateQueries({ queryKey: qk.assignments.all });
    queryClient.invalidateQueries({ queryKey: qk.wells.all });
    queryClient.invalidateQueries({ queryKey: qk.readiness.all });
  }, [queryClient]);

  const handleConfirm = (assignmentId: number) => {
    confirmMutation.mutate(
      { assignmentId },
      {
        onSuccess: () => {
          toast("Assignment confirmed", "success");
          invalidateAll();
        },
        onError: (err) =>
          toast(`Confirm failed: ${(err as Error).message}`, "error"),
      },
    );
  };

  const handleReject = (assignmentId: number) => {
    rejectMutation.mutate(
      { assignmentId, reason: rejectReason || undefined },
      {
        onSuccess: () => {
          toast("Assignment rejected", "success");
          setRejectingId(null);
          setRejectReason("");
          invalidateAll();
        },
        onError: (err) =>
          toast(`Reject failed: ${(err as Error).message}`, "error"),
      },
    );
  };

  const handleBulkApproveTier1 = async () => {
    const rawData = tier1Query.data as unknown;
    const tierResponse = rawData as any;
    const assignments: TierAssignment[] = Array.isArray(tierResponse)
      ? tierResponse
      : (tierResponse?.data ?? []);
    if (assignments.length === 0) return;

    const ids = assignments.map((a) => a.id);

    if (
      !window.confirm(
        `Approve all ${ids.length} Tier 1 assignments? This will move them to dispatch.`,
      )
    )
      return;

    try {
      await Promise.all(
        ids.map((id) =>
          api.post("/dispatch/validation/confirm", { assignmentId: id }),
        ),
      );
      toast(`${ids.length} Tier 1 assignments approved`, "success");
      invalidateAll();
    } catch (err) {
      toast(`Approve failed: ${(err as Error).message}`, "error");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Page Header — merged Validation + BOL view (2026-04-15) */}
      <div className="px-7 pt-5 pb-4 border-b border-outline-variant/40 bg-surface-container-lowest header-gradient shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-primary rounded-sm shrink-0" />
          <div className="flex-1">
            <h1 className="font-headline text-[22px] font-extrabold tracking-tight text-on-surface uppercase leading-tight">
              Validation Desk
            </h1>
            <p className="text-[11px] font-medium text-outline tracking-[0.08em] uppercase mt-0.5">
              Tier-Based Review // Photo + Match Side-By-Side
            </p>
          </div>
          {/* Inline BOL search — Jessica ask on 2026-04-15 call */}
          <div className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant/40 rounded-md px-3 py-2 w-80">
            <span className="material-symbols-outlined text-sm text-outline">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Find by BOL, ticket, load #, driver"
              className="flex-1 bg-transparent text-sm text-on-surface focus:outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="text-outline hover:text-on-surface"
                aria-label="Clear"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-7 pt-5 pb-6 space-y-6">
        {/* Quick Action: Bulk Approve Tier 1 */}
        {tierCounts[1] > 0 && !summaryQuery.isLoading && (
          <div className="bg-surface-container-lowest rounded-[12px] p-6 border border-tertiary/20 flex items-center justify-between card-rest">
            <div className="flex items-center gap-4">
              <div className="bg-tertiary/10 p-3 rounded-lg">
                <span className="material-symbols-outlined icon-filled text-tertiary text-2xl">
                  verified
                </span>
              </div>
              <div>
                <p className="text-on-surface font-bold text-lg">
                  {tierCounts[1]} high-confidence matches ready
                </p>
                <p className="text-on-surface-variant text-xs font-label">
                  Job ID matched -- bulk approve to move to dispatch
                </p>
              </div>
            </div>
            <button
              onClick={handleBulkApproveTier1}
              disabled={confirmMutation.isPending}
              className="bg-tertiary/15 text-tertiary px-6 py-3 rounded-lg text-sm font-bold uppercase tracking-wider hover:bg-tertiary/25 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2 active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">
                done_all
              </span>
              Approve All Tier 1
            </button>
          </div>
        )}

        {/* Tier Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((tier) => {
            const meta = TIER_META[tier];
            const count = tierCounts[tier];
            return (
              <button
                key={tier}
                onClick={() => toggleTier(tier)}
                className={`bg-surface-container-lowest rounded-[12px] p-6 border border-outline-variant/40 border-l-4 ${meta.borderClass} text-left transition-all hover:bg-surface-container-high cursor-pointer group card-rest`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`material-symbols-outlined icon-filled ${meta.textClass}`}
                    >
                      {meta.icon}
                    </span>
                    <span
                      className="text-xs font-bold uppercase tracking-widest text-on-surface-variant"
                      title={`${meta.label} — ${meta.description.replace(/--/g, "—")}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <span
                    className={`material-symbols-outlined text-sm text-on-surface-variant transition-transform ${expandedTiers.has(tier) ? "rotate-180" : ""}`}
                  >
                    expand_more
                  </span>
                </div>
                <div
                  className={`font-data text-3xl font-bold ${meta.textClass}`}
                >
                  {summaryQuery.isLoading ? "..." : count}
                </div>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mt-1">
                  {meta.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Total */}
        <div className="flex items-center gap-4 px-2">
          <span className="text-xs text-on-surface-variant uppercase tracking-widest font-bold">
            Total Pending
          </span>
          <span className="font-data text-lg font-bold text-on-surface">
            {summaryQuery.isLoading
              ? "..."
              : tierCounts[1] + tierCounts[2] + tierCounts[3]}
          </span>
        </div>

        {/* Tier Sections */}
        {[1, 2, 3].map((tier) => {
          if (!expandedTiers.has(tier)) return null;

          const meta = TIER_META[tier];
          const query = tierQueries[tier];

          // Handle both response shapes: raw array or { data, meta } envelope
          const rawData = query.data as unknown;
          const tierResponse = rawData as any;
          const allAssignments: TierAssignment[] = Array.isArray(tierResponse)
            ? tierResponse
            : (tierResponse?.data ?? []);
          // Client-side filter: search matches any of load#, BOL, ticket, driver
          const q = searchTerm.trim().toLowerCase();
          const assignments: TierAssignment[] = q
            ? allAssignments.filter((a) => {
                const hay = [
                  a.loadNo,
                  a.bolNo,
                  a.ticketNo,
                  a.driverName,
                  a.jotformBolNo,
                  a.truckNo,
                ]
                  .filter(Boolean)
                  .join(" ")
                  .toLowerCase();
                return hay.includes(q);
              })
            : allAssignments;
          const tierTotal = Array.isArray(tierResponse)
            ? tierResponse.length
            : (tierResponse?.meta?.total ?? allAssignments.length);

          return (
            <section key={tier} className="space-y-3">
              {/* Tier Section Header */}
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${meta.bgClass}`} />
                  <h3 className="text-xs uppercase tracking-[0.2em] font-black text-on-surface-variant">
                    {meta.label}{" "}
                    <span className={meta.textClass}>{meta.description}</span>
                  </h3>
                </div>
                {tier === 1 && assignments.length > 0 && (
                  <button
                    onClick={handleBulkApproveTier1}
                    disabled={confirmMutation.isPending}
                    className="bg-tertiary/10 text-tertiary px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-tertiary/20 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">
                      done_all
                    </span>
                    Approve All Tier 1 ({assignments.length})
                  </button>
                )}
              </div>

              {/* Loading */}
              {query.isLoading && (
                <div className="space-y-[1px] bg-on-surface/5 rounded-xl overflow-hidden border border-on-surface/5">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="bg-surface-container-low p-5 animate-pulse flex items-center gap-6"
                    >
                      <div className="h-4 w-24 bg-on-surface/10 rounded" />
                      <div className="h-4 w-32 bg-on-surface/5 rounded" />
                      <div className="h-4 w-48 bg-on-surface/5 rounded" />
                      <div className="flex-1" />
                      <div className="h-8 w-20 bg-on-surface/5 rounded-lg" />
                      <div className="h-8 w-20 bg-on-surface/5 rounded-lg" />
                    </div>
                  ))}
                </div>
              )}

              {/* Empty */}
              {!query.isLoading && assignments.length === 0 && (
                <div className="bg-surface-container-low rounded-xl p-8 text-center border border-on-surface/5">
                  <span className="material-symbols-outlined text-3xl text-on-surface/15 mb-2">
                    inbox
                  </span>
                  <p className="text-on-surface-variant font-label text-sm">
                    No {meta.label.toLowerCase()} assignments pending
                  </p>
                </div>
              )}

              {/* Rows */}
              {assignments.length > 0 && (
                <div className="space-y-[1px] bg-on-surface/5 rounded-xl overflow-hidden border border-on-surface/5">
                  {/* Table Header */}
                  <div className="bg-surface-container-lowest/50 px-6 py-3 flex items-center gap-6 text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
                    <div className="w-28">Load #</div>
                    <div className="w-36">Driver</div>
                    <div className="flex-1">Destination &rarr; Well</div>
                    <div className="w-20 text-center">Score</div>
                    <div className="w-44 text-right">Actions</div>
                  </div>

                  {assignments.map((a) => (
                    <div key={`${tier}-${a.id}`}>
                      {/* Summary Row -- click to expand */}
                      <div
                        onClick={() =>
                          setExpandedId(expandedId === a.id ? null : a.id)
                        }
                        className="bg-surface-container-low hover:bg-surface-container-high transition-all px-6 py-4 flex items-center gap-6 cursor-pointer"
                      >
                        {/* Expand indicator */}
                        <span
                          className={`material-symbols-outlined text-sm text-on-surface-variant transition-transform ${expandedId === a.id ? "rotate-90" : ""}`}
                        >
                          chevron_right
                        </span>

                        {/* Photo thumbnail — post-2026-04-15 merged Desk:
                            shows the JotForm ticket photo matched to this
                            load so dispatchers can see image without
                            bouncing to BOL Queue. */}
                        <div className="relative w-12 h-12 rounded-md overflow-hidden bg-surface-container-highest shrink-0 border border-outline-variant/30">
                          {a.photoUrls && a.photoUrls.length > 0 ? (
                            <>
                              <img
                                src={resolveUrl(a.photoUrls[0])}
                                alt="Ticket"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display =
                                    "none";
                                }}
                              />
                              {a.photoUrls.length > 1 && (
                                <span
                                  className="absolute -top-1 -right-1 bg-primary text-on-primary text-[9px] font-bold leading-none rounded-full px-1 py-0.5 tabular-nums ring-1 ring-surface shadow"
                                  aria-label={`${a.photoUrls.length} photos`}
                                  title={`${a.photoUrls.length} photos — open in Load Center drawer to cycle`}
                                >
                                  {a.photoUrls.length}
                                </span>
                              )}
                            </>
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center"
                              title={
                                a.photoStatus === "missing"
                                  ? "No photo submitted for this load"
                                  : "Awaiting photo — JotForm sync runs every 30 min"
                              }
                            >
                              <span className="material-symbols-outlined text-sm text-outline">
                                {a.photoStatus === "missing"
                                  ? "no_photography"
                                  : "schedule"}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Load Number */}
                        <div className="w-24">
                          <span className="font-label text-sm font-bold text-on-surface">
                            {a.loadNo || `#${a.loadId}`}
                          </span>
                        </div>

                        {/* Driver */}
                        <div className="w-36">
                          <span className="text-sm text-on-surface/80 truncate block">
                            {a.driverName ?? "--"}
                          </span>
                        </div>

                        {/* Destination -> Well (WellPicker replaces static text) */}
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                          <span className="font-label text-xs text-on-surface/50 truncate max-w-[140px]">
                            {a.destinationName ?? "Unknown"}
                          </span>
                          <span className="material-symbols-outlined text-xs text-on-surface-variant">
                            arrow_forward
                          </span>
                          <WellPicker
                            loadId={a.loadId}
                            assignmentId={tier === 3 ? null : a.id}
                            currentWellId={a.wellId === 0 ? null : a.wellId}
                            currentWellName={a.wellName}
                            onResolved={invalidateAll}
                          />
                        </div>

                        {/* Confidence Score */}
                        <div className="w-20 text-center">
                          <ConfidenceBadge score={a.autoMapScore} />
                        </div>

                        {/* Actions -- stop propagation so clicks don't toggle expand */}
                        {tier !== 3 && (
                          <div
                            className="w-44 flex items-center justify-end gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {rejectingId === a.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={rejectReason}
                                  onChange={(e) =>
                                    setRejectReason(e.target.value)
                                  }
                                  placeholder="Reason (optional)"
                                  className="w-28 bg-surface-container-high border border-on-surface/10 rounded px-2 py-1.5 text-xs text-on-surface font-label focus:outline-none focus:border-error/50"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleReject(a.id);
                                    if (e.key === "Escape") {
                                      setRejectingId(null);
                                      setRejectReason("");
                                    }
                                  }}
                                />
                                <button
                                  onClick={() => handleReject(a.id)}
                                  disabled={rejectMutation.isPending}
                                  className="text-error text-xs font-bold cursor-pointer hover:underline"
                                >
                                  Send
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectingId(null);
                                    setRejectReason("");
                                  }}
                                  className="text-on-surface-variant text-xs cursor-pointer hover:text-on-surface/60"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleConfirm(a.id)}
                                  disabled={confirmMutation.isPending}
                                  className="bg-tertiary/10 text-tertiary px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-tertiary/20 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    check
                                  </span>
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setRejectingId(a.id)}
                                  disabled={rejectMutation.isPending}
                                  className="bg-error/10 text-error px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-error/20 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    close
                                  </span>
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        {/* Spacer for Tier 3 rows where actions column is hidden */}
                        {tier === 3 && <div className="w-44" />}
                      </div>

                      {/* Expanded Detail Panel — editable fields */}
                      {expandedId === a.id && (
                        <div className="bg-surface-container-lowest px-6 py-5 border-t border-on-surface/5">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Read-only fields */}
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
                                Load #
                              </span>
                              <p className="text-sm text-on-surface font-label">
                                {a.loadNo}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
                                Well
                              </span>
                              <p className="text-sm text-on-surface font-label">
                                {a.wellName}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
                                Tier
                              </span>
                              <p className="text-sm text-on-surface font-label">
                                {a.autoMapTier ? `Tier ${a.autoMapTier}` : "--"}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
                                Score
                              </span>
                              <p className="text-sm text-on-surface font-label">
                                {a.autoMapScore
                                  ? `${Math.round(Number(a.autoMapScore) * 100)}%`
                                  : "--"}
                              </p>
                            </div>
                            {/* Editable fields */}
                            <InlineEdit
                              label="Driver"
                              value={a.driverName}
                              fieldKey="driverName"
                              loadId={a.loadId}
                            />
                            <InlineEdit
                              label="Carrier"
                              value={a.carrierName}
                              fieldKey="carrierName"
                              loadId={a.loadId}
                            />
                            <InlineEdit
                              label="Weight (tons)"
                              value={a.weightTons}
                              fieldKey="weightTons"
                              loadId={a.loadId}
                            />
                            {/* BOL — unified display. The paper ticket # is
                                the BOL in everyday speech; the Logistiq/PropX
                                system ID renders only as a muted suffix. Edit
                                the ticket number via the "Ticket #" field
                                below; the system ID is not dispatcher-editable
                                from Validation. */}
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                                BOL
                              </span>
                              <BOLDisplay
                                ticketNo={a.ticketNo}
                                bolNo={a.bolNo}
                                size="sm"
                                showSourcePrefix={false}
                              />
                            </div>
                            <InlineEdit
                              label="Ticket #"
                              value={a.ticketNo}
                              fieldKey="ticketNo"
                              loadId={a.loadId}
                            />
                            <InlineEdit
                              label="Truck #"
                              value={a.truckNo}
                              fieldKey="truckNo"
                              loadId={a.loadId}
                            />
                            <InlineEdit
                              label="Trailer #"
                              value={a.trailerNo}
                              fieldKey="trailerNo"
                              loadId={a.loadId}
                            />
                            <InlineEdit
                              label="Delivered"
                              value={
                                a.deliveredOn
                                  ? a.deliveredOn.slice(0, 10)
                                  : null
                              }
                              fieldKey="deliveredOn"
                              loadId={a.loadId}
                              inputType="date"
                            />
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
                                Destination
                              </span>
                              <p className="text-sm text-on-surface font-label">
                                {a.destinationName || (
                                  <span className="text-on-surface-variant">
                                    --
                                  </span>
                                )}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
                                Photo Status
                              </span>
                              <p className="text-sm text-on-surface font-label">
                                {a.photoStatus ?? "missing"}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
                                Assignment
                              </span>
                              <p className="text-sm text-on-surface font-label">
                                #{a.id}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {tierTotal > 0 && (
                <Pagination
                  page={tierPages[tier]}
                  pageSize={tierPageSizes[tier]}
                  total={tierTotal}
                  onPageChange={(p) =>
                    setTierPages((prev) => ({ ...prev, [tier]: p }))
                  }
                  onPageSizeChange={(s) => {
                    setTierPageSizes((prev) => ({ ...prev, [tier]: s }));
                    setTierPages((prev) => ({ ...prev, [tier]: 1 }));
                  }}
                  loading={query.isLoading}
                />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
