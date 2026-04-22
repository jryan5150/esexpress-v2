import { useState, useMemo, useEffect } from "react";
import {
  useWells,
  useUpdateWell,
  useCreateWell,
  useCarriers,
} from "../../hooks/use-wells";
import { useToast } from "../../components/Toast";
import type { Well } from "../../types/api";

// "Active" excludes completed + closed by default (P2-9). Switch to "all"
// to see those — full set including completed/closed/standby.
type StatusFilter = "active" | "all" | "standby" | "completed" | "closed";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-tertiary/10 text-tertiary",
  standby: "bg-primary-container/10 text-primary-container",
  completed: "bg-on-surface/10 text-on-surface/60",
  closed: "bg-error/10 text-error",
};

const PAGE_SIZE = 25;

// ─── Inline details editor ─────────────────────────────────────────
// Secondary (rate / mileage / customer / carrier / loader) fields live
// behind a "Details" expand toggle — keeps the happy-path row compact
// while still letting admins edit rare fields on demand. Pattern B per
// 2026-04-22 scope.
type DetailField =
  | "ratePerTon"
  | "ffcRate"
  | "fscRate"
  | "mileageFromLoader"
  | "customerName"
  | "loaderSandplant";

const DETAIL_FIELD_META: Record<
  DetailField,
  { label: string; placeholder: string; prefix?: string; numeric?: boolean }
> = {
  ratePerTon: {
    label: "Rate / ton",
    placeholder: "e.g. 7.8500",
    prefix: "$",
    numeric: true,
  },
  ffcRate: {
    label: "FFC rate",
    placeholder: "e.g. 0.0500",
    prefix: "$",
    numeric: true,
  },
  fscRate: {
    label: "FSC (fuel)",
    placeholder: "e.g. 0.4200",
    prefix: "$",
    numeric: true,
  },
  mileageFromLoader: {
    label: "Miles from loader",
    placeholder: "e.g. 42.5",
    numeric: true,
  },
  customerName: { label: "Customer", placeholder: "e.g. ConocoPhillips" },
  loaderSandplant: {
    label: "Loader / Sandplant",
    placeholder: "e.g. Magnum Monahans",
  },
};

