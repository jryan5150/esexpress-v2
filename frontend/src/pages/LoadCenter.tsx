import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useHeartbeat } from "../hooks/use-presence";
import { resolvePhotoUrl } from "../lib/photo-url";

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

export function LoadCenter() {
  useHeartbeat({ currentPage: "load-center" });
  const [params] = useSearchParams();
  const loadId = params.get("load");

  const detailQuery = useQuery({
    queryKey: ["load-center", loadId],
    queryFn: () => api.get<LoadDetail>(`/diag/load-detail?load=${loadId}`),
    enabled: !!loadId,
    staleTime: 15_000,
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
        {/* Editable fields panel — read-only display for now; click "Edit"
            on a field to enable inline edit (wires to existing
            PATCH /loads/:id endpoints in a Tuesday follow-up). */}
        <section className="rounded-lg border border-border bg-bg-secondary p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            Load values
          </h2>
          <Field label="Driver" value={l.driver_name} />
          <Field label="Truck #" value={l.truck_no} />
          <Field label="Ticket #" value={l.ticket_no} />
          <Field label="Load #" value={l.load_no} />
          <Field
            label="Weight (tons)"
            value={
              l.weight_tons
                ? Number(l.weight_tons).toFixed(2)
                : l.weight_lbs
                  ? `${(Number(l.weight_lbs) / 2000).toFixed(2)}`
                  : "—"
            }
          />
          <Field label="Rate" value={l.rate ? `$${l.rate}` : "—"} />
          <Field label="Origin" value={l.origin_name} />
          <Field label="Destination" value={l.destination_name} />
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
              <img
                src={photoUrl}
                alt={`BOL for load ${l.id}`}
                className="w-full max-h-96 object-contain rounded border border-border bg-black/10"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="text-xs text-text-secondary p-6 text-center border border-dashed border-border rounded">
                No photo on file
              </div>
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
