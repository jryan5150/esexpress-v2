import { useState } from "react";
import { Link } from "react-router-dom";
import { useBolQueue } from "../hooks/use-bol";
import { ManualMatchPanel } from "./ManualMatchPanel";
import { resolvePhotoUrl } from "../lib/photo-url";
import { api } from "../lib/api";
import { useToast } from "./Toast";

/**
 * Inline panel for matching pending JotForm photos to loads, embedded
 * directly in the Validate page. Replaces the Phase 1 link-out to BOL
 * Center reconciliation tab — Jess Apr 15: "I would go to the validation
 * page... I would hit validate, validate." One front door for all
 * pre-dispatch verification.
 *
 * Shows the 6 most recent unmatched submissions as cards. Click a card
 * to expand the ManualMatchPanel inline. After a successful match, the
 * card disappears (queries invalidate via React Query). Operator can
 * still click "Open BOL Center" for the full multi-tab experience.
 *
 * Phase 2 of the meld spec
 * (docs/superpowers/specs/2026-04-24-validate-bol-meld-design.md).
 */
export function AwaitingPhotoMatchSection({
  defaultOpen = false,
}: {
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [creatingId, setCreatingId] = useState<number | null>(null);
  // Per-import preflight result + visible candidates list. When non-null,
  // the row shows the preflight UI ("review these N possible matches
  // before creating manual"). Operator either picks one (via the existing
  // ManualMatchPanel) or clicks "Create anyway — none of these match".
  const [preflightById, setPreflightById] = useState<
    Record<number, PreflightResult | null>
  >({});
  const { toast } = useToast();

  const queueQuery = useBolQueue({
    status: "unmatched",
    limit: 6,
    page: 1,
  });

  type Candidate = {
    loadId: number;
    loadNo: string;
    source: string;
    bolNo: string | null;
    ticketNo: string | null;
    driverName: string | null;
    deliveredOn: string | null;
    matchReason: string;
  };
  type PreflightResult = { ok: boolean; candidates: Candidate[] };

  /**
   * Confidence pre-flight before creating a manual load. We refuse to
   * silently mint a duplicate over an existing load — the operator
   * must explicitly review any candidate matches we find. This is the
   * trust contract: if a load could already exist (case-insensitive
   * BOL, raw_data nested fields, or same driver±1 day), surface it.
   */
  const runPreflight = async (importId: number) => {
    setCreatingId(importId);
    try {
      const resp = (await api.get(
        `/dispatch/loads/manual-from-jotform/preflight/${importId}`,
      )) as { data?: PreflightResult };
      const result = resp.data ?? { ok: true, candidates: [] };
      setPreflightById((prev) => ({ ...prev, [importId]: result }));
      // If preflight is clean, immediately proceed to create.
      if (result.ok) {
        await createManualLoad(importId, false);
      }
    } catch (err) {
      toast(
        `Preflight failed: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    } finally {
      setCreatingId(null);
    }
  };

  const createManualLoad = async (importId: number, force: boolean) => {
    setCreatingId(importId);
    try {
      const resp = (await api.post("/dispatch/loads/manual-from-jotform", {
        importId,
        force,
      })) as {
        success?: boolean;
        data?: { loadId?: number; loadNo?: string; bolNo?: string | null };
      };
      const data = resp.data;
      toast(
        `Created manual load ${data?.loadNo ?? data?.loadId ?? ""} from BOL ${data?.bolNo ?? "?"}`,
        "success",
      );
      // Clear preflight + refetch the queue so the row disappears.
      setPreflightById((prev) => {
        const next = { ...prev };
        delete next[importId];
        return next;
      });
      queueQuery.refetch();
    } catch (err) {
      toast(
        `Create failed: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    } finally {
      setCreatingId(null);
    }
  };

  // The /jotform/queue endpoint returns shape {data, meta}.
  type QueueItem = {
    submission: {
      id: number;
      bolNumber: string | null;
      driverName: string | null;
      truckNo: string | null;
      photoUrls: string[];
      submittedAt: string | null;
    };
  };
  // api.ts unwraps json.data; backend returns {success, data:[...], meta}
  // so queryQuery.data is the array directly. Handle both shapes for
  // safety (matches BolQueue.tsx:340-342 pattern).
  const response = queueQuery.data as
    | { data?: QueueItem[]; meta?: { total?: number } }
    | QueueItem[]
    | undefined;
  const items: QueueItem[] = Array.isArray(response)
    ? response
    : (response?.data ?? []);
  const total = Array.isArray(response)
    ? items.length
    : (response?.meta?.total ?? items.length);

  if (queueQuery.isLoading || total === 0) return null;

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-surface-container-lowest border border-outline-variant/40 rounded-[10px] hover:bg-surface-container-high transition-all cursor-pointer text-left"
      >
        <span
          className="material-symbols-outlined text-primary-container text-xl shrink-0"
          aria-hidden
        >
          add_a_photo
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-data text-lg font-bold text-primary-container tabular-nums leading-none">
              {total}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface">
              Awaiting Photo Match
            </span>
          </div>
          <p className="text-[10px] text-on-surface-variant mt-0.5">
            Driver photos arrived &mdash; click to match them to a load inline
          </p>
        </div>
        <span
          className={`material-symbols-outlined text-on-surface-variant text-base shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className="space-y-2 pl-2">
          {items.length === 0 ? (
            <div className="text-sm text-on-surface-variant px-4 py-3">
              No unmatched submissions in the latest sync window.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {items.map((item) => {
                  const sub = item.submission;
                  const isExpanded = expandedId === sub.id;
                  const firstPhoto = sub.photoUrls?.[0]
                    ? resolvePhotoUrl(sub.photoUrls[0], { thumb: true })
                    : null;
                  return (
                    <div
                      key={sub.id}
                      className={`bg-surface-container-lowest border rounded-[10px] overflow-hidden transition-all ${
                        isExpanded
                          ? "col-span-full border-primary/60 shadow-md"
                          : "border-outline-variant/40 hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-stretch">
                        {firstPhoto ? (
                          <div className="w-24 h-24 bg-surface-container-high shrink-0 overflow-hidden">
                            <img
                              src={firstPhoto}
                              alt={`Ticket ${sub.bolNumber ?? sub.id}`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-24 h-24 bg-surface-container-high shrink-0 flex items-center justify-center">
                            <span className="material-symbols-outlined text-outline text-2xl">
                              no_photography
                            </span>
                          </div>
                        )}
                        <div className="flex-1 p-3 min-w-0">
                          <div className="font-label text-sm font-bold text-on-surface truncate">
                            BOL {sub.bolNumber || "—"}
                          </div>
                          <div className="text-[11px] text-on-surface-variant truncate">
                            {sub.driverName || "no driver"}
                            {sub.truckNo ? ` · Truck ${sub.truckNo}` : ""}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId(isExpanded ? null : sub.id)
                              }
                              className="text-[11px] font-semibold uppercase tracking-wider text-primary hover:underline cursor-pointer"
                            >
                              {isExpanded ? "Cancel" : "Match to load"}
                            </button>
                            <button
                              type="button"
                              onClick={() => runPreflight(sub.id)}
                              disabled={creatingId === sub.id}
                              className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:underline cursor-pointer disabled:opacity-50"
                              title="Create a source='manual' load from this submission. Pre-flight check runs first to verify no existing load matches."
                            >
                              {creatingId === sub.id
                                ? "Checking…"
                                : "No match → Create manual"}
                            </button>
                          </div>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1">
                          <ManualMatchPanel
                            importId={sub.id}
                            onLinked={() => {
                              setExpandedId(null);
                              queueQuery.refetch();
                            }}
                          />
                        </div>
                      )}
                      {preflightById[sub.id] && !preflightById[sub.id]?.ok && (
                        <div className="px-3 pb-3 pt-1 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-200/60">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200 mb-2">
                            ⚠ Pre-flight found{" "}
                            {preflightById[sub.id]?.candidates.length} possible
                            match(es) — review before creating
                          </div>
                          <div className="space-y-1.5 mb-3">
                            {preflightById[sub.id]?.candidates.map((c) => (
                              <div
                                key={c.loadId}
                                className="bg-surface-container-lowest border border-outline-variant/40 rounded-md px-2 py-1.5 text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-bold tabular-nums">
                                    #{c.loadNo}
                                  </span>
                                  <span className="text-[10px] uppercase text-outline">
                                    {c.source}
                                  </span>
                                  <span className="ml-auto text-[10px] text-amber-800 dark:text-amber-300">
                                    {c.matchReason}
                                  </span>
                                </div>
                                <div className="text-[11px] text-on-surface-variant mt-0.5">
                                  {c.driverName ?? "no driver"}
                                  {" · "}BOL {c.bolNo ?? "—"}
                                  {" · "}ticket {c.ticketNo ?? "—"}
                                  {" · "}
                                  {c.deliveredOn
                                    ? new Date(
                                        c.deliveredOn,
                                      ).toLocaleDateString()
                                    : "no date"}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedId(sub.id);
                                setPreflightById((p) => {
                                  const n = { ...p };
                                  delete n[sub.id];
                                  return n;
                                });
                              }}
                              className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-md bg-primary text-on-primary hover:brightness-110 cursor-pointer"
                            >
                              Open Match Panel
                            </button>
                            <button
                              type="button"
                              onClick={() => createManualLoad(sub.id, true)}
                              disabled={creatingId === sub.id}
                              className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-md bg-amber-700 text-white hover:bg-amber-800 cursor-pointer disabled:opacity-50"
                              title="Force-create a manual load even though candidates exist. Use only after reviewing each candidate."
                            >
                              {creatingId === sub.id
                                ? "Creating…"
                                : "Create anyway — none of these match"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPreflightById((p) => {
                                  const n = { ...p };
                                  delete n[sub.id];
                                  return n;
                                })
                              }
                              className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-md text-on-surface-variant hover:text-on-surface cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {total > items.length && (
                <div className="flex items-center justify-between bg-surface-container-lowest border border-outline-variant/30 rounded-[8px] px-3 py-2">
                  <span className="text-[11px] text-on-surface-variant">
                    Showing first {items.length} of {total} pending submissions
                  </span>
                  <Link
                    to="/bol?tab=reconciliation"
                    className="text-[11px] font-semibold uppercase tracking-wider text-primary hover:underline"
                  >
                    Open BOL Center →
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
