import { useState, useCallback, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  useWells,
  useDispatchDeskLoads,
  useBulkApprove,
  useValidationConfirm,
} from "../hooks/use-wells";
import { useMarkEntered, useAdvanceToReady } from "../hooks/use-dispatch-desk";
import { usePresence, useHeartbeat } from "../hooks/use-presence";
import { DispatchCard } from "../components/DispatchCard";
import { PhotoModal } from "../components/PhotoModal";
import { Pagination } from "../components/Pagination";
import { Button } from "../components/Button";
import { useToast } from "../components/Toast";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "../lib/query-client";
import { api } from "../lib/api";
import type { Well } from "../types/api";

export function DispatchDesk() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedWellId = searchParams.get("wellId") || "";
  const [pcsStart, setPcsStart] = useState("");
  const [enteredIds, setEnteredIds] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [photoModalLoad, setPhotoModalLoad] = useState<any | null>(null);
  const [dateFilter, setDateFilter] = useState("");

  const queryClient = useQueryClient();
  const confirmMutation = useValidationConfirm();

  const wellsQuery = useWells();
  const deskQuery = useDispatchDeskLoads(
    selectedWellId
      ? { wellId: Number(selectedWellId), page, limit: pageSize }
      : undefined,
  );
  const markEntered = useMarkEntered();
  const advanceToReady = useAdvanceToReady();
  const bulkApprove = useBulkApprove();

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
      assigned: assigned.length,
      ready: ready.length,
      validated: validated.length,
    };

    const filtered =
      activeFilter === "pending"
        ? pending
        : activeFilter === "assigned"
          ? assigned
          : activeFilter === "ready"
            ? ready
            : activeFilter === "validated"
              ? validated
              : allLoads;

    return {
      pendingLoads: pending.filter((l) => !enteredIds.has(l.assignmentId)),
      assignedLoads: assigned.filter((l) => !enteredIds.has(l.assignmentId)),
      readyLoads: ready.filter((l) => !enteredIds.has(l.assignmentId)),
      activeLoads: [
        ...ready.filter((l) => !enteredIds.has(l.assignmentId)),
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
    const ids = Array.from(selectedIds);
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
    const ids = readyLoads.map((l) => l.assignmentId);
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
    const ids = pendingLoads.map((l) => l.assignmentId);
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

  const wellName = selectedWell?.name ?? "";

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="border-l-4 border-primary-container pl-5">
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={() => navigate("/")}
              className="text-on-surface/30 hover:text-primary-container transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-lg">
                arrow_back
              </span>
            </button>
            <h1 className="text-3xl font-headline font-black tracking-tight text-on-surface uppercase">
              Dispatch Desk
            </h1>
          </div>
          <p className="text-on-surface/25 font-label text-xs uppercase tracking-[0.2em] ml-8">
            Clipboard Bridge // Pre-PCS Staging
          </p>
        </div>
      </div>

      {/* Well Selector + PCS Start */}
      <div className="bg-surface-container-low rounded-xl p-6 space-y-4 border border-on-surface/5">
        <div className="flex flex-wrap items-end gap-6">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-label font-bold uppercase tracking-[0.15em] text-on-surface/35 mb-2">
              Select Well
            </label>
            <div className="relative">
              <span className="material-symbols-outlined text-on-surface/25 absolute left-3 top-1/2 -translate-y-1/2 text-lg pointer-events-none">
                oil_barrel
              </span>
              <select
                value={selectedWellId}
                onChange={(e) => handleSelectWell(e.target.value)}
                className="w-full bg-surface-container-high border border-on-surface/10 rounded-lg pl-10 pr-4 py-3 text-sm text-on-surface font-headline font-semibold focus:outline-none focus:border-primary-container/50 focus:ring-1 focus:ring-primary-container/30 appearance-none cursor-pointer"
              >
                <option value="">Choose a well...</option>
                {wells.map((w) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="w-48">
            <label className="block text-[10px] font-label font-bold uppercase tracking-[0.15em] text-on-surface/35 mb-2">
              PCS Starting #
            </label>
            <input
              type="number"
              value={pcsStart}
              onChange={(e) => setPcsStart(e.target.value)}
              placeholder="e.g. 229040"
              className="w-full bg-surface-container-high border border-on-surface/10 rounded-lg px-4 py-3 text-sm text-on-surface font-label focus:outline-none focus:border-primary-container/50 focus:ring-1 focus:ring-primary-container/30"
            />
          </div>
        </div>

        {selectedWellId && (
          <>
            {/* Well name + presence + actions */}
            <div className="flex items-center justify-between pt-3 border-t border-on-surface/5">
              <div className="flex items-center gap-4">
                <span className="font-headline font-bold text-on-surface text-lg">
                  {wellName}
                </span>
                {usersOnThisWell.length > 0 && (
                  <div className="flex items-center gap-2 bg-surface-container-high/50 px-3 py-1 rounded-full">
                    {usersOnThisWell.map((u: any) => (
                      <div key={u.userId} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-tertiary shadow-[0_0_6px_rgba(13,150,104,0.5)]" />
                        <span className="text-xs text-on-surface/70 font-label">
                          {u.userName?.split(" ")[0] || "User"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-surface-container-high rounded-lg px-3 py-2">
                  <span className="material-symbols-outlined text-on-surface/40 text-sm">
                    calendar_today
                  </span>
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="bg-transparent text-xs font-label text-on-surface/70 focus:outline-none cursor-pointer"
                  />
                </div>
                {assignedLoads.length > 0 && (
                  <Button
                    variant="secondary"
                    icon="upgrade"
                    onClick={handleAdvanceAll}
                    disabled={advanceToReady.isPending}
                  >
                    Advance All ({assignedLoads.length})
                  </Button>
                )}
                <Button
                  variant="secondary"
                  icon="folder_zip"
                  onClick={handleDownloadZip}
                  disabled={activeLoads.length === 0}
                >
                  Download Photos
                </Button>
                <Button
                  variant="primary"
                  icon="done_all"
                  onClick={handleMarkAll}
                  disabled={readyLoads.length === 0 || markEntered.isPending}
                >
                  Mark All Entered ({readyLoads.length})
                </Button>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center justify-between bg-surface-container-high/40 rounded-lg p-1">
              <div className="flex gap-0.5">
                {(
                  ["all", "pending", "assigned", "ready", "validated"] as const
                ).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wide transition-all cursor-pointer ${
                      activeFilter === filter
                        ? "bg-surface-container-lowest text-primary-container shadow-sm"
                        : "text-on-surface/40 hover:text-on-surface/60"
                    }`}
                  >
                    {filter}{" "}
                    <span className="font-label opacity-60">
                      {filterCounts[filter]}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4 text-[10px] text-on-surface/40 font-label pr-2">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-tertiary" />
                  {filterCounts.validated} validated
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-primary-container" />
                  {filterCounts.ready} ready
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-on-surface/20" />
                  {filterCounts.pending} pending
                </span>
              </div>
            </div>

            {/* Bulk validate bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 pt-3 border-t border-on-surface/5">
                <button
                  onClick={handleBulkValidate}
                  disabled={confirmMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-tertiary/10 text-tertiary hover:bg-tertiary/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">
                    verified
                  </span>
                  Validate Selected ({selectedIds.size})
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-on-surface/40 hover:text-on-surface/60 cursor-pointer"
                >
                  Clear selection
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Loading State */}
      {deskQuery.isLoading && selectedWellId && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-surface-container-lowest rounded-xl h-48 animate-pulse"
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
              {(wellsQuery.data as Array<Record<string, unknown>> | undefined)
                ?.map((w) => ({
                  id: String(w.id ?? ""),
                  name: String(w.name ?? ""),
                  totalLoads: Number(w.totalLoads ?? w.total_loads ?? 0),
                  ready: Number(w.ready ?? 0),
                  assigned: Number(w.assigned ?? 0),
                }))
                .filter((w) => w.totalLoads > 0)
                .sort(
                  (a, b) =>
                    b.ready + b.assigned - (a.ready + a.assigned) ||
                    b.totalLoads - a.totalLoads,
                )
                .map((w) => (
                  <button
                    key={w.id}
                    onClick={() => handleSelectWell(w.id)}
                    className={`w-full bg-surface-container-lowest hover:bg-surface-container-high rounded-xl p-5 flex items-center justify-between transition-all cursor-pointer group border border-on-surface/5 text-left hover-lift border-l-4 ${w.ready > 0 ? "border-l-tertiary" : w.assigned > 0 ? "border-l-primary-container" : "border-l-on-surface/10"}`}
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <h4 className="font-headline font-bold text-on-surface text-lg group-hover:text-primary-container transition-colors">
                          {w.name}
                        </h4>
                        <span className="font-label text-xs text-on-surface/35 tracking-wide">
                          {w.totalLoads} total loads
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-5">
                      {w.ready > 0 && (
                        <div className="text-right bg-tertiary/5 px-3 py-1.5 rounded-lg">
                          <span className="font-label text-lg font-bold text-tertiary leading-none">
                            {w.ready}
                          </span>
                          <span className="text-[9px] uppercase font-bold text-tertiary/60 block tracking-wider mt-0.5">
                            Ready
                          </span>
                        </div>
                      )}
                      {w.assigned > 0 && (
                        <div className="text-right bg-primary-container/5 px-3 py-1.5 rounded-lg">
                          <span className="font-label text-lg font-bold text-primary-container leading-none">
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
                ))}
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

      {/* Filtered Load List */}
      {selectedWellId && filteredLoads.length > 0 && (
        <div className="space-y-3">
          {filteredLoads.map((load, idx) => {
            const validationStatus = getValidationStatus(load);
            const isValidated = validationStatus === "validated";
            const isMissing = validationStatus === "missing";
            return (
              <div
                key={load.assignmentId}
                className={`relative transition-opacity duration-200 ${!isValidated && !enteredIds.has(load.assignmentId) ? "opacity-60" : ""}`}
              >
                {/* Validation badge overlay */}
                <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(load.assignmentId)}
                    onChange={() => toggleSelect(load.assignmentId)}
                    disabled={isMissing}
                    className="w-4 h-4 rounded border-on-surface/20 accent-primary-container cursor-pointer"
                  />
                  <div
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      isValidated
                        ? "bg-tertiary/10 text-tertiary"
                        : isMissing
                          ? "bg-error/10 text-error"
                          : "bg-primary-container/10 text-primary-container"
                    }`}
                  >
                    <span
                      className="material-symbols-outlined text-xs"
                      style={{
                        fontVariationSettings: isValidated
                          ? "'FILL' 1"
                          : "'FILL' 0",
                      }}
                    >
                      {isValidated
                        ? "verified"
                        : isMissing
                          ? "warning"
                          : "schedule"}
                    </span>
                    {isValidated
                      ? "Validated"
                      : isMissing
                        ? "Missing Ticket"
                        : "Pending"}
                  </div>
                </div>

                <DispatchCard
                  loadNo={load.loadNo}
                  pcsNumber={
                    activeFilter === "ready" && pcsStart
                      ? parseInt(pcsStart) + idx
                      : null
                  }
                  driverName={load.driverName}
                  truckNo={load.truckNo}
                  carrierName={load.carrierName}
                  productDescription={load.productDescription}
                  weightTons={load.weightTons}
                  bolNo={load.bolNo}
                  ticketNo={load.ticketNo}
                  wellName={load.wellName}
                  photoStatus={load.photoStatus}
                  canEnter={load.canEnter}
                  entered={enteredIds.has(load.assignmentId)}
                  onMarkEntered={() => handleMarkSingle(load.assignmentId)}
                  isPending={markEntered.isPending}
                  loadId={load.loadId}
                  deliveredOn={load.deliveredOn}
                  photoUrls={(load as any).photoUrls}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Photo Modal */}
      {photoModalLoad && (
        <PhotoModal
          photoUrls={photoModalLoad.photoUrls || []}
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
  );
}
