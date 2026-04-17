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

  const userQuery = useCurrentUser();
  const user = userQuery.data;

  const workbenchQuery = useWorkbench(filter, search || undefined);
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
        setResolveRow(row);
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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-headline">Workbench</h1>
        <div className="flex items-center gap-2">
          <input
            type="search"
            className="bg-surface-variant rounded px-2 py-1 text-sm w-56"
            placeholder="Search BOL, load#, driver, truck…"
            defaultValue={search}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                setSearch((e.target as HTMLInputElement).value);
            }}
          />
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
