import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface QueuePayload {
  totalNonStandard: number;
  categories: Array<{
    category: string;
    total: number;
    rows: Array<{
      bill_to: string | null;
      load_count: number;
      last_seen: string | null;
    }>;
  }>;
  samples: Array<{
    id: number;
    job_category: string;
    load_no: string | null;
    delivered_on: string | null;
    bill_to: string | null;
    driver_name: string | null;
  }>;
  sourceLabel?: string;
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

interface Props {
  onLoadClick?: (loadId: number) => void;
}

export function JennyQueueSection({ onLoadClick }: Props) {
  const [open, setOpen] = useState(false);

  // Direct-typed unwrap pattern: api.get<T>(url) already returns the
  // envelope's data payload (api.ts request() unwraps json.data), so we
  // type T to match that inner shape, NOT the {success, data} envelope.
  const queueQuery = useQuery({
    queryKey: ["worksurface", "jenny-queue"],
    queryFn: () => api.get<QueuePayload>("/diag/jenny-queue"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const data = queueQuery.data;
  const total = data?.totalNonStandard ?? 0;

  return (
    <section className="rounded-lg border border-border bg-bg-secondary">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-bg-tertiary"
      >
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide">
            Jenny's Queue
          </span>
          {total > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-bg-primary border border-border font-semibold">
              {total}
            </span>
          )}
        </span>
        <span
          className={`material-symbols-outlined text-base text-text-secondary transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          expand_more
        </span>
      </button>
      {open && data && (
        <div className="p-4 border-t border-border space-y-3">
          {data.categories.length === 0 && (
            <p className="text-xs text-text-secondary text-center py-3">
              No non-standard work right now.
            </p>
          )}
          {data.categories.map((cat) => (
            <div key={cat.category}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1">
                {CATEGORY_LABELS[cat.category] ?? cat.category} ({cat.total})
              </h3>
              <ul className="space-y-1">
                {cat.rows.map((r, idx) => (
                  <li
                    key={`${cat.category}-${idx}`}
                    className="rounded-md border border-border bg-bg-primary/40 px-3 py-1.5 text-sm flex items-baseline justify-between"
                  >
                    <span>{r.bill_to ?? "(unattributed)"}</span>
                    <span className="tabular-nums font-semibold">
                      {r.load_count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {data.samples.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1">
                Recent
              </h3>
              <ul className="space-y-1">
                {data.samples.slice(0, 10).map((s) => (
                  <li
                    key={s.id}
                    className="rounded-md border border-border bg-bg-primary/40 px-3 py-1.5 text-sm cursor-pointer hover:bg-bg-tertiary"
                    onClick={() => onLoadClick?.(s.id)}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div>
                        <span className="text-xs text-text-secondary">
                          {s.delivered_on
                            ? new Date(s.delivered_on).toLocaleDateString()
                            : "—"}{" "}
                          ·{" "}
                        </span>
                        <span className="font-medium">
                          {CATEGORY_LABELS[s.job_category] ?? s.job_category}
                        </span>
                      </div>
                      <span className="text-xs text-text-secondary">
                        {s.driver_name ?? "—"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {open && queueQuery.isLoading && (
        <div className="p-4 border-t border-border text-xs text-text-secondary text-center">
          Loading…
        </div>
      )}
      {open && queueQuery.isError && (
        <div className="p-4 border-t border-border text-xs text-red-500 text-center">
          Failed to load Jenny's Queue.
        </div>
      )}
    </section>
  );
}
