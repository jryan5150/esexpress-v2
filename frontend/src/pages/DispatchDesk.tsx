import { useState, useCallback, useMemo, useEffect } from "react";
import { useBreadcrumb } from "../breadcrumbs/useBreadcrumb";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  useWells,
  useDispatchDeskLoads,
  useBulkApprove,
  useValidationConfirm,
  useClaimAssignment,
  useBulkUpdateLoads,
} from "../hooks/use-wells";
import { useMarkEntered, useAdvanceToReady } from "../hooks/use-dispatch-desk";
import { useCurrentUser } from "../hooks/use-auth";
import { usePresence, useHeartbeat } from "../hooks/use-presence";
import { LoadRow } from "../components/LoadRow";
import { PhotoModal } from "../components/PhotoModal";
import { ExpandDrawer } from "../components/ExpandDrawer";
import { Pagination } from "../components/Pagination";
import { Button } from "../components/Button";
import { WellTabBar } from "../components/WellTabBar";
import { BatchActions } from "../components/BatchActions";
import { FilterTabs } from "../components/FilterTabs";
import { useToast } from "../components/Toast";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "../lib/query-client";
import { api } from "../lib/api";
import type { Well } from "../types/api";

export function DispatchDesk() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { track } = useBreadcrumb();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedWellId = searchParams.get("wellId") || "";
  const [pcsStart, setPcsStart] = useState("");
  const [enteredIds, setEnteredIds] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [photoModalLoad, setPhotoModalLoad] = useState<any | null>(null);
  const [expandedLoadId, setExpandedLoadId] = useState<number | null>(null);
  const [dateFilter, setDateFilter] = useState("");
  const [pinnedWellIds, setPinnedWellIds] = useState<string[]>([]);

  const queryClient = useQueryClient();
  const confirmMutation = useValidationConfirm();

  const wellsQuery = useWells();
  const deskQuery = useDispatchDeskLoads(
    selectedWellId
      ? {
          wellId: Number(selectedWellId),
          page,
          limit: pageSize,
          date: dateFilter || undefined,
        }
      : undefined,
  );
  const markEntered = useMarkEntered();
  const advanceToReady = useAdvanceToReady();
  const bulkApprove = useBulkApprove();
  const claimAssignment = useClaimAssignment();
  const bulkUpdate = useBulkUpdateLoads();
  const currentUserQuery = useCurrentUser();
  const currentUserId = (currentUserQuery.data as any)?.id;
  const [batchDate, setBatchDate] = useState("");

  const selectedWell = (wellsQuery.data as any[])?.find(
    (w: any) => String(w.id) === selectedWellId,
  );
  useHeartbeat({
    currentPage: "dispatch",
    wellId: selectedWellId ? Number(selectedWellId) : null,
    wellName: selectedWell?.name ?? null,
  });
  const presenceQuery = usePresence();
  const onlineUsers = Array.isArray(presenceQuery.data)
    ? presenceQuery.data
    : [];
  const usersOnThisWell = selectedWellId
    ? onlineUsers.filter((u: any) => u.wellId === Number(selectedWellId))
    : [];

  const wells: Well[] = Array.isArray(wellsQuery.data) ? wellsQuery.data : [];
  const allLoads =
    deskQuery.data?.items ??
    (Array.isArray(deskQuery.data) ? deskQuery.data : []);

  // Single-pass load categorization (memoized)
  const {
    pendingLoads,
    assignedLoads,
    readyLoads,
    activeLoads,
    filteredLoads,
    filterCounts,
  } = useMemo(() => {
    const pending: typeof allLoads = [];
    const assigned: typeof allLoads = [];
    const reconciled: typeof allLoads = [];
    const ready: typeof allLoads = [];
    const validated: typeof allLoads = [];

    for (const l of allLoads) {
      switch (l.assignmentStatus) {
        case "pending":
          pending.push(l);
          break;
        case "assigned":
          assigned.push(l);
          break;
        case "reconciled":
          reconciled.push(l);
          break;
        case "dispatch_ready":
          ready.push(l);
          break;
        case "dispatched":
        case "delivered":
          validated.push(l);
          break;
      }
    }

    const counts = {
      all: allLoads.length,
      pending: pending.length,
      assigned: assigned.length + reconciled.length,
      reconciled: reconciled.length,
      ready: ready.length,
      validated: validated.length,
      bol_mismatch: allLoads.filter((l) => {
        if (!l.jotformBolNo || !l.bolNo) return false;
        const loadLast4 = l.bolNo.replace(/\D/g, "").slice(-4);
        const jotLast4 = l.jotformBolNo.replace(/\D/g, "").slice(-4);
        return loadLast4.length >= 4 && loadLast4 !== jotLast4;
      }).length,
    };

    const filtered =
      activeFilter === "pending"
        ? pending
        : activeFilter === "assigned"
          ? [...assigned, ...reconciled]
          : activeFilter === "reconciled"
            ? reconciled
            : activeFilter === "ready"
              ? ready
              : activeFilter === "validated"
                ? validated
                : activeFilter === "bol_mismatch"
                  ? allLoads.filter((l) => {
                      if (!l.jotformBolNo || !l.bolNo) return false;
                      const loadLast4 = l.bolNo.replace(/\D/g, "").slice(-4);
                      const jotLast4 = l.jotformBolNo
                        .replace(/\D/g, "")
                        .slice(-4);
                      return loadLast4.length >= 4 && loadLast4 !== jotLast4;
                    })
                  : allLoads;

    return {
      pendingLoads: pending.filter((l) => !enteredIds.has(l.assignmentId)),
      assignedLoads: assigned.filter((l) => !enteredIds.has(l.assignmentId)),
      readyLoads: ready.filter((l) => !enteredIds.has(l.assignmentId)),
      activeLoads: [
        ...ready.filter((l) => !enteredIds.has(l.assignmentId)),
        ...reconciled.filter((l) => !enteredIds.has(l.assignmentId)),
        ...assigned.filter((l) => !enteredIds.has(l.assignmentId)),
        ...pending.filter((l) => !enteredIds.has(l.assignmentId)),
      ],
      filteredLoads: filtered,
      filterCounts: counts,
    };
  }, [allLoads, activeFilter, enteredIds]);

  const getValidationStatus = (
    load: any,
  ): "validated" | "pending" | "missing" => {
    if (
      load.assignmentStatus === "dispatched" ||
      load.assignmentStatus === "delivered"
    )
      return "validated";
    if (!load.ticketNo) return "missing";
    return "pending";
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkValidate = async () => {
    if (!window.confirm(`Validate ${selectedIds.size} selected loads?`)) return;
    const ids = Array.from(selectedIds);
    track("bulk_action", { action: "bulk_validate", count: ids.length });
    try {
      await Promise.all(
        ids.map((id) =>
          api.post("/dispatch/validation/confirm", { assignmentId: id }),
        ),
      );
      toast(`${ids.length} loads validated`, "success");
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: qk.validation.all });
      queryClient.invalidateQueries({ queryKey: qk.assignments.all });
      queryClient.invalidateQueries({ queryKey: qk.wells.all });
    } catch (err) {
      toast(`Validate failed: ${(err as Error).message}`, "error");
    }
  };

  const handleValidateSingle = (assignmentId: number) => {
    confirmMutation.mutate(
      { assignmentId },
      {
        onSuccess: () => {
          toast("Load validated", "success");
          queryClient.invalidateQueries({ queryKey: qk.validation.all });
          queryClient.invalidateQueries({ queryKey: qk.assignments.all });
          queryClient.invalidateQueries({ queryKey: qk.wells.all });
        },
        onError: (err) =>
          toast(`Validate failed: ${(err as Error).message}`, "error"),
      },
    );
  };

  const handleSelectWell = (wellId: string) => {
    setSearchParams(wellId ? { wellId } : {});
    setEnteredIds(new Set());
    setPage(1);
    // Auto-pin on selection
    if (wellId && !pinnedWellIds.includes(wellId)) {
      setPinnedWellIds((prev) => [...prev, wellId]);
    }
  };

  const handleUnpinWell = (wellId: string) => {
    setPinnedWellIds((prev) => prev.filter((id) => id !== wellId));
    // If unpinning the active well, switch to another pinned well or deselect
    if (wellId === selectedWellId) {
      const remaining = pinnedWellIds.filter((id) => id !== wellId);
      setSearchParams(
        remaining.length > 0 ? { wellId: remaining[remaining.length - 1] } : {},
      );
    }
  };

  const handleMarkSingle = (assignmentId: number) => {
    const startNum = parseInt(pcsStart) || 0;
    const idx = readyLoads.findIndex((l) => l.assignmentId === assignmentId);
    markEntered.mutate(
      { assignmentIds: [assignmentId], pcsStartingNumber: startNum + idx },
      {
        onSuccess: () => {
          setEnteredIds((prev) => new Set([...prev, assignmentId]));
          toast(`Load marked as entered`, "success");
        },
        onError: (err) => toast(`Failed: ${(err as Error).message}`, "error"),
      },
    );
  };

  const handleMarkAll = () => {
    if (
      !window.confirm(
        `Mark ${readyLoads.length} loads as entered in PCS? This cannot be undone.`,
      )
    )
      return;
    const ids = readyLoads.map((l) => l.assignmentId);
    track("bulk_action", { action: "mark_entered", count: ids.length });
    const startNum = parseInt(pcsStart) || 0;
    markEntered.mutate(
      { assignmentIds: ids, pcsStartingNumber: startNum },
      {
        onSuccess: () => {
          setEnteredIds((prev) => new Set([...prev, ...ids]));
          toast(`${ids.length} loads marked as entered`, "success");
        },
        onError: (err) =>
          toast(`Bulk mark failed: ${(err as Error).message}`, "error"),
      },
    );
  };

  const handleApproveAll = () => {
    if (!window.confirm(`Approve ${pendingLoads.length} pending loads?`))
      return;
    const ids = pendingLoads.map((l) => l.assignmentId);
    track("bulk_action", { action: "approve_all", count: ids.length });
    bulkApprove.mutate(ids, {
      onSuccess: () => {
        toast(`${ids.length} loads approved`, "success");
      },
      onError: (err) =>
        toast(`Approve failed: ${(err as Error).message}`, "error"),
    });
  };

  const handleAdvanceAll = () => {
    const ids = assignedLoads.map((l) => l.assignmentId);
    advanceToReady.mutate(ids, {
      onSuccess: () => {
        toast(`${ids.length} loads advanced to dispatch ready`, "success");
      },
      onError: (err) =>
        toast(`Advance failed: ${(err as Error).message}`, "error"),
    });
  };

  const handleDownloadZip = async () => {
    const ids = activeLoads.map((l) => l.assignmentId);
    try {
      toast("Preparing photo ZIP...", "info");
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || ""}/api/v1/verification/photos/zip`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("esexpress-token")}`,
          },
          body: JSON.stringify({ assignmentIds: ids }),
        },
      );
      if (!response.ok) throw new Error("ZIP download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dispatch_photos_${selectedWellId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Photos downloaded", "success");
    } catch (err) {
      toast(`ZIP failed: ${(err as Error).message}`, "error");
    }
  };

  // Keyboard shortcuts: Shift+A (approve all), Shift+E (mark entered), Shift+V (validate selected), Esc (clear)
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      // Shift+A: Approve all pending (if on dispatch desk with well selected)
      if (
        e.shiftKey &&
        e.key === "A" &&
        selectedWellId &&
        pendingLoads.length > 0
      ) {
        e.preventDefault();
        handleApproveAll();
      }
      // Shift+E: Mark all entered
      if (
        e.shiftKey &&
        e.key === "E" &&
        selectedWellId &&
        readyLoads.length > 0
      ) {
        e.preventDefault();
        handleMarkAll();
      }
      // Shift+V: Validate selected
      if (e.shiftKey && e.key === "V" && selectedIds.size > 0) {
        e.preventDefault();
        handleBulkValidate();
      }
      // Escape: Clear selection
      if (e.key === "Escape" && selectedIds.size > 0 && !photoModalLoad) {
        setSelectedIds(new Set());
      }
    };
    document.addEventListener("keydown", handleKeyboard);
    return () => document.removeEventListener("keydown", handleKeyboard);
  }, [
    selectedWellId,
    pendingLoads.length,
    readyLoads.length,
    selectedIds.size,
    photoModalLoad,
  ]);

  const wellName = selectedWell?.name ?? "";

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="px-7 pt-5 pb-4 border-b border-outline-variant/40 bg-surface-container-lowest header-gradient shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-primary rounded-sm shrink-0" />
          <div>
            <h1 className="font-headline text-[22px] font-extrabold tracking-tight text-on-surface uppercase leading-tight">
              Dispatch Desk
            </h1>
            <p className="text-[11px] font-medium text-outline tracking-[0.08em] uppercase mt-0.5">
              Clipboard Bridge &nbsp;//&nbsp; Pre-PCS Staging
            </p>
          </div>
        </div>
      </div>

      {/* Pinned Well Tabs */}
      <WellTabBar
        pinnedWellIds={pinnedWellIds}
        selectedWellId={selectedWellId}
        wellStats={((wellsQuery.data as any[]) ?? []).map((w: any) => ({
          id: String(w.id ?? ""),
          name: String(w.name ?? ""),
          totalLoads: Number(w.totalLoads ?? w.total_loads ?? 0),
          dailyTargetLoads: Number(
            w.dailyTargetLoads ?? w.daily_target_loads ?? 0,
          ),
        }))}
        onSelectWell={handleSelectWell}
        onUnpinWell={handleUnpinWell}
      />

      <div className="flex-1 overflow-y-auto px-7 pt-5 pb-6 space-y-4">
        {/* Command Bar */}
        {selectedWellId && (
          <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-[14px] px-[18px] py-3.5 flex items-center gap-3 flex-wrap shadow-sm card-rest">
            {/* Well Picker */}
            <div className="flex items-center gap-[7px] bg-background border border-outline-variant/40 rounded-md px-[11px] py-[7px] cursor-pointer hover:border-primary transition-colors">
              <span className="material-symbols-outlined text-primary text-base">
                oil_barrel
              </span>
              <select
                value={selectedWellId}
                onChange={(e) => handleSelectWell(e.target.value)}
                className="bg-transparent font-label text-[13px] font-medium text-on-surface focus:outline-none cursor-pointer appearance-none pr-4"
              >
                <option value="">Choose well...</option>
                {wells.map((w) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.name}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined text-sm text-outline">
                expand_more
              </span>
            </div>

            {/* PCS Starting # */}
            <div className="flex items-center gap-[7px] bg-background border border-outline-variant/40 rounded-md px-[11px] py-[7px] hover:border-primary transition-colors">
              <span className="material-symbols-outlined text-primary text-base">
                tag
              </span>
              <span className="text-outline text-xs mr-0.5">
                PCS Starting #
              </span>
              <input
                type="number"
                value={pcsStart}
                onChange={(e) => setPcsStart(e.target.value)}
                placeholder="4501"
                className="bg-transparent font-label text-[13px] font-medium text-on-surface focus:outline-none w-16"
              />
            </div>

            {/* Divider */}
            <div className="w-px h-7 bg-outline-variant/40" />

            {/* Presence */}
            <div className="flex items-center gap-1.5 px-1">
              {usersOnThisWell.length > 0 ? (
                usersOnThisWell.map((u: any) => (
                  <div
                    key={u.userId}
                    className="flex items-center gap-1 text-xs font-medium text-on-surface-variant"
                  >
                    <span className="w-2 h-2 rounded-full bg-tertiary shrink-0" />
                    {u.userName?.split(" ")[0] || "User"}
                  </div>
                ))
              ) : (
                <span className="text-xs text-outline">No others online</span>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-7 bg-outline-variant/40" />

            {/* Date Filter */}
            <div className="flex items-center gap-[7px] bg-background border border-outline-variant/40 rounded-md px-[11px] py-[7px] cursor-pointer hover:border-primary transition-colors">
              <span className="material-symbols-outlined text-primary text-base">
                calendar_month
              </span>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  track("filter_changed", {
                    filterType: "date",
                    value: e.target.value,
                  });
                }}
                className="bg-transparent text-[13px] font-medium text-on-surface focus:outline-none cursor-pointer"
              />
              <span className="material-symbols-outlined text-sm text-outline">
                expand_more
              </span>
            </div>

            {/* Spacer */}
            <div className="flex-1 min-w-2" />

            {/* Action Buttons */}
            {assignedLoads.length > 0 && (
              <button
                onClick={handleAdvanceAll}
                disabled={advanceToReady.isPending}
                className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md border border-outline-variant/40 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[15px]">
                  expand_circle_right
                </span>
                Advance All ({assignedLoads.length})
              </button>
            )}
            <button
              onClick={handleDownloadZip}
              disabled={activeLoads.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md border border-outline-variant/40 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[15px]">
                photo_library
              </span>
              Download Photos
            </button>
            <button
              onClick={handleMarkAll}
              disabled={readyLoads.length === 0 || markEntered.isPending}
              className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md bg-primary text-on-primary text-[13px] font-semibold hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-40 accent-glow"
            >
              <span className="material-symbols-outlined text-[15px]">
                check_circle
              </span>
              Mark All Entered ({readyLoads.length})
            </button>
          </div>
        )}

        {/* Filter Tabs */}
        {selectedWellId && (
          <FilterTabs
            activeFilter={activeFilter}
            filterCounts={filterCounts}
            onFilterChange={(filter) => {
              setActiveFilter(filter);
              track("filter_changed", { filterType: "status", value: filter });
            }}
          />
        )}

        {/* Bulk Validate Bar */}
        <BatchActions
          selectedCount={selectedIds.size}
          batchDate={batchDate}
          onBatchDateChange={setBatchDate}
          onValidateSelected={handleBulkValidate}
          onApplyDate={() => {
            if (!batchDate) return;
            const loadIds = filteredLoads
              .filter((l) => selectedIds.has(l.assignmentId))
              .map((l) => l.loadId);
            bulkUpdate.mutate(
              {
                loadIds,
                updates: { deliveredOn: `${batchDate}T12:00:00-05:00` },
              },
              {
                onSuccess: () => {
                  toast(`Date set on ${loadIds.length} loads`, "success");
                  setBatchDate("");
                },
                onError: (err) =>
                  toast(`Failed: ${(err as Error).message}`, "error"),
              },
            );
          }}
          onClearSelection={() => setSelectedIds(new Set())}
          isValidating={confirmMutation.isPending}
          isUpdating={bulkUpdate.isPending}
        />

        {/* Loading State */}
        {deskQuery.isLoading && selectedWellId && (
          <div className="space-y-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="bg-surface-container-lowest border border-outline-variant/40 rounded-[10px] h-11 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Smart Well Picker: No well selected */}
        {!selectedWellId && (
          <div className="space-y-4">
            <h3 className="text-xs uppercase tracking-[0.2em] font-black text-on-surface/40 px-2">
              Pick a Well{" "}
              <span className="text-on-surface/20 font-medium">
                -- showing wells with dispatch-ready or assigned loads
              </span>
            </h3>
            {wellsQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-surface-container-lowest rounded-xl h-20 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {(() => {
                  const wellCards =
                    (
                      wellsQuery.data as
                        | Array<Record<string, unknown>>
                        | undefined
                    )
                      ?.map((w) => ({
                        id: String(w.id ?? ""),
                        name: String(w.name ?? ""),
                        totalLoads: Number(w.totalLoads ?? w.total_loads ?? 0),
                        ready: Number(w.ready ?? 0),
                        assigned: Number(w.assigned ?? 0),
                        dailyTargetLoads: Number(
                          w.dailyTargetLoads ?? w.daily_target_loads ?? 0,
                        ),
                      }))
                      .sort(
                        (a, b) =>
                          b.ready + b.assigned - (a.ready + a.assigned) ||
                          b.totalLoads - a.totalLoads ||
                          a.name.localeCompare(b.name),
                      ) ?? [];

                  // Today's Objectives summary
                  const withTargets = wellCards.filter(
                    (w) => w.dailyTargetLoads > 0,
                  );
                  const totalActual = withTargets.reduce(
                    (s, w) => s + w.totalLoads,
                    0,
                  );
                  const totalTarget = withTargets.reduce(
                    (s, w) => s + w.dailyTargetLoads,
                    0,
                  );
                  const overallPct =
                    totalTarget > 0
                      ? Math.round((totalActual / totalTarget) * 100)
                      : 0;

                  return (
                    <>
                      {withTargets.length > 0 && (
                        <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-[14px] px-5 py-4 shadow-sm card-rest mb-3">
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-primary text-base">
                                target
                              </span>
                              <span className="text-[10px] uppercase tracking-[0.15em] font-black text-on-surface/40">
                                Today's Objectives
                              </span>
                            </div>
                            <span className="font-label text-sm font-bold text-on-surface tabular-nums">
                              {totalActual}/{totalTarget} loads
                              <span className="text-on-surface/30 ml-1.5">
                                ({overallPct}%)
                              </span>
                            </span>
                          </div>
                          <div className="w-full h-2 bg-outline-variant/20 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${overallPct >= 100 ? "bg-tertiary" : overallPct >= 60 ? "bg-primary" : "bg-primary-container"}`}
                              style={{ width: `${Math.min(overallPct, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {wellCards.map((w) => {
                        const pct =
                          w.dailyTargetLoads > 0
                            ? Math.round(
                                (w.totalLoads / w.dailyTargetLoads) * 100,
                              )
                            : null;
                        return (
                          <button
                            key={w.id}
                            onClick={() => handleSelectWell(w.id)}
                            className={`w-full bg-surface-container-lowest border border-outline-variant/40 hover:border-primary/20 hover:shadow-md rounded-[10px] px-5 py-3.5 flex items-center justify-between transition-all cursor-pointer group text-left shadow-sm border-l-4 hover-lift press-scale ${w.ready > 0 ? "border-l-tertiary" : w.assigned > 0 ? "border-l-primary-container" : "border-l-outline-variant/40"}`}
                          >
                            <div className="flex items-center gap-4 min-w-0 flex-1 mr-4">
                              <div className="min-w-0 flex-1">
                                <h4 className="font-headline font-bold text-on-surface text-lg group-hover:text-primary-container transition-colors">
                                  {w.name}
                                </h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="font-label text-xs text-on-surface/35 tracking-wide tabular-nums">
                                    {w.totalLoads}
                                    {pct !== null
                                      ? `/${w.dailyTargetLoads}`
                                      : ""}{" "}
                                    loads
                                  </span>
                                  {pct !== null && (
                                    <span
                                      className={`font-label text-[10px] font-bold tabular-nums ${pct >= 100 ? "text-tertiary" : pct >= 60 ? "text-primary" : "text-on-surface/40"}`}
                                    >
                                      ({pct}%)
                                    </span>
                                  )}
                                </div>
                                {pct !== null && (
                                  <div className="w-full max-w-[180px] h-1.5 bg-outline-variant/20 rounded-full overflow-hidden mt-1.5">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? "bg-tertiary" : pct >= 60 ? "bg-primary" : "bg-primary-container"}`}
                                      style={{
                                        width: `${Math.min(pct, 100)}%`,
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-5">
                              {w.ready > 0 && (
                                <div className="text-right bg-tertiary/5 px-3 py-1.5 rounded-lg">
                                  <span className="font-label text-lg font-bold text-tertiary leading-none tabular-nums">
                                    {w.ready}
                                  </span>
                                  <span className="text-[9px] uppercase font-bold text-tertiary/60 block tracking-wider mt-0.5">
                                    Ready
                                  </span>
                                </div>
                              )}
                              {w.assigned > 0 && (
                                <div className="text-right bg-primary-container/5 px-3 py-1.5 rounded-lg">
                                  <span className="font-label text-lg font-bold text-primary-container leading-none tabular-nums">
                                    {w.assigned}
                                  </span>
                                  <span className="text-[9px] uppercase font-bold text-primary-container/60 block tracking-wider mt-0.5">
                                    Assigned
                                  </span>
                                </div>
                              )}
                              <span className="material-symbols-outlined text-on-surface/15 group-hover:text-primary-container group-hover:translate-x-1 transition-all">
                                chevron_right
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </>
                  );
                })()}
                {wells.length === 0 && (
                  <div className="bg-surface-container-lowest rounded-xl p-12 text-center">
                    <span className="material-symbols-outlined text-4xl text-on-surface/10 mb-2">
                      oil_barrel
                    </span>
                    <p className="text-on-surface/30 font-label text-sm">
                      No wells with loads found
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty State: Well selected but no loads */}
        {selectedWellId && allLoads.length === 0 && !deskQuery.isLoading && (
          <div className="bg-surface-container-lowest rounded-xl p-16 flex items-center justify-center">
            <div className="text-center space-y-4">
              <span className="material-symbols-outlined text-5xl text-on-surface/10">
                check_circle
              </span>
              <p className="text-sm text-on-surface/30 font-headline font-bold uppercase tracking-widest">
                No loads for this well
              </p>
              <p className="text-xs text-on-surface/20 font-label">
                Loads need to be validated first. Check the Validation page.
              </p>
            </div>
          </div>
        )}

        {/* Column Headers */}
        {selectedWellId && filteredLoads.length > 0 && (
          <div
            className="grid items-center gap-3 px-3.5 pb-1.5"
            style={{
              gridTemplateColumns:
                "28px 90px 120px 1fr 64px 110px 110px 86px 120px",
            }}
          >
            <div />
            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline">
              Status
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline">
              Load #
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline">
              Driver
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline text-right">
              Weight
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline">
              BOL / Truck
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline">
              Ticket
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-outline text-right">
              Date
            </span>
            <div />
          </div>
        )}

        {/* Filtered Load List */}
        {selectedWellId && filteredLoads.length > 0 && (
          <div className="space-y-1.5">
            {filteredLoads.map((load) => (
              <div key={load.assignmentId}>
                <LoadRow
                  assignmentId={load.assignmentId}
                  loadNo={load.loadNo}
                  driverName={load.driverName}
                  carrierName={load.carrierName}
                  weightTons={load.weightTons}
                  bolNo={load.bolNo}
                  truckNo={load.truckNo}
                  ticketNo={load.ticketNo}
                  bolMatchStatus={
                    load.jotformBolNo && load.bolNo
                      ? load.bolNo.replace(/\D/g, "").slice(-4) ===
                          load.jotformBolNo.replace(/\D/g, "").slice(-4) &&
                        load.bolNo.replace(/\D/g, "").slice(-4).length >= 4
                        ? "match"
                        : "mismatch"
                      : null
                  }
                  deliveredOn={load.deliveredOn}
                  validationStatus={getValidationStatus(load)}
                  checked={selectedIds.has(load.assignmentId)}
                  entered={enteredIds.has(load.assignmentId)}
                  canEnter={load.canEnter}
                  hasPhotos={!!load.photoUrls?.length}
                  assignedToName={load.assignedToName ?? null}
                  assignedToColor={load.assignedToColor ?? null}
                  onToggleSelect={() => toggleSelect(load.assignmentId)}
                  onMarkEntered={() => handleMarkSingle(load.assignmentId)}
                  onValidate={() => handleValidateSingle(load.assignmentId)}
                  onViewPhotos={() => setPhotoModalLoad(load)}
                  onRowClick={() => {
                    const nextId =
                      expandedLoadId === load.assignmentId
                        ? null
                        : load.assignmentId;
                    setExpandedLoadId(nextId);
                    if (nextId !== null)
                      track("load_expanded", { loadId: load.assignmentId });
                  }}
                  onClaim={
                    currentUserId && !load.assignedTo
                      ? () =>
                          claimAssignment.mutate({
                            assignmentId: load.assignmentId,
                            userId: currentUserId,
                          })
                      : undefined
                  }
                  isPending={markEntered.isPending}
                />
                {expandedLoadId === load.assignmentId && (
                  <ExpandDrawer
                    loadId={load.loadId}
                    loadNo={load.loadNo}
                    wellName={load.wellName}
                    driverName={load.driverName}
                    truckNo={load.truckNo}
                    carrierName={load.carrierName}
                    productDescription={load.productDescription}
                    weightTons={load.weightTons}
                    netWeightTons={load.netWeightTons}
                    bolNo={load.bolNo}
                    ticketNo={load.ticketNo}
                    rate={load.rate ?? null}
                    mileage={load.mileage ?? null}
                    deliveredOn={load.deliveredOn}
                    photoUrls={load.photoUrls || []}
                    autoMapScore={load.autoMapScore}
                    autoMapTier={load.autoMapTier}
                    assignmentStatus={load.assignmentStatus}
                    pickupTime={load.pickupTime}
                    arrivalTime={load.arrivalTime}
                    transitTime={load.transitTime}
                    assignedTime={load.assignedTime}
                    acceptedTime={load.acceptedTime}
                    grossWeightLbs={load.grossWeightLbs}
                    netWeightLbs={load.netWeightLbs}
                    tareWeightLbs={load.tareWeightLbs}
                    terminalName={load.terminalName}
                    lineHaul={load.lineHaul}
                    fuelSurcharge={load.fuelSurcharge}
                    totalCharge={load.totalCharge}
                    customerRate={load.customerRate}
                    orderNo={load.orderNo}
                    invoiceNo={load.invoiceNo}
                    poNo={load.poNo}
                    referenceNo={load.referenceNo}
                    loaderName={load.loaderName}
                    jobName={load.jobName}
                    loadStatus={load.loadStatus}
                    demurrageAtLoader={load.demurrageAtLoader}
                    demurrageAtLoaderHours={load.demurrageAtLoaderHours}
                    demurrageAtLoaderMinutes={load.demurrageAtLoaderMinutes}
                    demurrageAtDestination={load.demurrageAtDestination}
                    demurrageAtDestHours={load.demurrageAtDestHours}
                    demurrageAtDestMinutes={load.demurrageAtDestMinutes}
                    loadOutTime={load.loadOutTime}
                    loadTotalTime={load.loadTotalTime}
                    unloadTotalTime={load.unloadTotalTime}
                    appointmentTime={load.appointmentTime}
                    settlementDate={load.settlementDate}
                    shipperBol={load.shipperBol}
                    dispatcherNotes={load.dispatcherNotes}
                    jotformBolNo={load.jotformBolNo}
                    jotformDriverName={load.jotformDriverName}
                    onValidate={() => handleValidateSingle(load.assignmentId)}
                    onClose={() => setExpandedLoadId(null)}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Photo Modal */}
        {photoModalLoad && (
          <PhotoModal
            photoUrls={photoModalLoad.photoUrls || []}
            loadId={photoModalLoad.loadId}
            loadNo={photoModalLoad.loadNo}
            wellName={photoModalLoad.wellName}
            bolNo={photoModalLoad.bolNo}
            driverName={photoModalLoad.driverName}
            truckNo={photoModalLoad.truckNo}
            carrierName={photoModalLoad.carrierName}
            weightTons={photoModalLoad.weightTons}
            ticketNo={photoModalLoad.ticketNo}
            autoMapScore={photoModalLoad.autoMapScore || null}
            onClose={() => setPhotoModalLoad(null)}
            onValidate={() => {
              handleValidateSingle(photoModalLoad.assignmentId);
              setPhotoModalLoad(null);
            }}
          />
        )}

        {/* Pagination */}
        {selectedWellId && allLoads.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={(deskQuery.data as any)?.total ?? allLoads.length}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            loading={deskQuery.isLoading}
          />
        )}

        {/* Completion Summary */}
        {selectedWellId &&
          enteredIds.size > 0 &&
          enteredIds.size === readyLoads.length + enteredIds.size && (
            <div className="bg-tertiary/10 border border-tertiary/20 rounded-xl p-8 text-center space-y-4">
              <span className="material-symbols-outlined text-5xl text-tertiary">
                task_alt
              </span>
              <h3 className="font-headline font-bold text-xl text-tertiary">
                All Loads Entered
              </h3>
              <p className="text-sm text-on-surface/60">
                {enteredIds.size} loads marked as entered in PCS for {wellName}
              </p>
              <div className="flex justify-center gap-4 pt-2">
                <Button
                  variant="ghost"
                  icon="arrow_back"
                  onClick={() => navigate("/")}
                >
                  Back to Feed
                </Button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
