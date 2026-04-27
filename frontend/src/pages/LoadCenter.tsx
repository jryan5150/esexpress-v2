import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useHeartbeat } from "../hooks/use-presence";
import { resolvePhotoUrl } from "../lib/photo-url";
import { EditableField } from "../components/EditableField";
import { PhotoLightbox } from "../components/PhotoLightbox";

interface LoadDetail {
  id: number;
  load_no: string | null;
  bol_no: string | null;
  ticket_no: string | null;
  driver_name: string | null;
  truck_no: string | null;
  delivered_on: string | null;
  weight_tons: string | null;
  weight_lbs: string | null;
  rate: string | null;
  source: string;
  origin_name: string | null;
  destination_name: string | null;
  customer_name: string | null;
  bill_to: string | null;
  status: string | null;
  assignment_status: string | null;
  handler_stage: string | null;
  photo_status: string | null;
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
    },
  });

  if (!loadId) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-6 max-w-4xl">
        <h1 className="text-2xl font-headline mb-2">Load Center</h1>
        <p className="text-sm text-text-secondary">
          Open a load from the worksurface (click a load in any cell drawer) to
          land here with that load preselected for editing.
        </p>
      </div>
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
          />
          <EditableField
            label="Truck #"
            value={l.truck_no}
            onSave={(v) => updateMutation.mutateAsync({ truckNo: v || null })}
          />
          <EditableField
            label="Trailer #"
            value={(l as { trailer_no?: string | null }).trailer_no ?? ""}
            onSave={(v) => updateMutation.mutateAsync({ trailerNo: v || null })}
          />
          <EditableField
            label="Carrier"
            value={(l as { carrier_name?: string | null }).carrier_name ?? ""}
            onSave={(v) =>
              updateMutation.mutateAsync({ carrierName: v || null })
            }
          />
          <EditableField
            label="Ticket #"
            value={l.ticket_no}
            onSave={(v) => updateMutation.mutateAsync({ ticketNo: v || null })}
          />
          <EditableField
            label="BOL #"
            value={l.bol_no}
            onSave={(v) => updateMutation.mutateAsync({ bolNo: v || null })}
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
          />
          <EditableField
            label="Net wt (tons)"
            value={
              (l as { net_weight_tons?: string | null }).net_weight_tons ?? ""
            }
            onSave={(v) =>
              updateMutation.mutateAsync({ netWeightTons: v || null })
            }
            type="decimal"
          />
          <EditableField
            label="Mileage"
            value={(l as { mileage?: string | null }).mileage ?? ""}
            onSave={(v) => updateMutation.mutateAsync({ mileage: v || null })}
            type="decimal"
          />
          <EditableField
            label="Rate"
            value={l.rate ?? ""}
            prefix="$"
            onSave={(v) => updateMutation.mutateAsync({ rate: v || null })}
            type="decimal"
          />
          <EditableField
            label="Delivered on"
            value={l.delivered_on ? l.delivered_on.slice(0, 10) : ""}
            onSave={(v) =>
              updateMutation.mutateAsync({ deliveredOn: v || null })
            }
            type="date"
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
          <Field label="Source status" value={l.status} />
          <Field label="Assignment status" value={l.assignment_status} />
          <Field label="Handler stage" value={l.handler_stage} />
          <Field label="Photo status" value={l.photo_status} />
          <div className="pt-2 border-t border-border">
            <div className="text-[10px] text-text-secondary uppercase tracking-wide mb-2">
              Photo
            </div>
            {photoUrl ? (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="block w-full p-0 border-0 bg-transparent cursor-zoom-in group"
                title="Click to view full size"
              >
                <img
                  src={photoUrl}
                  alt={`BOL for load ${l.id}`}
                  className="w-full max-h-96 object-contain rounded border border-border bg-black/10 group-hover:opacity-90 transition-opacity"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <div className="text-[10px] text-text-secondary mt-0.5 group-hover:text-accent">
                  click to zoom ⤢
                </div>
              </button>
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

      <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-700 p-3 text-xs text-amber-900 dark:text-amber-100">
        <strong>Heads up:</strong> inline editing on these fields is the
        Tuesday-follow-up. Today this view confirms the right load is selected
        and surfaces its photo + status. Edit via the existing BOL Center
        workflow at{" "}
        <Link to={`/bol?load=${l.id}`} className="underline">
          /bol?load={l.id}
        </Link>{" "}
        until inline edit ships.
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
