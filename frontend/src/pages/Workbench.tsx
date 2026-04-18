import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useWorkbench, useAdvanceStage } from "../hooks/use-workbench";
import { useCurrentUser } from "../hooks/use-auth";
import { WorkbenchRow } from "../components/WorkbenchRow";
import { WorkbenchDrawer } from "../components/WorkbenchDrawer";
import { BuildDuplicateModal } from "../components/BuildDuplicateModal";
import { ResolveModal } from "../components/ResolveModal";
import { WorkbenchOnboarding } from "../components/WorkbenchOnboarding";
import type { WorkbenchFilter, WorkbenchRow as Row } from "../types/api";

const FILTERS: { value: WorkbenchFilter; label: string }[] = [
  { value: "uncertain", label: "Uncertain" },
  { value: "ready_to_build", label: "Ready to Build" },
  { value: "mine", label: "Mine" },
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

  const userQuery = useCurrentUser();
  const user = userQuery.data;

  const workbenchQuery = useWorkbench(filter, {
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    truckNo: truckNo || undefined,
  });
  const advance = useAdvanceStage();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [buildModalOpen, setBuildModalOpen] = useState(false);
  const [resolveRow, setResolveRow] = useState<Row | null>(null);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);

  const rows = useMemo<Row[]>(
    () => workbenchQuery.data?.rows ?? [],
    [workbenchQuery.data],
  );
  const total = workbenchQuery.data?.total ?? 0;

  const setFilter = (f: WorkbenchFilter) => {
    const next = new URLSearchParams(params);
    next.set("filter", f);
    setParams(next);
  };

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
    <div className="flex-1 flex flex-col p-4 gap-3">
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
          {(dateFrom || dateTo || truckNo || search) && (
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

      <div className="flex gap-1 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            data-filter={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1 text-sm rounded-full border ${
              filter === f.value
                ? "bg-primary text-on-primary border-primary"
                : "border-surface-variant hover:border-primary/40"
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto text-xs text-on-surface-variant self-center">
          {total} {total === 1 ? "load" : "loads"}
        </div>
      </div>

      {selected.size > 0 ? (
        <div
          data-batch-bar
          className="flex items-center justify-between p-2 bg-surface-variant rounded"
        >
          <div className="text-sm">{selected.size} selected</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBuildModalOpen(true)}
              className="px-3 py-1 text-sm rounded bg-primary text-on-primary"
            >
              Build + Duplicate batch
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

      <div className="flex-1 overflow-auto space-y-1">
        {workbenchQuery.isLoading ? (
          <div className="text-sm text-on-surface-variant p-4">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-on-surface-variant p-4">
            Nothing on this filter.
          </div>
        ) : (
          rows.map((row) => (
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
                isPending={advance.isPending}
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
