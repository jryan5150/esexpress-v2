import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useWells, useDispatchDeskLoads } from "../hooks/use-wells";
import { useMarkEntered, useAdvanceToReady } from "../hooks/use-dispatch-desk";
import { DispatchCard } from "../components/DispatchCard";
import { Button } from "../components/Button";
import { useToast } from "../components/Toast";
import type { Well } from "../types/api";

export function DispatchDesk() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedWellId = searchParams.get("wellId") || "";
  const [pcsStart, setPcsStart] = useState("");
  const [enteredIds, setEnteredIds] = useState<Set<number>>(new Set());

  const wellsQuery = useWells();
  const deskQuery = useDispatchDeskLoads(
    selectedWellId ? { wellId: Number(selectedWellId) } : undefined,
  );
  const markEntered = useMarkEntered();
  const advanceToReady = useAdvanceToReady();

  const wells: Well[] = Array.isArray(wellsQuery.data) ? wellsQuery.data : [];
  const allLoads =
    deskQuery.data?.items ??
    (Array.isArray(deskQuery.data) ? deskQuery.data : []);

  // Split loads by status for display
  const assignedLoads = allLoads.filter(
    (l) => l.assignmentStatus === "assigned" && !enteredIds.has(l.assignmentId),
  );
  const readyLoads = allLoads.filter(
    (l) =>
      l.assignmentStatus === "dispatch_ready" &&
      !enteredIds.has(l.assignmentId),
  );
  const activeLoads = [...readyLoads, ...assignedLoads];

  const handleSelectWell = (wellId: string) => {
    setSearchParams(wellId ? { wellId } : {});
    setEnteredIds(new Set());
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

  const selectedWell = wells.find((w) => String(w.id) === selectedWellId);
  const wellName = selectedWell?.name ?? "";

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={() => navigate("/")}
              className="text-on-surface/40 hover:text-primary-container transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-lg">
                arrow_back
              </span>
            </button>
            <h1 className="text-2xl font-headline font-extrabold text-on-surface tracking-tight uppercase">
              Dispatch Desk
            </h1>
          </div>
          <p className="text-on-surface/40 font-label text-xs uppercase tracking-widest ml-8">
            Clipboard Bridge // Pre-PCS Staging
          </p>
        </div>
      </div>

      {/* Well Selector + PCS Start */}
      <div className="bg-surface-container-low rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-end gap-6">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface/40 mb-2">
              Select Well
            </label>
            <select
              value={selectedWellId}
              onChange={(e) => handleSelectWell(e.target.value)}
              className="w-full bg-surface-container-high border border-on-surface/10 rounded-lg px-4 py-3 text-sm text-on-surface font-headline focus:outline-none focus:border-primary-container/50 focus:ring-1 focus:ring-primary-container/30 appearance-none cursor-pointer"
            >
              <option value="">Choose a well...</option>
              {wells.map((w) => (
                <option key={w.id} value={String(w.id)}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="w-48">
            <label className="block text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface/40 mb-2">
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
          <div className="flex items-center justify-between pt-2 border-t border-on-surface/5">
            <div className="flex items-center gap-4">
              <span className="font-headline font-bold text-on-surface text-lg">
                {wellName}
              </span>
              <span className="font-label text-sm text-on-surface/50">
                {readyLoads.length} ready &middot; {assignedLoads.length}{" "}
                assigned &middot; {enteredIds.size} entered
              </span>
            </div>
            <div className="flex gap-3">
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

      {/* Empty State: No well selected */}
      {!selectedWellId && (
        <div className="bg-surface-container-lowest rounded-xl p-16 flex items-center justify-center">
          <div className="text-center space-y-4">
            <span className="material-symbols-outlined text-5xl text-on-surface/10">
              oil_barrel
            </span>
            <p className="text-sm text-on-surface/30 font-headline font-bold uppercase tracking-widest">
              Select a well to load dispatch cards
            </p>
          </div>
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

      {/* Assigned loads section (need to advance to dispatch_ready) */}
      {assignedLoads.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs uppercase tracking-[0.2em] font-black text-on-surface/40">
              Assigned{" "}
              <span className="text-primary-container">
                needs advance to dispatch ready
              </span>
            </h3>
            <Button
              variant="secondary"
              icon="upgrade"
              onClick={handleAdvanceAll}
              disabled={advanceToReady.isPending}
            >
              Advance All ({assignedLoads.length})
            </Button>
          </div>
          <div className="space-y-4">
            {assignedLoads.map((load, idx) => (
              <DispatchCard
                key={load.assignmentId}
                loadNo={load.loadNo}
                pcsNumber={null}
                driverName={load.driverName}
                truckNo={load.truckNo}
                carrierName={load.carrierName}
                productDescription={load.productDescription}
                weightTons={load.weightTons}
                bolNo={load.bolNo}
                ticketNo={load.ticketNo}
                wellName={load.wellName}
                photoStatus={load.photoStatus}
                canEnter={false}
                entered={false}
                onMarkEntered={() => {}}
                isPending={false}
                loadId={load.loadId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Dispatch Ready loads (can be marked as entered) */}
      {readyLoads.length > 0 && (
        <div className="space-y-3">
          {assignedLoads.length > 0 && (
            <div className="px-2">
              <h3 className="text-xs uppercase tracking-[0.2em] font-black text-on-surface/40">
                Dispatch Ready{" "}
                <span className="text-tertiary">ready for PCS entry</span>
              </h3>
            </div>
          )}
          <div className="space-y-4">
            {readyLoads.map((load, idx) => (
              <DispatchCard
                key={load.assignmentId}
                loadNo={load.loadNo}
                pcsNumber={pcsStart ? parseInt(pcsStart) + idx : null}
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
              />
            ))}
          </div>
        </div>
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
