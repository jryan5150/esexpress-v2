import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useCurrentUser } from "../hooks/use-auth";
import { useHeartbeat } from "../hooks/use-presence";
import { useBulkConfirm } from "../hooks/use-workbench";
import { WorksurfaceTopStrip } from "../components/WorksurfaceTopStrip";
import { UserHighlightStrip } from "../components/UserHighlightStrip";
import { WellGrid } from "../components/WellGrid";
import { InboxSection } from "../components/InboxSection";
import { TodayIntakeSection } from "../components/TodayIntakeSection";
import { JennyQueueSection } from "../components/JennyQueueSection";
import { WorkbenchDrawer } from "../components/WorkbenchDrawer";

interface CellContextPayload {
  wellId: number;
  wellName: string;
  billTo: string | null;
  loadCount: number;
  derivedStatus: string;
  assignmentIds: number[];
}
interface WellGridResponse {
  weekStart: string;
  weekEnd: string;
  rows: Array<{
    wellId: number;
    wellName: string;
    billTo: string | null;
    days: Array<{
      dow: number;
      loadCount: number;
      derivedStatus: string;
    } | null>;
  }>;
}

interface Customer {
  id: number;
  name: string;
}

const HIGHLIGHT_STORAGE_KEY = "worksurface.highlight";