export function WellsAdmin() {
  const [filter, setFilter] = useState<StatusFilter>("active");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  // Inline alias editor: which well row is expanded + the in-progress draft.
  // Aliases are the bridge between dispatcher vocabulary and PropX/Logistiq
  // destination strings — adding one unblocks orphan loads auto-mapping.
  const [aliasWellId, setAliasWellId] = useState<number | null>(null);
  const [aliasInput, setAliasInput] = useState<string>("");
  // Details expand toggle per row (secondary commercial/logistics fields).
  const [detailsWellId, setDetailsWellId] = useState<number | null>(null);
  // New-well create form visibility + name draft.
  const [creating, setCreating] = useState(false);
  const [newWellName, setNewWellName] = useState("");
  const { toast } = useToast();
  const wellsQuery = useWells();
  const carriersQuery = useCarriers();
  const updateWell = useUpdateWell();
  const createWell = useCreateWell();

  const wells: Well[] = Array.isArray(wellsQuery.data) ? wellsQuery.data : [];
  const carriers = Array.isArray(carriersQuery.data) ? carriersQuery.data : [];

  const filtered = useMemo(() => {
    if (filter === "all") return wells;
    if (filter === "active")
      return wells.filter(
        (w) => w.status !== "completed" && w.status !== "closed",
      );
    return wells.filter((w) => w.status === filter);
  }, [wells, filter]);

  // Reset to page 1 whenever the filter changes its result set
  useEffect(() => {
    setPage(1);
  }, [filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageWells = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const filterButtons: { value: StatusFilter; label: string }[] = [
    { value: "active", label: "Active" },
    { value: "standby", label: "Standby" },
    { value: "completed", label: "Completed" },
    { value: "closed", label: "Closed" },
    { value: "all", label: "All" },
  ];

  const startEdit = (well: Well) => {
    setEditingId(well.id);
    setEditValue(String(well.dailyTargetLoads));
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };
  const openAliasEditor = (well: Well) => {
    setAliasWellId(well.id);
    setAliasInput("");
  };
  const closeAliasEditor = () => {
    setAliasWellId(null);
    setAliasInput("");
  };
  const toggleDetails = (well: Well) => {
    setDetailsWellId((curr) => (curr === well.id ? null : well.id));
  };
  const addAlias = (well: Well) => {
    const clean = aliasInput.trim();
    if (!clean) return;
    const current = (well.aliases ?? []) as string[];
    if (current.map((a) => a.toLowerCase()).includes(clean.toLowerCase())) {
      toast("That alias is already on this well", "info");
      return;
    }
    updateWell.mutate(
      { id: well.id, patch: { aliases: [...current, clean] } },
      {
        onSuccess: () => {
          toast(`Added alias "${clean}" → ${well.name}`, "success");
          setAliasInput("");
        },
        onError: (err) =>
          toast(`Add alias failed: ${(err as Error).message}`, "error"),
      },
    );
  };
  const removeAlias = (well: Well, target: string) => {
    const current = (well.aliases ?? []) as string[];
    const next = current.filter((a) => a !== target);
    updateWell.mutate(
      { id: well.id, patch: { aliases: next } },
      {
        onSuccess: () => toast(`Removed alias "${target}"`, "success"),
        onError: (err) =>
          toast(`Remove alias failed: ${(err as Error).message}`, "error"),
      },
    );
  };

  const saveEdit = (well: Well) => {
    const parsed = parseInt(editValue, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast("Daily target must be a non-negative number", "error");
      return;
    }
    if (parsed === well.dailyTargetLoads) {
      cancelEdit();
      return;
    }
    updateWell.mutate(
      { id: well.id, patch: { dailyTargetLoads: parsed } },
      {
        onSuccess: () => {
          toast(`Updated ${well.name} → ${parsed} loads/day`, "success");
          cancelEdit();
        },
        onError: (err) => {
          toast(`Update failed: ${(err as Error).message}`, "error");
        },
      },
    );
  };

  const submitCreate = () => {
    const name = newWellName.trim();
    if (!name) {
      toast("Well name is required", "error");
      return;
    }
    createWell.mutate(
      { name },
      {
        onSuccess: () => {
          toast(`Created well "${name}"`, "success");
          setNewWellName("");
          setCreating(false);
        },
        onError: (err) =>
          toast(`Create failed: ${(err as Error).message}`, "error"),
      },
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-7 pt-5 pb-4 border-b border-outline-variant/40 bg-surface-container-lowest header-gradient shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-primary rounded-sm shrink-0" />
          <div className="flex-1">
            <h1 className="font-headline text-[22px] font-extrabold tracking-tight text-on-surface uppercase leading-tight">
              Wells Management
            </h1>
            <p className="text-[11px] font-medium text-outline tracking-[0.08em] uppercase mt-0.5">
              Administration // Well Site Registry
            </p>
          </div>
          <button
            onClick={() => setCreating((c) => !c)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors cursor-pointer shadow-sm"
            aria-label="Create new well"
          >
            <span className="material-symbols-outlined text-base">add</span>
            New Well
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-7 pt-5 pb-6 space-y-6">
        {/* Inline-create form — toggled by the header "+ New Well" button */}
        {creating && (
          <div className="bg-surface-container-high border-l-4 border-primary px-5 py-3 rounded-lg flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant">
              New well
            </span>
            <input
              type="text"
              value={newWellName}
              onChange={(e) => setNewWellName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCreate();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewWellName("");
                }
              }}
              autoFocus
              placeholder="Well name (other fields editable after creation)"
              className="flex-1 px-2 py-1 text-sm border border-outline-variant rounded focus:border-primary focus:outline-none bg-background"
              disabled={createWell.isPending}
              aria-label="New well name"
            />
            <button
              onClick={submitCreate}
              disabled={createWell.isPending || !newWellName.trim()}
              className="px-3 py-1 text-xs font-bold rounded bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Create
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setNewWellName("");
              }}
              className="px-2 py-1 text-xs text-on-surface-variant hover:text-on-surface"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex items-center gap-2">
          {filterButtons.map((btn) => (
            <button
              key={btn.value}
              onClick={() => setFilter(btn.value)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                filter === btn.value
                  ? "bg-primary-container/12 text-primary-container shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container-high/60 hover:text-on-surface"
              }`}
            >
              {btn.label}
              <span className="ml-1.5 font-label">
                {btn.value === "all"
                  ? wells.length
                  : btn.value === "active"
                    ? wells.filter(
                        (w) =>
                          w.status !== "completed" && w.status !== "closed",
                      ).length
                    : wells.filter((w) => w.status === btn.value).length}
              </span>
            </button>
          ))}
        </div>

        {/* Loading */}
        {wellsQuery.isLoading && (
          <div className="space-y-[1px] bg-on-surface/5 rounded-[12px] overflow-hidden border border-outline-variant/40 card-rest">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="bg-surface-container-low p-5 animate-pulse flex items-center gap-6"
              >
                <div className="h-4 w-40 bg-on-surface/10 rounded" />
                <div className="h-4 w-20 bg-on-surface/5 rounded" />
                <div className="h-4 w-24 bg-on-surface/5 rounded" />
                <div className="h-4 w-16 bg-on-surface/5 rounded" />
                <div className="flex-1" />
                <div className="h-4 w-8 bg-on-surface/5 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {wellsQuery.isError && (
          <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 flex items-center gap-3">
            <span className="material-symbols-outlined text-error text-lg">
              cloud_off
            </span>
            <p className="text-sm text-error font-medium">
              Unable to load wells. Check your connection.
            </p>
          </div>
        )}

        {/* Empty */}
        {!wellsQuery.isLoading &&
          !wellsQuery.isError &&
          filtered.length === 0 && (
            <div className="bg-surface-container-low rounded-xl p-12 border border-on-surface/5 flex flex-col items-center justify-center text-center space-y-4">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant">
                oil_barrel
              </span>
              <h2 className="text-lg font-bold font-headline text-on-surface/60">
                {filter === "all" ? "No Wells Found" : `No ${filter} wells`}
              </h2>
              <p className="text-sm text-on-surface-variant font-body max-w-md">
                {filter === "all"
                  ? "Wells will appear here once synced from PropX."
                  : `No wells with "${filter}" status. Try a different filter.`}
              </p>
            </div>
          )}

        {/* Table */}
        {!wellsQuery.isLoading && filtered.length > 0 && (
          <div className="space-y-[1px] bg-on-surface/5 rounded-[12px] overflow-hidden border border-outline-variant/40 card-rest">
            {/* Header Row */}
            <div className="bg-surface-container-lowest/50 px-6 py-3 flex items-center gap-6 text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
              <div className="flex-1 min-w-[180px]">Name</div>
              <div className="w-24 text-center">Status</div>
              <div className="w-36">PropX Job ID</div>
              <div className="w-28 text-center">Daily Target</div>
              <div
                className="w-24 text-center"
                title="Flag wells whose loading-facility rate isn't dialed in yet — loads going to flagged wells show as 'Need Well Rate Info' on the dispatch desk"
              >
                Needs Rate?
              </div>
              <div className="w-28 text-center">Details</div>
              <div className="w-16 text-center">Actions</div>
            </div>

            {/* Data Rows */}
            {pageWells.map((well) => (
              <div key={well.id} className="group">
                <div className="bg-surface-container-low hover:bg-surface-container-high transition-all px-6 py-4 flex items-center gap-6">
                  {/* Name */}
                  <div className="flex-1 min-w-[180px]">
                    <span className="font-bold text-sm text-on-surface">
                      {well.name}
                    </span>
                    <button
                      onClick={() =>
                        aliasWellId === well.id
                          ? closeAliasEditor()
                          : openAliasEditor(well)
                      }
                      className="ml-2 font-label text-[10px] text-on-surface-variant hover:text-primary underline decoration-dotted underline-offset-2 cursor-pointer"
                      title="Click to manage aliases — use to bridge dispatcher vocabulary with PropX/Logistiq destination names."
                    >
                      {well.aliases.length === 0
                        ? "+ add alias"
                        : `${well.aliases.length} alias${well.aliases.length > 1 ? "es" : ""} — edit`}
                    </button>
                  </div>

                  {/* Status */}
                  <div className="w-24 text-center">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[well.status] ?? "bg-on-surface/10 text-on-surface/60"}`}
                    >
                      {well.status}
                    </span>
                  </div>

                  {/* PropX Job ID */}
                  <div className="w-36">
                    <span className="font-label text-xs text-on-surface/50 truncate block max-w-[130px]">
                      {well.propxJobId ?? "--"}
                    </span>
                  </div>

                  {/* Daily Target — inline editable */}
                  <div className="w-28 text-center">
                    {editingId === well.id ? (
                      <input
                        type="number"
                        min={0}
                        autoFocus
                        value={editValue}
                        disabled={updateWell.isPending}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit(well)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(well);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        className="w-16 text-center px-1.5 py-0.5 text-sm font-bold rounded border border-primary/40 focus:border-primary focus:outline-none bg-background tabular-nums"
                        aria-label={`Daily target for ${well.name}`}
                      />
                    ) : (
                      <>
                        <span className="font-label text-sm font-bold text-on-surface tabular-nums">
                          {well.dailyTargetLoads}
                        </span>
                        <span className="font-label text-xs text-on-surface-variant ml-1">
                          loads
                        </span>
                      </>
                    )}
                  </div>

                  {/* Needs Rate Info toggle (O-23) */}
                  <div className="w-24 text-center">
                    <label
                      className="inline-flex items-center justify-center cursor-pointer"
                      title={
                        well.needsRateInfo
                          ? "Loads to this well show as 'Need Well Rate Info' on the dispatch desk. Uncheck once the rate is confirmed."
                          : "Flag this well as needing rate info — its loads will surface in burnt-orange on the dispatch desk."
                      }
                    >
                      <input
                        type="checkbox"
                        checked={!!well.needsRateInfo}
                        disabled={updateWell.isPending}
                        onChange={(e) => {
                          updateWell.mutate(
                            {
                              id: well.id,
                              patch: { needsRateInfo: e.target.checked },
                            },
                            {
                              onSuccess: () =>
                                toast(
                                  `${well.name} ${
                                    e.target.checked
                                      ? "flagged as needing rate"
                                      : "rate-flag cleared"
                                  }`,
                                  "success",
                                ),
                              onError: (err) =>
                                toast(
                                  `Update failed: ${(err as Error).message}`,
                                  "error",
                                ),
                            },
                          );
                        }}
                        className="w-4 h-4 rounded accent-primary-container cursor-pointer disabled:opacity-40"
                        aria-label={`Toggle needs-rate-info for ${well.name}`}
                      />
                    </label>
                  </div>

                  {/* Details toggle — expands secondary commercial/logistics fields */}
                  <div className="w-28 text-center">
                    <button
                      onClick={() => toggleDetails(well)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                        detailsWellId === well.id
                          ? "bg-primary/15 text-primary"
                          : "text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"
                      }`}
                      title="Edit rate, FFC/FSC, mileage, customer, carrier, and loader/sandplant"
                      aria-expanded={detailsWellId === well.id}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {detailsWellId === well.id
                          ? "expand_less"
                          : "expand_more"}
                      </span>
                      {detailsWellId === well.id ? "Close" : "Details"}
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="w-16 text-center">
                    <button
                      onClick={() => startEdit(well)}
                      disabled={editingId === well.id}
                      aria-label={`Edit daily target for ${well.name}`}
                      className="p-2 hover:bg-surface-container-highest rounded-lg transition-colors cursor-pointer text-on-surface-variant hover:text-primary-container disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-lg">
                        edit
                      </span>
                    </button>
                  </div>
                </div>
                {/* Alias editor panel — expands under the row when the Aliases
                  link is clicked. Directly patches wells.aliases so the
                  auto-mapper picks up new destination strings on the next
                  run. Intentionally compact — no modal, no separate page. */}
                {aliasWellId === well.id && (
                  <div className="bg-surface-container-high px-6 py-3 border-l-2 border-primary">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant">
                        Aliases for {well.name}
                      </span>
                      <button
                        onClick={closeAliasEditor}
                        className="text-[11px] text-on-surface-variant hover:text-on-surface ml-auto"
                      >
                        close
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(well.aliases ?? []).map((alias) => (
                        <span
                          key={alias}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs border border-primary/30"
                        >
                          {alias}
                          <button
                            onClick={() => removeAlias(well, alias)}
                            disabled={updateWell.isPending}
                            className="hover:bg-primary/20 rounded-full w-4 h-4 flex items-center justify-center text-[10px] disabled:opacity-40"
                            aria-label={`Remove alias ${alias}`}
                            title={`Remove "${alias}"`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {(well.aliases ?? []).length === 0 && (
                        <span className="text-[11px] italic text-on-surface-variant">
                          No aliases yet — add one below.
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={aliasInput}
                        onChange={(e) => setAliasInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addAlias(well);
                          if (e.key === "Escape") closeAliasEditor();
                        }}
                        placeholder="Exact PropX or Logistiq destination string (e.g. DNR - Chili 117X)"
                        className="flex-1 px-2 py-1 text-xs border border-outline-variant rounded focus:border-primary focus:outline-none bg-background"
                        disabled={updateWell.isPending}
                        aria-label="New alias"
                      />
                      <button
                        onClick={() => addAlias(well)}
                        disabled={updateWell.isPending || !aliasInput.trim()}
                        className="px-3 py-1 text-xs font-bold rounded bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Add
                      </button>
                    </div>
                    <div className="text-[10px] text-on-surface-variant mt-1.5">
                      Tip: aliases let the auto-mapper match orphan loads whose
                      destination string doesn't match the well name exactly.
                      Paste what PropX / Logistiq writes in the destination
                      field — e.g. <code>Wells 1/2/3</code> or{" "}
                      <code>ASJ 4&amp;16-11-11 HC East</code>.
                    </div>
                  </div>
                )}

                {/* Details panel — secondary commercial / logistics fields.
                    Blur saves each field, Esc cancels the in-progress draft.
                    Carrier is a dropdown wired to the seeded carriers list. */}
                {detailsWellId === well.id && (
                  <WellDetailsEditor
                    well={well}
                    carriers={carriers}
                    onClose={() => setDetailsWellId(null)}
                    onSave={(patch, label) =>
                      updateWell.mutate(
                        { id: well.id, patch },
                        {
                          onSuccess: () =>
                            toast(`Updated ${well.name} → ${label}`, "success"),
                          onError: (err) =>
                            toast(
                              `Update failed: ${(err as Error).message}`,
                              "error",
                            ),
                        },
                      )
                    }
                    saving={updateWell.isPending}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination — only show when more than one page (P2-10) */}
        {!wellsQuery.isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between text-xs">
            <div className="text-on-surface/50 font-label">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-md border border-outline-variant/40 font-bold uppercase tracking-wide text-on-surface/60 hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
              >
                Prev
              </button>
              <span className="font-label text-on-surface/60 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-md border border-outline-variant/40 font-bold uppercase tracking-wide text-on-surface/60 hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── WellDetailsEditor ─────────────────────────────────────────────
// Secondary fields editor — rendered in an expand panel under the row.
// Fields commit on blur (save-on-leave) so admins can tab through the
// form without clicking save on each. Numeric fields are sent as
// strings to preserve precision across the wire (drizzle numeric →
// string round-trip).

interface WellDetailsEditorProps {
  well: Well;
  carriers: Array<{ id: number; name: string; phase: string; active: boolean }>;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>, label: string) => void;
  saving: boolean;
}

function WellDetailsEditor({
  well,
  carriers,
  onClose,
  onSave,
  saving,
}: WellDetailsEditorProps) {
  return (
    <div className="bg-surface-container-high px-6 py-4 border-l-2 border-primary-container">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant">
          Details — {well.name}
        </span>
        <button
          onClick={onClose}
          className="text-[11px] text-on-surface-variant hover:text-on-surface ml-auto"
        >
          close
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
        {/* Numeric + text detail fields */}
        {(
          [
            "ratePerTon",
            "ffcRate",
            "fscRate",
            "mileageFromLoader",
            "customerName",
            "loaderSandplant",
          ] as DetailField[]
        ).map((field) => (
          <DetailTextField
            key={field}
            field={field}
            well={well}
            onSave={onSave}
            saving={saving}
          />
        ))}

        {/* Carrier — dropdown wired to the seeded carriers list.
            Phase1 is the dispatch-rollout default; Phase2 gets flipped
            in carriers admin (follow-up). */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`carrier-${well.id}`}
            className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant"
          >
            Carrier
          </label>
          <select
            id={`carrier-${well.id}`}
            value={well.carrierId ?? ""}
            disabled={saving}
            onChange={(e) => {
              const raw = e.target.value;
              const next = raw === "" ? null : parseInt(raw, 10);
              if (next === (well.carrierId ?? null)) return;
              const label =
                next === null
                  ? "carrier cleared"
                  : `carrier → ${carriers.find((c) => c.id === next)?.name ?? next}`;
              onSave({ carrierId: next }, label);
            }}
            className="px-2 py-1 text-sm border border-outline-variant rounded focus:border-primary focus:outline-none bg-background disabled:opacity-40"
            aria-label={`Carrier for ${well.name}`}
          >
            <option value="">— none —</option>
            {carriers
              .filter((c) => c.active || c.id === well.carrierId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phase === "phase2" ? " (phase 2)" : ""}
                </option>
              ))}
          </select>
        </div>
      </div>
      <p className="text-[10px] text-on-surface-variant mt-3">
        Tip: numeric fields (rate, FFC, FSC, mileage) save on blur. Press Escape
        to discard an in-progress edit.
      </p>
    </div>
  );
}

interface DetailTextFieldProps {
  field: DetailField;
  well: Well;
  onSave: (patch: Record<string, unknown>, label: string) => void;
  saving: boolean;
}

function DetailTextField({
  field,
  well,
  onSave,
  saving,
}: DetailTextFieldProps) {
  const meta = DETAIL_FIELD_META[field];
  const current = (well[field] as string | null | undefined) ?? "";
  const [draft, setDraft] = useState<string>(String(current));
  const [focused, setFocused] = useState(false);

  // Keep draft in sync if the well row updates externally and the
  // field isn't currently being edited.
  useEffect(() => {
    if (!focused) setDraft(String(current));
  }, [current, focused]);

  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : trimmed;
    if ((next ?? "") === (current ?? "")) return;
    if (meta.numeric && next !== null) {
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed < 0) {
        // Revert invalid entry — let toast come from the user's next save
        setDraft(String(current));
        return;
      }
    }
    onSave({ [field]: next }, `${meta.label} → ${next ?? "cleared"}`);
  };

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={`${field}-${well.id}`}
        className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant"
      >
        {meta.label}
      </label>
      <div className="relative">
        {meta.prefix && (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant pointer-events-none">
            {meta.prefix}
          </span>
        )}
        <input
          id={`${field}-${well.id}`}
          type="text"
          inputMode={meta.numeric ? "decimal" : "text"}
          value={draft}
          disabled={saving}
          placeholder={meta.placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(String(current));
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={`w-full px-2 ${meta.prefix ? "pl-5" : ""} py-1 text-sm border border-outline-variant rounded focus:border-primary focus:outline-none bg-background disabled:opacity-40`}
          aria-label={`${meta.label} for ${well.name}`}
        />
      </div>
    </div>
  );
}
