import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useWorkbench,
  useAdvanceStage,
  useBulkConfirm,
  useRouteUncertain,
  PAGE_SIZE_OPTIONS,
  type PageSize,
} from "../hooks/use-workbench";
import { useCurrentUser } from "../hooks/use-auth";
import { WorkbenchRow } from "../components/WorkbenchRow";
import { WorkbenchDrawer } from "../components/WorkbenchDrawer";
import { BuildDuplicateModal } from "../components/BuildDuplicateModal";
import { ResolveModal } from "../components/ResolveModal";
import { WorkbenchOnboarding } from "../components/WorkbenchOnboarding";
import { WorkbenchWellPicker } from "../components/WorkbenchWellPicker";
import { useWells } from "../hooks/use-wells";
import type { WorkbenchFilter, WorkbenchRow as Row } from "../types/api";

type WorkbenchView = "list" | "tabular";

/** Per-filter empty-state copy — tells the user what this filter means and
 *  where to go instead of showing a blank. If the user arrived via a deep
 *  link with an active search/date/truck/well filter and nothing matched,
 *  surface that explicitly so they understand why the list is empty. */
const FILTER_EMPTY_COPY: Record<
  WorkbenchFilter,
  { title: string; body: string; cta?: { to: string; label: string } }
> = {
  uncertain: {
    title: "Nothing needs you right now.",
    body: "The Uncertain queue is clear. Check Ready to Build to see what the team is working on, or Built Today for the day's progress.",
    cta: { to: "?filter=ready_to_build", label: "Ready to Build →" },
  },
  ready_to_build: {
    title: "Nothing to build.",
    body: "No loads have been released to the build queue yet. Start with Uncertain — that's where loads come from.",
    cta: { to: "?filter=uncertain", label: "Uncertain →" },
  },
  mine: {
    title: "Nothing on your plate.",
    body: "No loads are currently assigned to you. Check All to see what's in the system.",
    cta: { to: "?filter=all", label: "All →" },
  },
  missing_ticket: {
    title: "No missing tickets.",
    body: "Every load in the system has a ticket number. Nothing to chase.",
  },
  missing_driver: {
    title: "No loads missing a driver.",
    body: "Every load has a driver assigned. Nothing to fix here.",
  },
  needs_rate: {
    title: "No rate gaps.",
    body: "Every load has a rate. Payroll is unblocked.",
  },
  built_today: {
    title: "Nothing built today yet.",
    body: "The build queue hasn't moved any loads to PCS today. Check Ready to Build to see what's waiting.",
    cta: { to: "?filter=ready_to_build", label: "Ready to Build →" },
  },
  ready_to_clear: {
    title: "Nothing ready to clear.",
    body: "No built loads are waiting for verification. Check Built Today to see what's recent.",
    cta: { to: "?filter=built_today", label: "Built Today →" },
  },
  entered_today: {
    title: "Nothing entered today yet.",
    body: "No loads have been typed into PCS today. Check Ready to Build for what's queued.",
    cta: { to: "?filter=ready_to_build", label: "Ready to Build →" },
  },
  all: {
    title: "No loads in the system.",
    body: "Load Center is completely empty. If this looks wrong, the ingest sync may be paused — check with Jace or the admin dashboard.",
  },
};

