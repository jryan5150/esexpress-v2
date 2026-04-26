import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useBolQueue } from "../hooks/use-bol";
import { ManualMatchPanel } from "./ManualMatchPanel";
import { resolvePhotoUrl } from "../lib/photo-url";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

interface Props {
  onMatchedClick?: (loadId: number) => void;
}

/**
 * Workbench Today's Intake — collapsing list of BOL/JotForm submissions
 * landed in the last 4 hours. Each row shows photo thumb + driver + BOL
 * number + match status. For unmatched items, the inline "Manual match"
 * button expands the existing ManualMatchPanel verbatim (same panel used
 * in BolQueue + AwaitingPhotoMatchSection).
 *
 * Hook return shape (per backend /verification/jotform/queue):
 *   { data: BolQueueItem[], meta: { page, limit, total, totalPages } }
 * BolQueueItem = { submission: {...}, matchedLoad: {...} | null, discrepancies }
 *
 * The api.ts request wrapper unwraps the outer envelope, so the hook
 * returns the inner { data, meta } object directly — there is no
 * additional `.data` to peel.
 */
export function TodayIntakeSection({ onMatchedClick }: Props) {
  const [open, setOpen] = useState(false);
  const [expandedSubId, setExpandedSubId] = useState<number | null>(null);

  // Pull a generous slice (limit=100) and filter to the 4hr window
  // client-side. Backend already orders by createdAt desc, so the most
  // recent rows arrive first.
  const queueQuery = useBolQueue({ status: "all", page: 1, limit: 100 });

  type IntakeItem = {
    submission: {
      id: number;
      bolNumber: string | null;
      driverName: string | null;
      truckNo: string | null;
      photoUrls: string[];
      submittedAt: string | null;
      createdAt: string | null;
      status: string;
    };
    matchedLoad: {
      id: number;
      loadNo: string | null;
      driverName: string | null;
      destinationName: string | null;
    } | null;
  };

  const recentItems = useMemo<IntakeItem[]>(() => {
    const response = queueQuery.data as { data?: IntakeItem[] } | undefined;
    const items = response?.data ?? [];
    const cutoff = Date.now() - FOUR_HOURS_MS;
    return items.filter((x) => {
      const ts = x.submission.submittedAt ?? x.submission.createdAt;
      if (!ts) return false;
      return new Date(ts).getTime() >= cutoff;
    });
  }, [queueQuery.data]);

  return (
    <section className="rounded-lg border border-border bg-bg-secondary">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-bg-tertiary"
      >
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide">
            Today's Intake
          </span>
          {recentItems.length > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-bg-primary border border-border font-semibold">
              {recentItems.length}
            </span>
          )}
        </span>
        <span className="text-xs text-text-secondary">
          {open ? "Collapse ↑" : "Expand ↓"}
        </span>
      </button>
      {open && (
        <div className="p-4 border-t border-border space-y-2">
          {queueQuery.isLoading && (
            <p className="text-xs text-text-secondary text-center py-3">
              Loading recent submissions…
            </p>
          )}
          {!queueQuery.isLoading && recentItems.length === 0 && (
            <p className="text-xs text-text-secondary text-center py-3">
              No BOL submissions in the last 4 hours.
            </p>
          )}
          {recentItems.map((item) => {
            const sub = item.submission;
            const matched = !!item.matchedLoad;
            const expanded = expandedSubId === sub.id;
            const ts = sub.submittedAt ?? sub.createdAt;
            const firstPhoto = sub.photoUrls?.[0]
              ? resolvePhotoUrl(sub.photoUrls[0], { thumb: true })
              : null;
            return (
              <div
                key={sub.id}
                className="rounded-md border border-border bg-bg-primary/40 p-3"
              >
                <div className="flex items-center gap-3">
                  {firstPhoto ? (
                    <img
                      src={firstPhoto}
                      alt={`BOL ${sub.bolNumber ?? sub.id}`}
                      className="w-12 h-12 object-cover rounded border border-border flex-shrink-0"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded border border-border bg-bg-tertiary flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {sub.driverName ?? "—"} · BOL {sub.bolNumber ?? "—"}
                    </div>
                    <div className="text-xs text-text-secondary">
                      {ts ? new Date(ts).toLocaleTimeString() : "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    {matched ? (
                      <button
                        type="button"
                        onClick={() =>
                          item.matchedLoad &&
                          onMatchedClick?.(item.matchedLoad.id)
                        }
                        className="text-xs text-accent hover:underline"
                      >
                        → matched to LOAD-
                        {item.matchedLoad!.loadNo ?? item.matchedLoad!.id}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSubId(expanded ? null : sub.id)
                        }
                        className="text-xs px-2 py-1 rounded bg-amber-500 text-white hover:opacity-90"
                      >
                        {expanded ? "Hide match panel" : "Manual match"}
                      </button>
                    )}
                  </div>
                </div>
                {expanded && !matched && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <ManualMatchPanel
                      importId={sub.id}
                      onLinked={() => {
                        setExpandedSubId(null);
                        queueQuery.refetch();
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
          <div className="pt-2 text-right">
            <Link
              to="/bol"
              className="text-xs text-accent underline-offset-4 hover:underline"
            >
              All BOL items →
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
