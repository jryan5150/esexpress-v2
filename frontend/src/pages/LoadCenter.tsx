import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useHeartbeat } from "../hooks/use-presence";
import { useRole } from "../hooks/use-role";
import { resolvePhotoUrl } from "../lib/photo-url";
import { EditableField } from "../components/EditableField";
import { PhotoLightbox } from "../components/PhotoLightbox";
import { RotatableImage } from "../components/RotatableImage";
import { StageStrip } from "../components/StageStrip";

interface LoadDetail {
  id: number;
  load_no: string | null;
  bol_no: string | null;
  ticket_no: string | null;
  driver_name: string | null;
  truck_no: string | null;
  trailer_no: string | null;
  carrier_name: string | null;
  delivered_on: string | null;
  weight_tons: string | null;
  weight_lbs: string | null;
  net_weight_tons: string | null;
  mileage: string | null;
  rate: string | null;
  source: string;
  origin_name: string | null;
  destination_name: string | null;
  customer_name: string | null;
  bill_to: string | null;
  status: string | null;
  assignment_id: number | null;
  assignment_status: string | null;
  handler_stage: string | null;
  photo_status: string | null;
  pcs_number: string | null;
  well_name: string | null;
  photos: Array<{ id: number; source_url: string; source: string }>;
}

interface LoadsListRow {
  id: number;
  load_no: string | null;
  ticket_no: string | null;
  driver_name: string | null;
  truck_no: string | null;
  delivered_on: string | null;
  weight_tons: string | null;
  source: string;
  bill_to: string | null;
  assignment_status: string | null;
  photo_status: string | null;
  effective_photo_status?: string | null;
  well_name: string | null;
}

// Sun-start week boundaries for a given delivered_on (UTC).
function weekBounds(
  deliveredOn: string | null,
): { since: string; until: string } | null {
  if (!deliveredOn) return null;
  const d = new Date(deliveredOn);
  if (Number.isNaN(d.getTime())) return null;
  const sun = new Date(d);
  sun.setUTCDate(d.getUTCDate() - d.getUTCDay());
  sun.setUTCHours(0, 0, 0, 0);
  const sat = new Date(sun.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    since: sun.toISOString().slice(0, 10),
    until: sat.toISOString().slice(0, 10),
  };
}