function WorkbenchEmptyState({
  filter,
  search,
  hasDateFilter,
  hasTruckFilter,
  hasWellFilter,
  tabularWell,
  onClearAll,
}: {
  filter: WorkbenchFilter;
  search: string;
  hasDateFilter: boolean;
  hasTruckFilter: boolean;
  hasWellFilter: boolean;
  tabularWell: string | null;
  onClearAll: () => void;
}) {
  const hasActiveFilters =
    Boolean(search) || hasDateFilter || hasTruckFilter || hasWellFilter;

  // Tabular well narrowing is client-side; separate empty message.
  if (tabularWell !== null) {
    return (
      <div className="text-center py-16 px-8 text-on-surface-variant">
        <p className="text-sm">No loads for this well in the current filter.</p>
      </div>
    );
  }

  // When a deep link arrived with a search that matched nothing, pitch
  // Archive as the likely home of older/cleared loads. This catches the
  // "click Load # on a cleared row from Load Report → dead end" scenario.
  if (search) {
    return (
      <div className="text-center py-16 px-8 max-w-lg mx-auto space-y-3">
        <div className="text-3xl">🔍</div>
        <h3 className="font-headline text-lg text-on-surface">
          No matches for "{search}"
        </h3>
        <p className="text-sm text-on-surface-variant">
          Nothing in the current filter matches that search. If the load is old
          it may have moved to the archive.
        </p>
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClearAll}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-outline-variant hover:bg-surface-container-high"
          >
            Clear filters
          </button>
          <Link
            to={`/archive?q=${encodeURIComponent(search)}`}
            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-on-primary hover:opacity-90"
          >
            Search Archive →
          </Link>
        </div>
      </div>
    );
  }

  // Other non-search narrowing filters active but no search term.
  if (hasActiveFilters) {
    return (
      <div className="text-center py-16 px-8 max-w-lg mx-auto space-y-3">
        <h3 className="font-headline text-lg text-on-surface">
          Nothing matches your current filters.
        </h3>
        <p className="text-sm text-on-surface-variant">
          Date, truck, or well narrowing returned no rows. Widen the filters or
          clear them to see the full list.
        </p>
        <button
          type="button"
          onClick={onClearAll}
          className="px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-on-primary hover:opacity-90"
        >
          Clear filters
        </button>
      </div>
    );
  }

  const copy = FILTER_EMPTY_COPY[filter];
  return (
    <div className="text-center py-16 px-8 max-w-lg mx-auto space-y-3">
      <h3 className="font-headline text-lg text-on-surface">{copy.title}</h3>
      <p className="text-sm text-on-surface-variant">{copy.body}</p>
      {copy.cta && (
        <Link
          to={copy.cta.to}
          className="inline-block mt-1 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-on-primary hover:opacity-90"
        >
          {copy.cta.label}
        </Link>
      )}
    </div>
  );
}

const FILTERS: { value: WorkbenchFilter; label: string }[] = [
  { value: "uncertain", label: "Uncertain" },
  { value: "ready_to_build", label: "Ready to Build" },
  { value: "not_in_pcs", label: "Not in PCS" },
  { value: "missing_ticket", label: "Missing Ticket" },
  { value: "missing_driver", label: "Missing Driver" },
  { value: "needs_rate", label: "Needs Rate" },
  { value: "built_today", label: "Built Today" },
  { value: "all", label: "All" },
];
// Removed per Apr 21 call: "Mine" (unused under all-admin posture),
// "Ready to Clear" (UI-only filter Jessica said she didn't use),
// "Entered Today" (redundant with "Built Today" + "Completed" label).