export function Workbench() {
  useHeartbeat({ currentPage: "workbench" });
  const [searchParams, setSearchParams] = useSearchParams();
  const userQuery = useCurrentUser();
  const me = userQuery.data;

  // Fetch customers for the highlight strip + user→customer mapping
  const customersQuery = useQuery({
    queryKey: ["worksurface", "customers"],
    queryFn: () =>
      api
        .get<{ customers: Customer[] }>("/diag/customers")
        .then((r) => r.customers),
    staleTime: 5 * 60_000,
  });
  const customers = customersQuery.data ?? [];

  // Fetch builder-routing to find current user's primary customer
  const routingQuery = useQuery({
    queryKey: ["worksurface", "routing"],
    queryFn: () =>
      api
        .get<{
          matrix: Array<{
            builder: string;
            customerId: number | null;
            isPrimary: boolean;
          }>;
        }>("/diag/builder-matrix")
        .then((r) => r.matrix),
    staleTime: 5 * 60_000,
  });
  const myCustomerId = useMemo(() => {
    const builders = routingQuery.data ?? [];
    const myBuilderName = (me?.email ?? "").split("@")[0]; // e.g., "scout" from "scout@..."
    const match = builders.find(
      (b) =>
        b.isPrimary && b.builder.toLowerCase() === myBuilderName.toLowerCase(),
    );
    return match?.customerId ?? null;
  }, [routingQuery.data, me]);

  // URL state — week, highlight
  const weekStart = searchParams.get("week") ?? undefined;
  const urlHighlight = searchParams.get("highlight");

  // Highlight state — URL > localStorage > customer-default > "all"
  const [highlight, setHighlight] = useState<number | "all" | "mine_only">(
    () => {
      if (urlHighlight === "all" || urlHighlight === "mine_only")
        return urlHighlight;
      if (urlHighlight && /^\d+$/.test(urlHighlight))
        return parseInt(urlHighlight, 10);
      const stored = localStorage.getItem(HIGHLIGHT_STORAGE_KEY);
      if (stored === "all" || stored === "mine_only") return stored;
      if (stored && /^\d+$/.test(stored)) return parseInt(stored, 10);
      return "all"; // default until myCustomerId loads
    },
  );

  // Apply customer-default once on first load if no URL/localStorage state
  useEffect(() => {
    if (urlHighlight) return;
    if (localStorage.getItem(HIGHLIGHT_STORAGE_KEY)) return;
    if (myCustomerId != null) setHighlight(myCustomerId);
  }, [myCustomerId, urlHighlight]);

  // Persist highlight changes to localStorage
  useEffect(() => {
    localStorage.setItem(HIGHLIGHT_STORAGE_KEY, String(highlight));
  }, [highlight]);

  const handleHighlight = (next: number | "all" | "mine_only") => {
    setHighlight(next);
    const sp = new URLSearchParams(searchParams);
    sp.set("highlight", String(next));
    setSearchParams(sp);
  };

  // Inbox customer filter — Jess (admin manager) sees everything;
  // builders see only their primary customer
  const inboxCustomerIds = useMemo(() => {
    if (
      me?.role === "admin" &&
      (me.email?.startsWith("jryan") || me.email?.startsWith("jess"))
    ) {
      return [] as number[]; // manager view
    }
    return myCustomerId != null ? [myCustomerId] : [];
  }, [me, myCustomerId]);

  // Cell-click → drawer (drawer wiring lands in Task 4)
  const [openCell, setOpenCell] = useState<{
    wellId: number;
    dow: number;
  } | null>(null);
  const handleCellClick = (wellId: number, dow: number) => {
    setOpenCell({ wellId, dow });
    // Drawer mount happens in Task 4
  };
  const handleBadgeClick = (wellId: number, dow: number) => {
    // Flag + open drawer — wired in Task 4
    setOpenCell({ wellId, dow });
  };

  // Look up the active cell's context once openCell is set. Direct-typed
  // unwrap pattern: api.get<T>(url) already returns the envelope's data
  // payload (api.ts request() unwraps json.data), so we type T to match
  // that inner shape, NOT the {success, data} envelope.
  const qc = useQueryClient();
  const bulkConfirmMutation = useBulkConfirm();
  const [confirmResult, setConfirmResult] = useState<string | null>(null);

  // Effective weekStart for queries: use URL ?week if present, else compute
  // current Sunday in Chicago (matches backend default).
  const effectiveWeekStart = useMemo(() => {
    if (weekStart) return weekStart;
    const today = new Date();
    const dow = today.getDay(); // 0=Sun
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dow);
    return sunday.toISOString().slice(0, 10);
  }, [weekStart]);

  const cellContextQuery = useQuery({
    queryKey: [
      "worksurface",
      "cell-context",
      openCell?.wellId,
      openCell?.dow,
      effectiveWeekStart,
    ],
    queryFn: async (): Promise<CellContextPayload | null> => {
      if (!openCell) return null;
      // Get cell summary from grid (well name + bill to + count + derived status)
      const grid = await api.get<WellGridResponse>(
        `/diag/well-grid?weekStart=${effectiveWeekStart}`,
      );
      const row = grid.rows.find((x) => x.wellId === openCell.wellId);
      if (!row) return null;
      const cell = row.days[openCell.dow];
      // Get cell loads (assignmentIds) from the dedicated endpoint
      const cellDetail = await api.get<{
        assignmentIds: number[];
        loadCount: number;
      }>(
        `/diag/well-grid/cell?wellId=${openCell.wellId}&dow=${openCell.dow}&weekStart=${effectiveWeekStart}`,
      );
      return {
        wellId: row.wellId,
        wellName: row.wellName,
        billTo: row.billTo,
        loadCount: cell?.loadCount ?? cellDetail.loadCount,
        derivedStatus: cell?.derivedStatus ?? "unknown",
        assignmentIds: cellDetail.assignmentIds,
      };
    },
    enabled: !!openCell,
    staleTime: 30_000,
  });

  // Real Confirm action: bulk-advance the cell's assignments, then
  // invalidate the well-grid so the cell re-renders with updated status
  // (laggard-wins rule will tick the cell's color forward as soon as the
  // last load advances past 'pending').
  const handleConfirm = async () => {
    if (!cellContextQuery.data) return;
    const ids = cellContextQuery.data.assignmentIds;
    if (ids.length === 0) {
      setConfirmResult("No assignments to advance.");
      return;
    }
    setConfirmResult(null);
    try {
      const res = (await bulkConfirmMutation.mutateAsync({
        assignmentIds: ids,
        notes: `worksurface confirm: ${cellContextQuery.data.wellName} day ${openCell?.dow}`,
      })) as {
        results: Array<{ id: number; ok: boolean; error?: string }>;
      };
      const okCount = res.results.filter((r) => r.ok).length;
      const failCount = res.results.length - okCount;
      setConfirmResult(
        failCount === 0
          ? `Confirmed ${okCount} loads.`
          : `Confirmed ${okCount}, ${failCount} blocked.`,
      );
      // Refresh the grid + the cell context
      await qc.invalidateQueries({
        queryKey: ["worksurface", "well-grid"],
      });
      await qc.invalidateQueries({
        queryKey: ["worksurface", "cell-context"],
      });
    } catch (err) {
      setConfirmResult(
        `Confirm failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 gap-3 max-w-[1600px] w-full mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Worksurface</h1>
        <div className="text-xs text-text-secondary">
          {me?.email ? `Signed in as ${me.email}` : ""}
        </div>
      </header>

      <WorksurfaceTopStrip
        weekStart={weekStart}
        onBuilderClick={(custId) => handleHighlight(custId ?? "all")}
      />

      <UserHighlightStrip
        customers={customers}
        highlight={highlight}
        onHighlight={handleHighlight}
        myCustomerId={myCustomerId}
      />

      <WellGrid
        weekStart={weekStart}
        highlight={highlight}
        myCustomerId={myCustomerId}
        onCellClick={handleCellClick}
        onBadgeClick={handleBadgeClick}
      />

      <InboxSection
        customerIds={inboxCustomerIds}
        onItemClick={(item) => {
          if (item.well_id != null && item.day) {
            const itemDate = new Date(item.day);
            const week = weekStart ? new Date(weekStart) : new Date();
            const dow = Math.floor(
              (itemDate.getTime() - week.getTime()) / (24 * 60 * 60 * 1000),
            );
            if (dow >= 0 && dow < 7) {
              setOpenCell({ wellId: item.well_id, dow });
            }
          }
        }}
      />
      <TodayIntakeSection />
      <JennyQueueSection
        onLoadClick={(loadId) => {
          // Phase 1.5: lookup load → cell context → open drawer.
          // For Wave 1, just show alert; Phase 2.5 wires the click.
          alert(`Load ${loadId} — drawer-open from Jenny's Queue is Phase 1.5`);
        }}
      />

      {/* Cell-mode drawer — opens when a Worksurface grid cell is clicked.
          Per-load drilldown wires in Phase 1.5. */}
      {openCell && cellContextQuery.data && (
        <WorkbenchDrawer
          onClose={() => {
            setOpenCell(null);
            setConfirmResult(null);
          }}
          cellContext={{
            wellId: cellContextQuery.data.wellId,
            wellName: cellContextQuery.data.wellName,
            billTo: cellContextQuery.data.billTo,
            weekStart: effectiveWeekStart,
            dow: openCell.dow,
            loadCount: cellContextQuery.data.loadCount,
            derivedStatus: cellContextQuery.data.derivedStatus,
            assignmentIds: cellContextQuery.data.assignmentIds,
            isConfirming: bulkConfirmMutation.isPending,
            confirmResult,
            onConfirm: handleConfirm,
            onMatchBol: () => alert("Match BOL — wired in Phase 1.5"),
            onAssignDriver: () => alert("Assign Driver — wired in Phase 1.5"),
            onAddComment: () => alert("Add Comment — wired in Phase 1.5"),
            onClose: () => {
              setOpenCell(null);
              setConfirmResult(null);
            },
          }}
        />
      )}
    </div>
  );
}
