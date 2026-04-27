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

interface CellLoad {
  load_id: number;
  assignment_id: number;
  assignment_status: string;
  photo_status: string | null;
  load_no: string | null;
  driver_name: string | null;
  bol_no: string | null;
  ticket_no: string | null;
  weight_tons: string | null;
  weight_lbs: string | null;
  delivered_on: string | null;
}
interface CellContextPayload {
  wellId: number;
  wellName: string;
  billTo: string | null;
  loadCount: number;
  derivedStatus: string;
  assignmentIds: number[];
  loads: CellLoad[];
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

  // Painted-status overlay (Phase 1.5 #6, the headline dual-color visual).
  // Pull /diag/sheet-status for the active week, build a Map keyed by
  // `${wellId}-${dow}` → painted status. WellGridCell will render the
  // sheet-painted color as the top half stripe and badge mismatches when
  // stage_distance > 1.
  const sheetStatusQuery = useQuery({
    queryKey: ["worksurface", "sheet-status", weekStart],
    queryFn: () =>
      api.get<{
        cellsWithV2: Array<{
          well_id: number | null;
          dow: number;
          status: string;
        }>;
      }>(
        weekStart
          ? `/diag/sheet-status?weekStart=${weekStart}`
          : `/diag/sheet-status`,
      ),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
  const paintedStatusByCell = useMemo(() => {
    const m = new Map<string, string>();
    const cells = sheetStatusQuery.data?.cellsWithV2 ?? [];
    for (const c of cells) {
      if (c.well_id != null) m.set(`${c.well_id}-${c.dow}`, c.status);
    }
    return m;
  }, [sheetStatusQuery.data]);

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
      // Get cell loads (assignmentIds + load list) from the dedicated endpoint
      const cellDetail = await api.get<{
        assignmentIds: number[];
        loadCount: number;
        loads: CellLoad[];
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
        loads: cellDetail.loads,
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
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="text-sm text-text-secondary">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
            {weekStart &&
              weekStart !== effectiveWeekStart &&
              ` · viewing week of ${weekStart}`}
            {!weekStart && ` · week of ${effectiveWeekStart}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const d = new Date(effectiveWeekStart + "T00:00:00");
              d.setDate(d.getDate() - 7);
              const sp = new URLSearchParams(searchParams);
              sp.set("week", d.toISOString().slice(0, 10));
              setSearchParams(sp);
            }}
            className="px-2.5 py-1 text-xs rounded-md border border-border bg-bg-secondary hover:bg-bg-tertiary"
          >
            ← Prev week
          </button>
          <button
            type="button"
            onClick={() => {
              const sp = new URLSearchParams(searchParams);
              sp.delete("week");
              setSearchParams(sp);
            }}
            className="px-2.5 py-1 text-xs rounded-md border border-border bg-bg-secondary hover:bg-bg-tertiary"
          >
            This week
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date(effectiveWeekStart + "T00:00:00");
              d.setDate(d.getDate() + 7);
              const sp = new URLSearchParams(searchParams);
              sp.set("week", d.toISOString().slice(0, 10));
              setSearchParams(sp);
            }}
            className="px-2.5 py-1 text-xs rounded-md border border-border bg-bg-secondary hover:bg-bg-tertiary"
          >
            Next week →
          </button>
        </div>
      </header>

      <WorksurfaceTopStrip
        weekStart={weekStart}
        currentHighlight={highlight}
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
        paintedStatusByCell={paintedStatusByCell}
      />

      <InboxSection
        customerIds={inboxCustomerIds}
        initialOpen
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
            loads: cellContextQuery.data.loads,
            paintedStatus: paintedStatusByCell.get(
              `${cellContextQuery.data.wellId}-${openCell.dow}`,
            ),
            isConfirming: bulkConfirmMutation.isPending,
            confirmResult,
            onConfirm: handleConfirm,
            // Match BOL → navigate to BolQueue (the deeper match surface).
            // Cell-level inline match-modal is Phase 2 (needs reverse-search:
            // given a load, find candidate BOL submissions).
            onMatchBol: () => {
              window.location.href = `/bol`;
            },
            // Assign Driver → navigate to the Well page where the driver
            // roster lives. Inline cell-level driver picker is Phase 2
            // (driver_roster needs canonical sheet from Jess first).
            onAssignDriver: () => {
              window.location.href = `/wells/${cellContextQuery.data?.wellId}`;
            },
            // Add Comment → real POST to first load in the cell, with a
            // cell-context prefix so it's findable per-load.
            onAddComment: async (body: string) => {
              const firstLoad = cellContextQuery.data?.loads?.[0];
              if (!firstLoad) {
                setConfirmResult("No load to attach comment to.");
                return;
              }
              try {
                await api.post(
                  `/dispatch/loads/${firstLoad.load_id}/comments`,
                  {
                    body: `[cell: ${cellContextQuery.data?.wellName} · day ${openCell.dow}] ${body}`,
                  },
                );
                setConfirmResult(`Comment saved on load ${firstLoad.load_id}.`);
              } catch (err) {
                setConfirmResult(
                  `Comment failed: ${err instanceof Error ? err.message : String(err)}`,
                );
              }
            },
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
