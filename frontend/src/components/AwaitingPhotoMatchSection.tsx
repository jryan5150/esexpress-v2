import { useState } from "react";
import { Link } from "react-router-dom";
import { useBolQueue } from "../hooks/use-bol";
import { ManualMatchPanel } from "./ManualMatchPanel";
import { resolvePhotoUrl } from "../lib/photo-url";

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

  const queueQuery = useBolQueue({
    status: "unmatched",
    limit: 6,
    page: 1,
  });

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
  const response = queueQuery.data as
    | { data?: QueueItem[]; meta?: { total?: number } }
    | undefined;
  const items: QueueItem[] = response?.data ?? [];
  const total = response?.meta?.total ?? items.length;

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
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : sub.id)
                            }
                            className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-primary hover:underline cursor-pointer"
                          >
                            {isExpanded ? "Cancel" : "Match to load"}
                          </button>
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
