import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import type { WorkbenchFilter, WorkbenchRow as Row } from "../types/api";

type WorkbenchView = "list" | "tabular";

const FILTERS: { value: WorkbenchFilter; label: string }[] = [
  { value: "uncertain", label: "Uncertain" },
  { value: "ready_to_build", label: "Ready to Build" },
  { value: "mine", label: "Mine" },
  { value: "missing_ticket", label: "Missing Ticket" },
  { value: "missing_driver", label: "Missing Driver" },
  { value: "needs_rate", label: "Needs Rate" },
  { value: "built_today", label: "Built Today" },
  { value: "ready_to_clear", label: "Ready to Clear" },
  { value: "entered_today", label: "Entered Today" },
  { value: "all", label: "All" },
];

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
  const workbenchQuery = useWorkbench(filter, {
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    truckNo: truckNo || undefined,
    wellName: view === "tabular" ? undefined : wellName || undefined,
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
        <h1 className="text-xl font-headline">Workbench</h1>
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
                className="px-3 py-1 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {bulkConfirm.isPending
                  ? "Confirming…"
                  : `Confirm ${selectedCleanUncertainIds.length} → Yellow`}
              </button>
            )}
            {selectedReadyToBuildIds.length > 0 && (
              <button
                type="button"
                onClick={() => setBuildModalOpen(true)}
                className="px-3 py-1 text-sm rounded bg-primary text-on-primary"
              >
                Build + Duplicate batch
              </button>
            )}
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
            <div className="text-sm text-on-surface-variant p-4">
              {view === "tabular" && tabularWell !== null
                ? "No loads for this well in the current filter."
                : "Nothing on this filter."}
            </div>
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
                  onFlagAction={() =>
                    routeUncertain.mutate({
                      id: row.assignmentId,
                      action: "flag_other",
                      notes: "Flagged from row",
                    })
                  }
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