export function LoadCenter() {
  useHeartbeat({ currentPage: "load-center" });
  const role = useRole();
  const [params, setParams] = useSearchParams();
  const loadId = params.get("load");
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["load-center", loadId],
    queryFn: () => api.get<LoadDetail>(`/diag/load-detail?load=${loadId}`),
    enabled: !!loadId,
    staleTime: 15_000,
  });

  // Once we know the focused load's delivered_on, fetch every other load
  // from the same Sun-Sat week so the user can browse siblings without
  // bouncing back to the worksurface. Fires only after detail lands.
  const week = weekBounds(detailQuery.data?.delivered_on ?? null);
  const weekListQuery = useQuery({
    queryKey: ["load-center", "week", week?.since, week?.until],
    queryFn: () =>
      api.get<{
        loads: LoadsListRow[];
        total: number;
        returned: number;
      }>(
        `/diag/loads-list?since=${week!.since}&until=${week!.until}&limit=500`,
      ),
    enabled: !!week,
    staleTime: 30_000,
  });

  // Inline edit mutation — PATCH /loads/:id with the field that changed.
  const qc = useQueryClient();
  const updateMutation = useMutation({
    mutationFn: (patch: Record<string, string | null>) =>
      api.patch(`/dispatch/loads/${loadId}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["load-center", loadId] });
      // Cell color on the worksurface is computed from underlying load
      // stage — invalidate that grid so any open Today tab ticks
      // forward without a refresh.
      qc.invalidateQueries({ queryKey: ["worksurface", "well-grid"] });
    },
  });

  // Stage advance — same /dispatch/workbench/:assignmentId/advance endpoint
  // used by the cell-drawer inline panel. assignmentId comes from /diag/load-detail.
  const advanceMutation = useMutation({
    mutationFn: ({
      assignmentId,
      stage,
    }: {
      assignmentId: number;
      stage: string;
    }) => api.post(`/dispatch/workbench/${assignmentId}/advance`, { stage }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["load-center", loadId] });
      qc.invalidateQueries({ queryKey: ["worksurface", "well-grid"] });
      qc.invalidateQueries({ queryKey: ["worksurface", "cell-context"] });
    },
  });

  // Push to PCS — terminal action; same endpoint as the inline panel.
  // Backend may run in 'live' or 'rehearsal' mode; UI swaps copy based
  // on the response.mode field so Jess always knows which thing happened.
  const pushPcsMutation = useMutation({
    mutationFn: (assignmentId: number) =>
      api.post<{
        success: boolean;
        mode?: "live" | "rehearsal";
        pcsLoadNo?: string;
        pcsNumber?: string;
        pendingAt?: string;
        error?: { code?: string; message?: string };
        message?: string;
      }>(`/pcs/dispatch`, { assignmentId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["load-center", loadId] });
      qc.invalidateQueries({ queryKey: ["worksurface", "well-grid"] });
      qc.invalidateQueries({ queryKey: ["worksurface", "cell-context"] });
    },
  });

  if (!loadId) {
    return (
      <LoadsListBrowser onPick={(id) => setParams({ load: String(id) })} />
    );
  }

  if (detailQuery.isLoading) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-6 text-text-secondary">
        Loading load #{loadId}…
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <h1 className="text-2xl font-headline mb-2">Load Center</h1>
        <p className="text-sm text-red-500">
          Couldn't load #{loadId}.{" "}
          {detailQuery.error
            ? String((detailQuery.error as Error).message)
            : ""}
        </p>
        <Link to="/workbench" className="text-sm text-accent hover:underline">
          ← Back to worksurface
        </Link>
      </div>
    );
  }

  const l = detailQuery.data;
  const photoUrl = l.photos?.[0]?.source_url
    ? resolvePhotoUrl(l.photos[0].source_url)
    : null;
  // Role-aware read-only flags. Dispatch fields lock for finance/viewer;
  // rate locks for builder/viewer (only admin + finance own rate).
  const dispatchReadOnly = !role.canEditDispatch;
  const rateReadOnly = !role.canEditRate;
  const readOnlyTitle =
    role.role === "finance"
      ? "Read-only — finance role doesn't edit dispatch fields"
      : role.role === "viewer"
        ? "Read-only — viewer role"
        : "Read-only";

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 max-w-5xl mx-auto space-y-4">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <Link to="/workbench" className="text-xs text-accent hover:underline">
            ← Worksurface
          </Link>
          <h1 className="text-2xl font-headline mt-1">
            Load Center · {l.well_name ?? l.destination_name ?? "—"}
          </h1>
          <p className="text-sm text-text-secondary">
            {l.bill_to ?? l.customer_name ?? "—"} ·{" "}
            {l.delivered_on
              ? new Date(l.delivered_on).toLocaleString()
              : "no delivery date"}{" "}
            · source: {l.source}
          </p>
        </div>
        <span className="px-2 py-1 text-xs rounded-full bg-bg-secondary border border-border">
          load #{l.id}
        </span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Editable fields panel — click any value to edit, save on Enter
            or blur, cancel on Escape. Wires to PATCH /dispatch/loads/:id. */}
        <section className="rounded-lg border border-border bg-bg-secondary p-4 space-y-3">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide">
              Load values
            </h2>
            <span className="text-[10px] text-text-secondary">
              click any value to edit
            </span>
          </div>
          <EditableField
            label="Driver"
            value={l.driver_name}
            onSave={(v) =>
              updateMutation.mutateAsync({ driverName: v || null })
            }
            readOnly={dispatchReadOnly}
            readOnlyTitle={readOnlyTitle}
          />
          <EditableField
            label="Truck #"
            value={l.truck_no}
            onSave={(v) => updateMutation.mutateAsync({ truckNo: v || null })}
            readOnly={dispatchReadOnly}
            readOnlyTitle={readOnlyTitle}
          />
          <EditableField
            label="Trailer #"
            value={l.trailer_no ?? ""}
            onSave={(v) => updateMutation.mutateAsync({ trailerNo: v || null })}
            readOnly={dispatchReadOnly}
            readOnlyTitle={readOnlyTitle}
          />
          <EditableField
            label="Carrier"
            value={l.carrier_name ?? ""}
            onSave={(v) =>
              updateMutation.mutateAsync({ carrierName: v || null })
            }
            readOnly={dispatchReadOnly}
            readOnlyTitle={readOnlyTitle}
          />
          <EditableField
            label="Ticket #"
            value={l.ticket_no}
            onSave={(v) => updateMutation.mutateAsync({ ticketNo: v || null })}
            readOnly={dispatchReadOnly}
            readOnlyTitle={readOnlyTitle}
          />
          <EditableField
            label="BOL #"
            value={l.bol_no}
            onSave={(v) => updateMutation.mutateAsync({ bolNo: v || null })}
            readOnly={dispatchReadOnly}
            readOnlyTitle={readOnlyTitle}
          />
          <Field label="Load #" value={l.load_no} />
          <EditableField
            label="Weight (tons)"
            value={
              l.weight_tons
                ? Number(l.weight_tons).toFixed(2)
                : l.weight_lbs
                  ? (Number(l.weight_lbs) / 2000).toFixed(2)
                  : ""
            }
            onSave={(v) =>
              updateMutation.mutateAsync({ weightTons: v || null })
            }
            type="decimal"
            readOnly={dispatchReadOnly}
            readOnlyTitle={readOnlyTitle}
          />
          <EditableField
            label="Net wt (tons)"
            value={l.net_weight_tons ?? ""}
            onSave={(v) =>
              updateMutation.mutateAsync({ netWeightTons: v || null })
            }
            type="decimal"
            readOnly={dispatchReadOnly}
            readOnlyTitle={readOnlyTitle}
          />
          <EditableField
            label="Mileage"
            value={l.mileage ?? ""}
            onSave={(v) => updateMutation.mutateAsync({ mileage: v || null })}
            type="decimal"
            readOnly={dispatchReadOnly}
            readOnlyTitle={readOnlyTitle}
          />
          <EditableField
            label="Rate"
            value={l.rate ?? ""}
            prefix="$"
            onSave={(v) => updateMutation.mutateAsync({ rate: v || null })}
            type="decimal"
            readOnly={rateReadOnly}
            readOnlyTitle="Read-only — only admin or finance can edit rate"
          />
          <EditableField
            label="Delivered on"
            value={l.delivered_on ? l.delivered_on.slice(0, 10) : ""}
            onSave={(v) =>
              updateMutation.mutateAsync({ deliveredOn: v || null })
            }
            type="date"
            readOnly={dispatchReadOnly}
            readOnlyTitle={readOnlyTitle}
          />
          <Field label="Origin" value={l.origin_name} />
          <Field label="Destination" value={l.destination_name} />
          {updateMutation.isError && (
            <div className="text-xs text-red-500">
              Save failed:{" "}
              {(updateMutation.error as Error)?.message ?? "unknown error"}
            </div>
          )}
          {updateMutation.isSuccess && (
            <div className="text-xs text-emerald-600">Saved.</div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-bg-secondary p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            Status
          </h2>

          {/* Stage strip + Push to PCS — terminal action surface. Same
              controls as the cell-drawer's inline expand panel so anyone
              landing here from the searchable list can move the load
              through the workflow without bouncing back to Today.
              Hidden for finance + viewer roles (read-only on dispatch). */}
          {l.assignment_id != null && role.canAdvanceStage && (
            <div className="space-y-2 pb-3 border-b border-border">
              <div className="text-[10px] text-text-secondary uppercase tracking-wide">
                Workflow stage
              </div>
              <StageStrip
                currentStage={l.handler_stage ?? "uncertain"}
                isPending={advanceMutation.isPending}
                onAdvance={(stage) => {
                  // Backward-advance guard. If the load is queued for
                  // PCS (pcs_pending_at set, no pcs_number yet) and the
                  // user is moving it back to a pre-entered stage,
                  // confirm before clearing the PCS queue marker so a
                  // misclick doesn't silently drop a queued load.
                  const lExt = l as { pcs_pending_at?: string | null };
                  const queued = !!lExt.pcs_pending_at && !l.pcs_number;
                  const earlier = ["uncertain", "ready_to_build", "building"];
                  if (queued && earlier.includes(stage)) {
                    const ok = window.confirm(
                      "This load is queued for PCS (rehearsal mode). " +
                        `Moving it back to "${stage.replace(/_/g, " ")}" will clear the queue marker — ` +
                        "the cutover script won't push it on its own. " +
                        "Click OK to clear the queue and move backward, or Cancel to keep it queued.",
                    );
                    if (!ok) return Promise.resolve();
                    return advanceMutation
                      .mutateAsync({
                        assignmentId: l.assignment_id!,
                        stage,
                      })
                      .then(async () => {
                        // Clear pcs_pending_at via the load PATCH —
                        // backend dispatch service writes that column
                        // but the stage-advance route doesn't, so do
                        // it here explicitly.
                        await api.patch(
                          `/dispatch/loads/${l.id}/clear-pcs-pending`,
                          {},
                        );
                        qc.invalidateQueries({
                          queryKey: ["load-center", loadId],
                        });
                      });
                  }
                  return advanceMutation.mutateAsync({
                    assignmentId: l.assignment_id!,
                    stage,
                  });
                }}
              />
              {advanceMutation.isError && (
                <div className="text-[11px] text-red-600">
                  Stage change failed:{" "}
                  {(advanceMutation.error as Error)?.message ?? "unknown error"}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[10px] text-text-secondary">
                  Click any stage to set it directly. Hover for what each stage
                  means.
                </span>
                {role.canPushPcs &&
                  (() => {
                    const mode = pushPcsMutation.data?.mode ?? "rehearsal";
                    const lExt = l as { pcs_pending_at?: string | null };
                    const isPending = !!lExt.pcs_pending_at && !l.pcs_number;
                    const livePushed = !!l.pcs_number;
                    let label: string;
                    if (pushPcsMutation.isPending) label = "Pushing…";
                    else if (livePushed) label = "↻ Re-push to PCS";
                    else if (mode === "rehearsal" && isPending)
                      label = "↻ Re-queue for PCS";
                    else if (mode === "rehearsal")
                      label = "→ Mark ready for PCS";
                    else label = "→ Push to PCS";
                    return (
                      <button
                        type="button"
                        onClick={() => pushPcsMutation.mutate(l.assignment_id!)}
                        disabled={pushPcsMutation.isPending}
                        className={`px-3 py-1 text-xs font-semibold rounded-md text-white hover:opacity-90 disabled:opacity-50 ${
                          mode === "rehearsal"
                            ? "bg-amber-600"
                            : "bg-emerald-600"
                        }`}
                        title={
                          mode === "rehearsal"
                            ? "Kyle's PCS connection isn't live yet. This marks the load as ready; the cutover will push it for real when OAuth lands."
                            : "Hand this load off to PCS. v2 stops tracking after a successful push."
                        }
                      >
                        {label}
                      </button>
                    );
                  })()}
              </div>
              {pushPcsMutation.isError && (
                <div className="text-[11px] px-2 py-1.5 rounded bg-red-50 border border-red-300 text-red-900">
                  <strong>PCS rejected the push:</strong>{" "}
                  {(pushPcsMutation.error as Error)?.message ?? "unknown error"}
                  . Verify the load's required fields (well, driver, weight,
                  photo) and try again.
                </div>
              )}
              {pushPcsMutation.isSuccess && pushPcsMutation.data && (
                <div
                  className={`text-[11px] px-2 py-1.5 rounded ${
                    pushPcsMutation.data.mode === "rehearsal"
                      ? "bg-amber-50 border border-amber-300 text-amber-900"
                      : "bg-emerald-50 border border-emerald-300 text-emerald-900"
                  }`}
                >
                  {pushPcsMutation.data.success ? (
                    pushPcsMutation.data.mode === "rehearsal" ? (
                      <>
                        <strong>Saved as ready ✓</strong> — Kyle's PCS will pick
                        this up when OAuth goes live. Visible on{" "}
                        <Link to="/flagged" className="underline">
                          /flagged
                        </Link>{" "}
                        under "📦 Ready for PCS".
                      </>
                    ) : (
                      <>
                        <strong>PCS accepted ✓</strong>
                        {(pushPcsMutation.data.pcsLoadNo ||
                          pushPcsMutation.data.pcsNumber) && (
                          <>
                            {" "}
                            — now in PCS as #
                            {pushPcsMutation.data.pcsLoadNo ??
                              pushPcsMutation.data.pcsNumber}
                          </>
                        )}
                        . Load handed off; v2 stops tracking from here.
                      </>
                    )
                  ) : (
                    <>
                      <strong>Push call returned but not accepted:</strong>{" "}
                      {pushPcsMutation.data.error?.message ??
                        pushPcsMutation.data.message ??
                        "see logs"}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <Field label="Source status" value={l.status} />
          <Field label="Assignment status" value={l.assignment_status} />
          <Field label="Handler stage" value={l.handler_stage} />
          <Field label="Photo status" value={l.photo_status} />
          <div className="pt-2 border-t border-border">
            <div className="text-[10px] text-text-secondary uppercase tracking-wide mb-2">
              Photo
            </div>
            {photoUrl ? (
              <div className="space-y-1">
                <RotatableImage
                  src={photoUrl}
                  alt={`BOL for load ${l.id}`}
                  storageKey={`load-${l.id}`}
                  imgClassName="w-full max-h-96 object-contain rounded border border-border bg-black/10 cursor-zoom-in hover:opacity-90 transition-opacity"
                  onImgClick={() => setLightboxOpen(true)}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <div className="text-[10px] text-text-secondary flex items-center justify-between">
                  <span>click image to zoom ⤢</span>
                  <span>↻ rotates &amp; remembers per load</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-text-secondary p-6 text-center border border-dashed border-border rounded">
                No photo on file
              </div>
            )}
            {lightboxOpen && photoUrl && (
              <PhotoLightbox
                urls={(l.photos ?? []).map((p) => p.source_url)}
                initialIndex={0}
                alt={`BOL for load ${l.id}`}
                onClose={() => setLightboxOpen(false)}
              />
            )}
          </div>
        </section>
      </div>

      {/* Other loads from the same week — click any row to switch focus */}
      {week && (
        <section className="rounded-lg border border-border bg-bg-primary">
          <div className="px-4 py-3 border-b border-border flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide">
              Other loads this week
              <span className="ml-2 text-xs text-text-secondary normal-case font-normal">
                ({week.since} → {week.until})
              </span>
            </h2>
            {weekListQuery.data && (
              <span className="text-xs text-text-secondary">
                {weekListQuery.data.returned} of {weekListQuery.data.total}{" "}
                total
              </span>
            )}
          </div>
          {weekListQuery.isLoading && (
            <div className="px-4 py-6 text-xs text-text-secondary text-center">
              Loading…
            </div>
          )}
          {weekListQuery.data && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-text-secondary uppercase tracking-wide">
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-left py-2 px-3">Driver</th>
                    <th className="text-left py-2 px-3">Ticket #</th>
                    <th className="text-left py-2 px-3">Well</th>
                    <th className="text-right py-2 px-3">Tons</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-left py-2 px-3">Photo</th>
                  </tr>
                </thead>
                <tbody>
                  {weekListQuery.data.loads.map((row) => {
                    const focused = row.id === l.id;
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-border/40 cursor-pointer transition-colors ${
                          focused
                            ? "bg-accent/10 font-semibold"
                            : "hover:bg-bg-tertiary/40"
                        }`}
                        onClick={() => {
                          const next = new URLSearchParams(params);
                          next.set("load", String(row.id));
                          setParams(next);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <td className="py-1.5 px-3 tabular-nums text-text-secondary">
                          {row.delivered_on
                            ? new Date(row.delivered_on).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="py-1.5 px-3">
                          {row.driver_name ?? "—"}
                          {focused && (
                            <span className="ml-2 text-[10px] text-accent">
                              ← viewing
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 tabular-nums">
                          {row.ticket_no ?? "—"}
                        </td>
                        <td className="py-1.5 px-3 truncate max-w-[16rem]">
                          {row.well_name ?? "—"}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums">
                          {row.weight_tons
                            ? Number(row.weight_tons).toFixed(2)
                            : "—"}
                        </td>
                        <td className="py-1.5 px-3 text-text-secondary">
                          {row.assignment_status ?? "—"}
                        </td>
                        <td className="py-1.5 px-3">
                          {(() => {
                            const eff =
                              row.effective_photo_status ?? row.photo_status;
                            return eff === "attached" ? (
                              <span
                                className="text-green-600"
                                title="Photo attached"
                              >
                                ●
                              </span>
                            ) : eff === "pending" ? (
                              <span className="text-amber-500" title="Pending">
                                ○
                              </span>
                            ) : (
                              <span className="text-red-500" title="Missing">
                                ✕
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 items-baseline text-sm">
      <div className="text-[10px] text-text-secondary uppercase tracking-wide">
        {label}
      </div>
      <div className="col-span-2 font-medium">
        {value ?? <span className="text-text-secondary">—</span>}
      </div>
    </div>
  );
}

// EditableField extracted to ../components/EditableField for reuse in
// the WorkbenchDrawer's per-load inline-expand panel.

// Empty-state landing for /load-center (no ?load param). Renders a
// searchable list using /diag/loads-list so the sidebar entry actually
// produces useful output instead of bouncing the user back to Today.
function LoadsListBrowser({ onPick }: { onPick: (id: number) => void }) {
  const [search, setSearch] = useState("");
  // Debounce search a beat so each keystroke doesn't fire a query.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const listQuery = useQuery({
    queryKey: ["load-center", "list", debounced],
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set("limit", "200");
      if (debounced) sp.set("q", debounced);
      return api.get<{
        loads: LoadsListRow[];
        total: number;
        returned: number;
      }>(`/diag/loads-list?${sp.toString()}`);
    },
    staleTime: 30_000,
  });

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 max-w-6xl mx-auto space-y-4">
      <header>
        <h1 className="text-2xl font-headline">Load Center</h1>
        <p className="text-sm text-text-secondary">
          Pick a load to open the editable workspace, or filter by BOL, ticket
          #, driver, truck, well, or customer.
        </p>
      </header>
      <div className="flex items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search loads — BOL, ticket #, driver, truck, well, customer…"
          className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent/30"
          autoFocus
        />
        {listQuery.data && (
          <span className="text-xs text-text-secondary tabular-nums whitespace-nowrap">
            {listQuery.data.returned} of {listQuery.data.total}
          </span>
        )}
      </div>
      <section className="rounded-lg border border-border bg-bg-primary">
        {listQuery.isLoading && (
          <div className="px-4 py-6 text-xs text-text-secondary text-center">
            Loading…
          </div>
        )}
        {listQuery.isError && (
          <div className="px-4 py-6 text-xs text-red-500 text-center">
            Couldn't load list. {(listQuery.error as Error)?.message ?? ""}
          </div>
        )}
        {listQuery.data && listQuery.data.loads.length === 0 && (
          <div className="px-4 py-6 text-xs text-text-secondary text-center">
            No loads match{debounced ? ` "${debounced}"` : ""}.
          </div>
        )}
        {listQuery.data && listQuery.data.loads.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-text-secondary uppercase tracking-wide">
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-left py-2 px-3">Driver</th>
                  <th className="text-left py-2 px-3">Truck #</th>
                  <th className="text-left py-2 px-3">Ticket #</th>
                  <th className="text-left py-2 px-3">Well</th>
                  <th className="text-left py-2 px-3">Bill To</th>
                  <th className="text-right py-2 px-3">Tons</th>
                  <th className="text-left py-2 px-3">Status</th>
                  <th className="text-left py-2 px-3">Photo</th>
                </tr>
              </thead>
              <tbody>
                {listQuery.data.loads.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/40 cursor-pointer hover:bg-bg-tertiary/40 transition-colors"
                    onClick={() => onPick(row.id)}
                  >
                    <td className="py-1.5 px-3 tabular-nums text-text-secondary">
                      {row.delivered_on
                        ? new Date(row.delivered_on).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-1.5 px-3">{row.driver_name ?? "—"}</td>
                    <td className="py-1.5 px-3 tabular-nums">
                      {row.truck_no ?? "—"}
                    </td>
                    <td className="py-1.5 px-3 tabular-nums">
                      {row.ticket_no ?? "—"}
                    </td>
                    <td className="py-1.5 px-3 truncate max-w-[14rem]">
                      {row.well_name ?? "—"}
                    </td>
                    <td className="py-1.5 px-3 truncate max-w-[12rem]">
                      {row.bill_to ?? "—"}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      {row.weight_tons
                        ? Number(row.weight_tons).toFixed(2)
                        : "—"}
                    </td>
                    <td className="py-1.5 px-3 text-text-secondary">
                      {row.assignment_status ?? "—"}
                    </td>
                    <td className="py-1.5 px-3">
                      {(() => {
                        const eff =
                          row.effective_photo_status ?? row.photo_status;
                        return eff === "attached" ? (
                          <span
                            className="text-green-600"
                            title="Photo attached"
                          >
                            ●
                          </span>
                        ) : eff === "pending" ? (
                          <span className="text-amber-500" title="Pending">
                            ○
                          </span>
                        ) : (
                          <span className="text-red-500" title="Missing">
                            ✕
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
