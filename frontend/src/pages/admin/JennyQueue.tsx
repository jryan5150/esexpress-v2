import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useHeartbeat } from "../../hooks/use-presence";

/**
 * Jenny's Queue — mirrors the "Other Jobs to be Invoiced (Jenny)" section
 * at the bottom of the Load Count Sheet's Current/Previous tabs. Non-
 * standard work that doesn't fit the well-day grid: Truck Pushers,
 * Equipment Moves, Frac Chem, Finoric, JoeTex, Panel Truss, Other.
 *
 * v2 storage: loads.job_category enum. Default 'standard' = well-bound
 * load. Anything else lives here.
 */

interface CategoryRow {
  bill_to: string | null;
  load_count: number;
  last_seen: string | null;
}
interface CategoryGroup {
  category: string;
  total: number;
  rows: CategoryRow[];
}
interface SampleLoad {
  id: number;
  job_category: string;
  load_no: string | null;
  delivered_on: string | null;
  driver_name: string | null;
  product_description: string | null;
  weight_tons: string | null;
  bill_to: string | null;
}
interface QueuePayload {
  totalNonStandard: number;
  categories: CategoryGroup[];
  samples: SampleLoad[];
  sourceLabel: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  truck_pusher: "Truck Pushers",
  equipment_move: "Equipment Moves",
  flatbed: "Flatbed Loads",
  frac_chem: "Frac Chem",
  finoric: "Finoric",
  joetex: "JoeTex",
  panel_truss: "Panel Truss",
  other: "Other",
};

function formatCategory(c: string): string {
  return CATEGORY_LABELS[c] ?? c;
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}

export function JennyQueue() {
  useHeartbeat({ currentPage: "admin-jenny-queue" });

  const queueQuery = useQuery({
    queryKey: ["admin", "jenny-queue"],
    queryFn: () =>
      api
        .get<{ success: boolean; data: QueuePayload }>("/diag/jenny-queue")
        ,
    staleTime: 60_000,
  });

  const data = queueQuery.data;

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 gap-4 max-w-7xl w-full mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Jenny's Queue
          </h1>
          <p className="text-sm text-text-secondary max-w-3xl">
            Non-standard work — the "Other Jobs to be Invoiced" section from the
            Load Count Sheet. Truck Pushers, Equipment Moves, Frac Chem,
            Finoric, etc. These don't fit the well-day grid because they don't
            have a well destination.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/builder-matrix"
            className="text-sm text-accent underline-offset-4 hover:underline"
          >
            Order of Invoicing →
          </Link>
        </div>
      </header>

      {queueQuery.isLoading && (
        <div className="text-sm text-text-secondary">Loading...</div>
      )}
      {queueQuery.isError && (
        <div className="text-sm text-red-500">
          Failed to load: {String(queueQuery.error)}
        </div>
      )}

      {data && (
        <>
          {/* Headline counts */}
          <div className="rounded-lg border border-border bg-bg-secondary p-4">
            <div className="text-xs uppercase tracking-wide text-text-secondary">
              Total non-standard loads
            </div>
            <div className="text-3xl font-bold mt-1">
              {data.totalNonStandard.toLocaleString()}
            </div>
            <div className="text-xs text-text-secondary mt-1">
              Across {data.categories.length} categor
              {data.categories.length === 1 ? "y" : "ies"}
            </div>
          </div>

          {/* Per-category breakdown */}
          {data.categories.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-bg-secondary p-8 text-center text-sm text-text-secondary">
              No non-standard loads yet. Loads default to{" "}
              <code className="bg-bg-primary px-1 rounded">standard</code>;
              recategorize via load detail when work falls outside the well-day
              grid.
            </div>
          ) : (
            <div className="grid gap-3">
              {data.categories.map((cat) => (
                <section
                  key={cat.category}
                  className="rounded-lg border border-border bg-bg-secondary p-4"
                >
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <h2 className="text-lg font-semibold">
                      {formatCategory(cat.category)}
                    </h2>
                    <div className="text-sm font-semibold tabular-nums">
                      {cat.total.toLocaleString()} load
                      {cat.total === 1 ? "" : "s"}
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-text-secondary border-b border-border">
                        <th className="py-1.5 pr-3">Bill To</th>
                        <th className="py-1.5 pr-3 text-right">Count</th>
                        <th className="py-1.5">Last seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cat.rows.map((r, idx) => (
                        <tr
                          key={`${cat.category}-${r.bill_to ?? "none"}-${idx}`}
                          className="border-b border-border/40"
                        >
                          <td className="py-1.5 pr-3">
                            {r.bill_to ?? (
                              <span className="text-text-secondary italic">
                                (unattributed)
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">
                            {r.load_count.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-text-secondary">
                            {formatDate(r.last_seen)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
          )}

          {/* Recent samples */}
          {data.samples.length > 0 && (
            <section className="rounded-lg border border-border bg-bg-secondary p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary mb-2">
                Recent (30 most recent)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-text-secondary border-b border-border">
                      <th className="py-1.5 pr-3">Date</th>
                      <th className="py-1.5 pr-3">Category</th>
                      <th className="py-1.5 pr-3">Bill To</th>
                      <th className="py-1.5 pr-3">Load #</th>
                      <th className="py-1.5 pr-3">Driver</th>
                      <th className="py-1.5 pr-3">Product</th>
                      <th className="py-1.5 text-right">Tons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.samples.map((s) => (
                      <tr key={s.id} className="border-b border-border/40">
                        <td className="py-1.5 pr-3 tabular-nums">
                          {formatDate(s.delivered_on)}
                        </td>
                        <td className="py-1.5 pr-3 text-xs">
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                            {formatCategory(s.job_category)}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3">{s.bill_to ?? "—"}</td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {s.load_no ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3">{s.driver_name ?? "—"}</td>
                        <td className="py-1.5 pr-3 text-text-secondary">
                          {s.product_description ?? "—"}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {s.weight_tons
                            ? Number(s.weight_tons).toFixed(2)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <footer className="text-xs text-text-secondary border-t border-border pt-3 mt-2">
            {data.sourceLabel}
          </footer>
        </>
      )}
    </div>
  );
}
