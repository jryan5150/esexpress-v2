import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useValidationSummary,
  useValidationConfirm,
  useValidationReject,
} from "../hooks/use-wells";
import { api } from "../lib/api";
import { qk } from "../lib/query-client";
import { useToast } from "../components/Toast";
import { WellPicker } from "../components/WellPicker";
import { Pagination } from "../components/Pagination";

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
  wellName: string;
}

const TIER_META: Record<
  number,
  { label: string; description: string; icon: string; color: string }
> = {
  1: {
    label: "Tier 1",
    description: "High Confidence -- Job ID Match",
    icon: "verified",
    color: "tertiary",
  },
  2: {
    label: "Tier 2",
    description: "Medium Confidence -- Fuzzy Match",
    icon: "help",
    color: "primary-container",
  },
  3: {
    label: "Tier 3",
    description: "Unresolved -- Manual Required",
    icon: "warning",
    color: "error",
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
    <div className="p-8 space-y-8 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-headline font-black tracking-tight text-on-surface uppercase">
          Validation
        </h1>
        <p className="text-on-surface/30 font-label text-xs uppercase tracking-widest mt-1">
          Tier-Based Review // Human Confirms
        </p>
      </div>

      {/* Quick Action: Bulk Approve Tier 1 */}
      {tierCounts[1] > 0 && !summaryQuery.isLoading && (
        <div className="bg-surface-container-low rounded-xl p-6 border border-tertiary/20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-tertiary/10 p-3 rounded-lg">
              <span className="material-symbols-outlined text-tertiary text-2xl">
                verified
              </span>
            </div>
            <div>
              <p className="text-on-surface font-bold text-lg">
                {tierCounts[1]} high-confidence matches ready
              </p>
              <p className="text-on-surface/40 text-xs font-label">
                Job ID matched -- bulk approve to move to dispatch
              </p>
            </div>
          </div>
          <button
            onClick={handleBulkApproveTier1}
            disabled={confirmMutation.isPending}
            className="bg-tertiary/15 text-tertiary px-6 py-3 rounded-lg text-sm font-bold uppercase tracking-wider hover:bg-tertiary/25 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2 active:scale-95"
          >
            <span className="material-symbols-outlined text-lg">done_all</span>
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
              className={`bg-surface-container-low rounded-xl p-6 border-l-4 border-${meta.color} text-left transition-all hover:bg-surface-container-high cursor-pointer group`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`material-symbols-outlined text-${meta.color}`}
                  >
                    {meta.icon}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-widest text-on-surface/40">
                    {meta.label}
                  </span>
                </div>
                <span
                  className={`material-symbols-outlined text-sm text-on-surface/30 transition-transform ${expandedTiers.has(tier) ? "rotate-180" : ""}`}
                >
                  expand_more
                </span>
              </div>
              <div
                className={`font-label text-3xl font-bold text-${meta.color}`}
              >
                {summaryQuery.isLoading ? "..." : count}
              </div>
              <p className="text-[10px] text-on-surface/40 uppercase tracking-wider mt-1">
                {meta.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Total */}
      <div className="flex items-center gap-4 px-2">
        <span className="text-xs text-on-surface/30 uppercase tracking-widest font-bold">
          Total Pending
        </span>
        <span className="font-label text-lg font-bold text-on-surface">
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
        const assignments: TierAssignment[] = Array.isArray(tierResponse)
          ? tierResponse
          : (tierResponse?.data ?? []);
        const tierTotal = Array.isArray(tierResponse)
          ? tierResponse.length
          : (tierResponse?.meta?.total ?? assignments.length);

        return (
          <section key={tier} className="space-y-3">
            {/* Tier Section Header */}
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full bg-${meta.color}`} />
                <h3 className="text-xs uppercase tracking-[0.2em] font-black text-on-surface/40">
                  {meta.label}{" "}
                  <span className={`text-${meta.color}`}>
                    {meta.description}
                  </span>
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
                <p className="text-on-surface/30 font-label text-sm">
                  No {meta.label.toLowerCase()} assignments pending
                </p>
              </div>
            )}

            {/* Rows */}
            {assignments.length > 0 && (
              <div className="space-y-[1px] bg-on-surface/5 rounded-xl overflow-hidden border border-on-surface/5">
                {/* Table Header */}
                <div className="bg-surface-container-lowest/50 px-6 py-3 flex items-center gap-6 text-[10px] uppercase tracking-widest font-bold text-on-surface/30">
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
                        className={`material-symbols-outlined text-sm text-on-surface/30 transition-transform ${expandedId === a.id ? "rotate-90" : ""}`}
                      >
                        chevron_right
                      </span>

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
                        <span className="material-symbols-outlined text-xs text-on-surface/20">
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
                                className="text-on-surface/30 text-xs cursor-pointer hover:text-on-surface/60"
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

                    {/* Expanded Detail Panel */}
                    {expandedId === a.id && (
                      <div className="bg-surface-container-lowest px-6 py-5 border-t border-on-surface/5">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {[
                            { label: "Load #", value: a.loadNo },
                            { label: "Driver", value: a.driverName },
                            { label: "Carrier", value: a.carrierName },
                            { label: "Destination", value: a.destinationName },
                            { label: "Well", value: a.wellName },
                            { label: "Weight (tons)", value: a.weightTons },
                            { label: "Ticket #", value: a.ticketNo },
                            { label: "BOL #", value: a.bolNo },
                            {
                              label: "Tier",
                              value: a.autoMapTier
                                ? `Tier ${a.autoMapTier}`
                                : "--",
                            },
                            {
                              label: "Score",
                              value: a.autoMapScore
                                ? `${Math.round(Number(a.autoMapScore) * 100)}%`
                                : "--",
                            },
                            {
                              label: "Photo Status",
                              value: a.photoStatus ?? "missing",
                            },
                            { label: "Assignment ID", value: `#${a.id}` },
                          ].map((field) => (
                            <div key={field.label} className="space-y-1">
                              <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface/30">
                                {field.label}
                              </span>
                              <p className="text-sm text-on-surface font-label">
                                {field.value || (
                                  <span className="text-on-surface/20">--</span>
                                )}
                              </p>
                            </div>
                          ))}
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
  );
}
