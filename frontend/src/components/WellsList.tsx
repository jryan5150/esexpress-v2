import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface ActiveWell {
  id: number;
  name: string;
  customer_name: string | null;
  customer_id: number | null;
  load_count_this_week: number;
  load_count_14d: number;
  ready_count: number;
  building_count: number;
  entered_count: number;
  flagged_count: number;
  last_touched_at: string | null;
}

interface Props {
  /**
   * Called when the user picks a well row. Parent opens the drawer
   * in well-mode for that wellId. Defaults to current grid week date
   * range; the drawer surfaces its own date filter from there.
   */
  onPickWell: (wellId: number, wellName: string) => void;
}

/**
 * WellsList — scrollable navigation list of every active well.
 *
 * "Active" = has loads in the last 14 days OR an open assignment.
 * Sort: load count this week desc, then alphabetical.
 *
 * Intentionally **does not** honor the parent page's customer chip
 * filter — this is a navigation surface (every well I might want to
 * look at), not a triage surface. Triage lives at /flagged.
 *
 * Click a row → parent opens the drawer in well-mode for that wellId
 * with the existing date-filter chips.
 */
export function WellsList({ onPickWell }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const wellsQuery = useQuery({
    // v2 suffix bumped 2026-04-28 to invalidate any browser caches that
    // captured the broken-schema 500 from the first hour after launch.
    queryKey: ["workbench", "wells-active", "v2"],
    queryFn: () =>
      api.get<{ wells: ActiveWell[]; total: number }>("/diag/wells-active"),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    // Don't keep showing a stale error from a previous failed request
    // when the backend is now healthy — let the new fetch reset state.
    retry: 1,
  });

  const wells = wellsQuery.data?.wells ?? [];

  return (
    <section className="rounded-lg border border-border bg-bg-secondary">
      <header className="px-4 py-2 border-b border-border flex items-baseline justify-between">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-baseline gap-2 text-left"
          title={collapsed ? "Expand wells list" : "Collapse wells list"}
        >
          <span className="text-xs font-semibold uppercase tracking-wide">
            {collapsed ? "▸" : "▾"} All active wells
          </span>
          {wells.length > 0 && (
            <span className="text-[11px] text-text-secondary tabular-nums">
              {wells.length}
            </span>
          )}
        </button>
        <span className="text-[10px] text-text-secondary">
          all customers · sorted by week's load count
        </span>
      </header>

      {!collapsed && (
        <>
          {wellsQuery.isLoading && (
            <div className="px-4 py-6 text-xs text-text-secondary text-center">
              Loading wells…
            </div>
          )}
          {wellsQuery.isError && (
            <div className="px-4 py-6 text-xs text-red-500 text-center">
              Couldn't load wells. {(wellsQuery.error as Error)?.message ?? ""}
            </div>
          )}
          {wellsQuery.data && wells.length === 0 && (
            <div className="px-4 py-6 text-xs text-text-secondary text-center">
              No active wells right now.
            </div>
          )}
          {wells.length > 0 && (
            <div className="overflow-y-auto" style={{ maxHeight: "24rem" }}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-bg-secondary z-10 text-text-secondary uppercase tracking-wide">
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3">Well</th>
                    <th className="text-left py-2 px-3">Customer</th>
                    <th
                      className="text-right py-2 px-3"
                      title="Loads this week"
                    >
                      Week
                    </th>
                    <th className="text-right py-2 px-3" title="Last 14 days">
                      14d
                    </th>
                    <th
                      className="text-center py-2 px-3"
                      title="Ready to build"
                    >
                      Ready
                    </th>
                    <th
                      className="text-center py-2 px-3"
                      title="Currently building"
                    >
                      Bldg
                    </th>
                    <th
                      className="text-center py-2 px-3"
                      title="Entered in PCS"
                    >
                      Ent
                    </th>
                    <th
                      className="text-center py-2 px-3"
                      title="Flagged for review"
                    >
                      🚩
                    </th>
                    <th className="text-left py-2 px-3">Last touched</th>
                  </tr>
                </thead>
                <tbody>
                  {wells.map((w) => (
                    <tr
                      key={w.id}
                      className="border-b border-border/40 cursor-pointer hover:bg-bg-tertiary/40 transition-colors"
                      onClick={() => onPickWell(w.id, w.name)}
                    >
                      <td className="py-1.5 px-3 font-medium truncate max-w-[18rem]">
                        {w.name}
                      </td>
                      <td className="py-1.5 px-3 text-text-secondary truncate max-w-[14rem]">
                        {w.customer_name ?? "—"}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums font-semibold">
                        {w.load_count_this_week || (
                          <span className="text-text-secondary font-normal">
                            —
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-text-secondary">
                        {w.load_count_14d || "—"}
                      </td>
                      <td className="py-1.5 px-3 text-center tabular-nums">
                        {w.ready_count || (
                          <span className="text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-center tabular-nums">
                        {w.building_count || (
                          <span className="text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-center tabular-nums">
                        {w.entered_count || (
                          <span className="text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-center tabular-nums">
                        {w.flagged_count > 0 ? (
                          <span className="text-amber-600 font-bold">
                            {w.flagged_count}
                          </span>
                        ) : (
                          <span className="text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-text-secondary text-[11px]">
                        {w.last_touched_at
                          ? formatRelative(w.last_touched_at)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
