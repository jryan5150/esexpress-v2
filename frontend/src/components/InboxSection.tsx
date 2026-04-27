import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export interface InboxItem {
  kind: string;
  load_id?: number;
  assignment_id?: number | null;
  well_id?: number | null;
  well_name?: string | null;
  bill_to?: string | null;
  day?: string | null;
  driver_name?: string | null;
  bol_no?: string | null;
  ticket_no?: string | null;
  discrepancy_id?: number;
  message?: string;
  severity?: string;
}

interface InboxPayload {
  customerIds: number[];
  urgencyOrder: string[];
  items: {
    missing_photos: InboxItem[];
    uncertain_matches: InboxItem[];
    pcs_discrepancies: InboxItem[];
    sheet_drift: InboxItem[];
  };
  counts: {
    missing_photos: number;
    uncertain_matches: number;
    pcs_discrepancies: number;
    sheet_drift: number;
    total: number;
  };
}

const SECTION_LABELS: Record<string, string> = {
  missing_photos: "Missing photos",
  uncertain_matches: "Uncertain matches",
  pcs_discrepancies: "PCS discrepancies",
  sheet_drift: "Sheet drift",
};

interface Props {
  customerIds: number[];
  onItemClick?: (item: InboxItem) => void;
  initialOpen?: boolean;
}

export function InboxSection({ customerIds, onItemClick, initialOpen }: Props) {
  const [open, setOpen] = useState(initialOpen ?? false);

  // Direct-typed unwrap pattern: api.get<T>(url) already returns the
  // envelope's data payload (api.ts request() unwraps json.data), so we
  // type T to match that inner shape, NOT the {success, data} envelope.
  const inboxQuery = useQuery({
    queryKey: ["worksurface", "inbox", customerIds.join(",")],
    queryFn: () =>
      api.get<InboxPayload>(
        customerIds.length > 0
          ? `/diag/inbox?customerIds=${customerIds.join(",")}`
          : `/diag/inbox`,
      ),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const data = inboxQuery.data;
  const total = data?.counts.total ?? 0;

  return (
    <section className="rounded-lg border border-border bg-bg-secondary">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-bg-tertiary"
      >
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide">
            Your Inbox
          </span>
          {total > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500 text-white font-bold">
              {total}
            </span>
          )}
          {!open && data && total > 0 && (
            <span className="text-xs text-text-secondary ml-2 normal-case font-normal">
              {[
                data.counts.missing_photos > 0 &&
                  `${data.counts.missing_photos} missing photos`,
                data.counts.uncertain_matches > 0 &&
                  `${data.counts.uncertain_matches} uncertain`,
                data.counts.pcs_discrepancies > 0 &&
                  `${data.counts.pcs_discrepancies} PCS`,
              ]
                .filter(Boolean)
                .join(" · ")}
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
          {total === 0 && (
            <p className="text-xs text-text-secondary text-center py-3">
              Nothing needs you. Check the Today's Intake section for fresh BOL
              submissions.
            </p>
          )}
          {(
            [
              "missing_photos",
              "uncertain_matches",
              "pcs_discrepancies",
              "sheet_drift",
            ] as const
          ).map((key) => {
            const items = data.items[key];
            if (items.length === 0) return null;
            return (
              <div key={key}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1">
                  {SECTION_LABELS[key]} ({items.length})
                </h3>
                <ul className="space-y-1">
                  {items.slice(0, 10).map((item, idx) => (
                    <li
                      key={`${key}-${idx}`}
                      className="rounded-md border border-border bg-bg-primary/40 px-3 py-2 text-sm cursor-pointer hover:bg-bg-tertiary"
                      onClick={() => onItemClick?.(item)}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div>
                          <span className="text-xs text-text-secondary">
                            {item.bill_to ?? "—"} ·{" "}
                          </span>
                          <span className="font-medium">
                            {item.well_name ?? "—"}
                          </span>
                          {item.day && (
                            <span className="text-xs text-text-secondary ml-2">
                              {new Date(item.day).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {item.driver_name && (
                          <span className="text-xs text-text-secondary">
                            {item.driver_name}
                          </span>
                        )}
                      </div>
                      {item.message && (
                        <div className="text-xs text-text-secondary mt-0.5">
                          {item.message}
                        </div>
                      )}
                    </li>
                  ))}
                  {items.length > 10 && (
                    <li className="text-xs text-text-secondary text-center pt-1">
                      + {items.length - 10} more
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      {open && inboxQuery.isLoading && (
        <div className="p-4 border-t border-border text-xs text-text-secondary text-center">
          Loading…
        </div>
      )}
      {open && inboxQuery.isError && (
        <div className="p-4 border-t border-border text-xs text-red-500 text-center">
          Failed to load inbox.
        </div>
      )}
    </section>
  );
}