export function Workbench() {
  const [params, setParams] = useSearchParams();
  const filter = (params.get("filter") as WorkbenchFilter) || "uncertain";
  const search = params.get("search") ?? "";
  const dateFrom = params.get("dateFrom") ?? "";
  const dateTo = params.get("dateTo") ?? "";
  const truckNo = params.get("truckNo") ?? "";
  const wellName = params.get("wellName") ?? "";
  const view: WorkbenchView =
    params.get("view") === "tabular" ? "tabular" : "list";
  // Pagination state lives in URL so reload + sharable links keep place.
  const pageSize: PageSize = (() => {
    const raw = parseInt(params.get("pageSize") ?? "50", 10);
    return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw)
      ? (raw as PageSize)
      : 50;
  })();
  const page = Math.max(0, parseInt(params.get("page") ?? "0", 10) || 0);

  const userQuery = useCurrentUser();
  const user = userQuery.data;

  // In tabular mode, drop wellName from the query so the left-pane picker
  // reflects every well in the current filter/date/truck scope. The user then
  // narrows by clicking a well (client-side filter via tabularWell below).
  //
  // Sort: Jessica asked for chronological ordering on Ready-to-Build and
  // Mine (her build queue), so she can work oldest-first if she chooses.
  // Uncertain and the sub-filters stay on stage_changed_at DESC because
  // recency is more useful when triaging. URL param `sort=date` overrides.
  const sortParam = params.get("sort");
  const defaultSortByDate = filter === "ready_to_build";
  const sortBy: "stage_changed_at" | "delivered_on" =
    sortParam === "date" || (sortParam !== "recent" && defaultSortByDate)
      ? "delivered_on"
      : "stage_changed_at";
  const workbenchQuery = useWorkbench(filter, {
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    truckNo: truckNo || undefined,
    wellName: view === "tabular" ? undefined : wellName || undefined,
    sortBy,
    sortDir: "desc",
    pageSize,
    page,
  });
  const advance = useAdvanceStage();
  const bulkConfirm = useBulkConfirm();
  const routeUncertain = useRouteUncertain();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [buildModalOpen, setBuildModalOpen] = useState(false);
  const [resolveRow, setResolveRow] = useState<Row | null>(null);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [tabularWell, setTabularWell] = useState<string | null>(null);

  // Fetched once per mount — wells list is small (<200) and tabular view
  // needs the FULL active-well set so filter changes never hide wells.
  const wellsQuery = useWells();

  const rows = useMemo<Row[]>(
    () => workbenchQuery.data?.rows ?? [],
    [workbenchQuery.data],
  );
  const total = workbenchQuery.data?.total ?? 0;

  // In tabular mode, client-side narrow by the currently-selected well. The
  // left pane still sees the full `rows` set so users can switch wells without
  // a re-fetch. In list mode, all rows pass through unchanged.
  const displayedRows = useMemo<Row[]>(() => {
    if (view !== "tabular" || tabularWell === null) return rows;
    return rows.filter((r) => {
      const key = r.wellName ?? "__unassigned__";
      return key === tabularWell;
    });
  }, [rows, view, tabularWell]);

  // For bulk-bar: categorize selected rows so we know which bulk actions
  // apply. Clean-uncertain rows can be confirmed; ready_to_build rows can
  // be batch-built.
  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.assignmentId)),
    [rows, selected],
  );
  const selectedCleanUncertainIds = selectedRows
    .filter(
      (r) => r.handlerStage === "uncertain" && r.uncertainReasons.length === 0,
    )
    .map((r) => r.assignmentId);
  const selectedReadyToBuildIds = selectedRows
    .filter((r) => r.handlerStage === "ready_to_build")
    .map((r) => r.assignmentId);

  const setFilter = (f: WorkbenchFilter) => {
    const next = new URLSearchParams(params);
    next.set("filter", f);
    next.delete("page");
    setParams(next);
  };

  const setPageSize = (n: PageSize) => {
    const next = new URLSearchParams(params);
    next.set("pageSize", String(n));
    next.delete("page");
    setParams(next);
  };

  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    if (p <= 0) next.delete("page");
    else next.set("page", String(p));
    setParams(next);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total === 0 ? 0 : page * pageSize + 1;
  const pageEnd = Math.min(total, (page + 1) * pageSize);

  const setSearch = (s: string) => {
    const next = new URLSearchParams(params);
    if (s) next.set("search", s);
    else next.delete("search");
    setParams(next);
  };

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const primaryActionFor = async (row: Row) => {
    switch (row.handlerStage) {
      case "uncertain":
        // Fast path: 100% matched load with no open reasons → one-click Confirm
        // advances directly to Ready to Build per Jessica's workflow ask.
        // Loads with open reasons go through the Resolve modal to pick a
        // specific route (Needs Rate, Missing Ticket, etc.).
        if (row.uncertainReasons.length === 0) {
          await advance.mutateAsync({
            id: row.assignmentId,
            stage: "ready_to_build",
            notes: "confirmed via fast-path",
          });
        } else {
          setResolveRow(row);
        }
        return;
      case "ready_to_build":
        setSelected(new Set([row.assignmentId]));
        setBuildModalOpen(true);
        return;
      case "building":
        await advance.mutateAsync({
          id: row.assignmentId,
          stage: "entered",
        });
        return;
      case "entered":
        await advance.mutateAsync({
          id: row.assignmentId,
          stage: "cleared",
        });
        return;
      case "cleared":
        return;
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col p-4 gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-headline">Load Center</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            className="bg-surface-variant rounded px-2 py-1 text-sm w-48"
            placeholder="Search BOL, load#, driver…"
            defaultValue={search}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                setSearch((e.target as HTMLInputElement).value);
            }}
          />
          <label className="flex items-center gap-1 text-xs text-on-surface-variant">
            <span className="font-medium uppercase tracking-wider text-[10px]">
              From
            </span>
            <input
              type="date"
              className="bg-surface-variant rounded px-2 py-1 text-sm"
              value={dateFrom}
              onChange={(e) => setParam("dateFrom", e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-on-surface-variant">
            <span className="font-medium uppercase tracking-wider text-[10px]">
              To
            </span>
            <input
              type="date"
              className="bg-surface-variant rounded px-2 py-1 text-sm"
              value={dateTo}
              onChange={(e) => setParam("dateTo", e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-on-surface-variant">
            <span className="font-medium uppercase tracking-wider text-[10px]">
              Truck
            </span>
            <input
              type="text"
              className="bg-surface-variant rounded px-2 py-1 text-sm w-24"
              placeholder="e.g. 1456"
              defaultValue={truckNo}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  setParam("truckNo", (e.target as HTMLInputElement).value);
              }}
              onBlur={(e) => setParam("truckNo", e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-on-surface-variant">
            <span className="font-medium uppercase tracking-wider text-[10px]">
              Well
            </span>
            <input
              type="text"
              className="bg-surface-variant rounded px-2 py-1 text-sm w-40"
              placeholder="e.g. Apache Gulftex"
              defaultValue={wellName}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  setParam("wellName", (e.target as HTMLInputElement).value);
              }}
              onBlur={(e) => setParam("wellName", e.target.value)}
            />
          </label>
          {(dateFrom || dateTo || truckNo || wellName || search) && (
            <button
              type="button"
              onClick={() => {
                const next = new URLSearchParams();
                next.set("filter", filter);
                setParams(next);
              }}
              className="text-xs text-on-surface-variant hover:text-on-surface underline"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            data-show-walkthrough
            onClick={() => setWalkthroughOpen(true)}
            className="text-xs text-primary hover:underline"
          >
            Show walkthrough
          </button>
        </div>
      </div>

      <div className="flex gap-1 flex-wrap items-center">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            data-filter={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1 text-sm font-medium rounded-full border transition-colors ${
              filter === f.value
                ? "bg-primary text-on-primary border-primary"
                : "bg-surface-container-low text-on-surface border-outline-variant hover:border-primary/60 hover:text-primary"
            }`}
          >
            {f.label}
          </button>
        ))}
        <div
          data-workbench-view-toggle
          className="ml-2 flex rounded border border-surface-variant overflow-hidden text-xs"
          role="group"
          aria-label="View mode"
        >
          <button
            type="button"
            onClick={() => {
              setParam("view", "");
              setTabularWell(null);
            }}
            aria-pressed={view === "list"}
            className={`px-2 py-1 ${
              view === "list"
                ? "bg-primary text-on-primary"
                : "text-on-surface-variant hover:bg-surface-variant"
            }`}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setParam("view", "tabular")}
            aria-pressed={view === "tabular"}
            className={`px-2 py-1 border-l border-surface-variant ${
              view === "tabular"
                ? "bg-primary text-on-primary"
                : "text-on-surface-variant hover:bg-surface-variant"
            }`}
          >
            Tabular
          </button>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-on-surface-variant self-center">
          <label className="flex items-center gap-1">
            <span className="font-medium uppercase tracking-wider text-[10px]">
              Per page
            </span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
              className="bg-surface-variant rounded px-1.5 py-0.5 text-xs"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(page - 1)}
              disabled={page <= 0}
              className="px-2 py-0.5 rounded border border-outline-variant text-on-surface hover:bg-surface-variant disabled:opacity-30"
            >
              ‹ Prev
            </button>
            <span className="px-1 tabular-nums">
              {pageStart.toLocaleString()}-{pageEnd.toLocaleString()} of{" "}
              {total.toLocaleString()}
            </span>
            <button
              type="button"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages - 1}
              className="px-2 py-0.5 rounded border border-outline-variant text-on-surface hover:bg-surface-variant disabled:opacity-30"
            >
              Next ›
            </button>
          </div>
          {view === "tabular" && tabularWell !== null && (
            <span>{displayedRows.length} shown</span>
          )}
        </div>
      </div>

      {selected.size > 0 ? (
        <div
          data-batch-bar
          className="flex items-center justify-between p-2 bg-surface-variant rounded"
        >
          <div className="text-sm">
            {selected.size} selected
            {selectedCleanUncertainIds.length > 0 && (
              <span className="ml-2 text-xs text-on-surface-variant">
                · {selectedCleanUncertainIds.length} ready to confirm
              </span>
            )}
            {selectedReadyToBuildIds.length > 0 && (
              <span className="ml-2 text-xs text-on-surface-variant">
                · {selectedReadyToBuildIds.length} ready to build
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {selectedCleanUncertainIds.length > 0 && (
              <button
                type="button"
                disabled={bulkConfirm.isPending}
                onClick={async () => {
                  await bulkConfirm.mutateAsync({
                    assignmentIds: selectedCleanUncertainIds,
                    notes: "bulk-confirm via selection bar",
                  });
                  setSelected(new Set());
                }}
                title="Move the selected Uncertain loads (with no open validation reasons) to Ready-to-Build. This is the bulk version of the drawer's Confirm action."
                className="px-3 py-1 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {bulkConfirm.isPending
                  ? "Confirming…"
                  : `Confirm ${selectedCleanUncertainIds.length} → Ready to Build`}
              </button>
            )}
            {selectedReadyToBuildIds.length > 0 && (
              <button
                type="button"
                onClick={() => setBuildModalOpen(true)}
                title="Batch-build the selected loads in PCS. The system silently learns from your build patterns so similar shipments pre-wire next time."
                className="px-3 py-1 text-sm rounded bg-primary text-on-primary"
              >
                Build in PCS
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                const ids = Array.from(selected);
                if (ids.length === 0) return;
                try {
                  const res = await fetch(
                    `${import.meta.env.VITE_API_URL || ""}/api/v1/verification/photos/zip`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${localStorage.getItem("esexpress-token") ?? ""}`,
                      },
                      body: JSON.stringify({ assignmentIds: ids }),
                    },
                  );
                  if (!res.ok)
                    throw new Error(`ZIP failed: HTTP ${res.status}`);
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `esexpress_photos_${ids.length}.zip`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch (err) {
                  alert(
                    `Photo download failed: ${err instanceof Error ? err.message : String(err)}`,
                  );
                }
              }}
              className="px-3 py-1 text-sm rounded border border-surface-variant hover:bg-surface-variant"
              title="Download all photos for the selected loads as a ZIP (for manual PCS attach while OAuth isn't live)"
            >
              Download Photos
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="px-3 py-1 text-sm rounded border border-surface-variant"
            >
              Clear selection
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={`flex-1 min-h-0 ${view === "tabular" ? "flex gap-3 overflow-hidden" : "overflow-auto space-y-1"}`}
        data-workbench-view={view}
      >
        {view === "tabular" && !workbenchQuery.isLoading && (
          <WorkbenchWellPicker
            rows={rows}
            allWells={wellsQuery.data ?? []}
            selectedWell={tabularWell}
            onSelect={(name) => {
              setTabularWell(name);
              setSelected(new Set());
              setExpandedId(null);
            }}
          />
        )}
        <div
          className={
            view === "tabular" ? "flex-1 overflow-auto space-y-1" : "contents"
          }
        >
          {workbenchQuery.isLoading ? (
            <div className="text-sm text-on-surface-variant p-4">Loading…</div>
          ) : displayedRows.length === 0 ? (
            <WorkbenchEmptyState
              filter={filter}
              search={search}
              hasDateFilter={Boolean(dateFrom || dateTo)}
              hasTruckFilter={Boolean(truckNo)}
              hasWellFilter={Boolean(wellName)}
              tabularWell={view === "tabular" ? tabularWell : null}
              onClearAll={() => {
                const next = new URLSearchParams(params);
                ["search", "dateFrom", "dateTo", "truckNo", "wellName"].forEach(
                  (k) => next.delete(k),
                );
                setParams(next);
              }}
            />
          ) : (
            displayedRows.map((row) => (
              <div key={row.assignmentId} data-workbench-row>
                <WorkbenchRow
                  row={row}
                  selected={selected.has(row.assignmentId)}
                  onToggleSelect={() => toggleSelect(row.assignmentId)}
                  onRowClick={() =>
                    setExpandedId((prev) =>
                      prev === row.assignmentId ? null : row.assignmentId,
                    )
                  }
                  onPrimaryAction={() => primaryActionFor(row)}
                  onFlagAction={() => setResolveRow(row)}
                  isPending={advance.isPending || routeUncertain.isPending}
                />
                {expandedId === row.assignmentId && (
                  <WorkbenchDrawer
                    row={row}
                    onClose={() => setExpandedId(null)}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <BuildDuplicateModal
        open={buildModalOpen}
        assignmentIds={Array.from(selected)}
        onClose={() => setBuildModalOpen(false)}
        onSuccess={() => {
          setBuildModalOpen(false);
          setSelected(new Set());
        }}
      />

      <ResolveModal
        open={resolveRow != null}
        row={resolveRow}
        onClose={() => setResolveRow(null)}
        onResolved={() => setResolveRow(null)}
      />

      <WorkbenchOnboarding
        userName={user?.name}
        userRole={user?.role}
        forceOpen={walkthroughOpen}
        onClose={() => setWalkthroughOpen(false)}
      />
    </div>
  );
}
