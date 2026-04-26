import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useCurrentUser } from "../hooks/use-auth";
import { useHeartbeat } from "../hooks/use-presence";
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
  const cellContextQuery = useQuery({
    queryKey: [
      "worksurface",
      "cell-context",
      openCell?.wellId,
      openCell?.dow,
      weekStart,
    ],
    queryFn: async (): Promise<CellContextPayload | null> => {
      if (!openCell) return null;
      const r = await api.get<WellGridResponse>(
        weekStart
          ? `/diag/well-grid?weekStart=${weekStart}`
          : `/diag/well-grid`,
      );
      const row = r.rows.find((x) => x.wellId === openCell.wellId);
      if (!row) return null;
      const cell = row.days[openCell.dow];
      return {
        wellId: row.wellId,
        wellName: row.wellName,
        billTo: row.billTo,
        loadCount: cell?.loadCount ?? 0,
        derivedStatus: cell?.derivedStatus ?? "unknown",
      };
    },
    enabled: !!openCell,
    staleTime: 30_000,
  });

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

      <InboxSection customerIds={inboxCustomerIds} />
      <TodayIntakeSection />
      <JennyQueueSection />

      {/* Cell-mode drawer — opens when a Worksurface grid cell is clicked.
          Per-load drilldown wires in Phase 1.5. */}
      {openCell && cellContextQuery.data && (
        <WorkbenchDrawer
          onClose={() => setOpenCell(null)}
          cellContext={{
            wellId: cellContextQuery.data.wellId,
            wellName: cellContextQuery.data.wellName,
            billTo: cellContextQuery.data.billTo,
            weekStart: weekStart ?? new Date().toISOString().slice(0, 10),
            dow: openCell.dow,
            loadCount: cellContextQuery.data.loadCount,
            derivedStatus: cellContextQuery.data.derivedStatus,
            onConfirm: () => alert("Confirm — wired in Phase 1.5"),
            onMatchBol: () => alert("Match BOL — wired in Phase 1.5"),
            onAssignDriver: () => alert("Assign Driver — wired in Phase 1.5"),
            onAddComment: () => alert("Add Comment — wired in Phase 1.5"),
            onClose: () => setOpenCell(null),
          }}
        />
      )}
    </div>
  );
}
