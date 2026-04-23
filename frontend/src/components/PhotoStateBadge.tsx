/**
 * PhotoStateBadge — answers Jessica's recurring "is the photo missing,
 * delayed, or broken?" question by rendering a contextual state per row.
 *
 * States:
 *   attached              — no badge, photo is there
 *   pending_jotform       — blue, "photo expected, next sync in Xm"
 *   overdue               — amber, "photo Xm overdue"
 *   needs_review          — red, "no photo in Xh — ping driver / flag missing"
 *   human_flagged_missing — gray, "flagged missing"
 *   unreadable            — amber, "OCR couldn't read — rotate/retry"
 *
 * Auto-transitions on backend: when JotForm sync attaches a photo, next
 * workbench query returns photoState='attached' and badge disappears.
 * No human acknowledgement needed.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { WorkbenchRow } from "../types/api";

interface PhotoStateBadgeProps {
  row: Pick<
    WorkbenchRow,
    | "assignmentId"
    | "photoState"
    | "photoStateMessage"
    | "photoStateMinutesOld"
    | "photoStateAllowRunCheck"
    | "photoStateNextSync"
    | "loadId"
  >;
  /** Compact mode for workbench row (inline badge only, no action). */
  compact?: boolean;
}

const PALETTE: Record<WorkbenchRow["photoState"], string> = {
  attached: "", // no badge renders
  pending_jotform: "bg-sky-50 text-sky-900 border-sky-300",
  overdue: "bg-amber-50 text-amber-900 border-amber-400",
  needs_review: "bg-rose-50 text-rose-900 border-rose-400",
  human_flagged_missing: "bg-gray-50 text-gray-700 border-gray-300",
  unreadable: "bg-amber-50 text-amber-900 border-amber-400",
};

const LABEL: Record<WorkbenchRow["photoState"], string> = {
  attached: "",
  pending_jotform: "Photo pending",
  overdue: "Photo overdue",
  needs_review: "No photo — review",
  human_flagged_missing: "Flagged missing",
  unreadable: "Photo unreadable",
};

export function PhotoStateBadge({
  row,
  compact = false,
}: PhotoStateBadgeProps) {
  const qc = useQueryClient();
  const runCheck = useMutation({
    mutationFn: async () =>
      api.post<{
        success: boolean;
        data: { fetched: number; matched: number };
      }>(`/dispatch/workbench/${row.assignmentId}/run-photo-check`, {}),
    onSuccess: () => {
      // Refresh the workbench row so photoState recomputes from fresh data
      qc.invalidateQueries({ queryKey: ["workbench"] });
    },
  });

  if (row.photoState === "attached") return null;

  const cls = PALETTE[row.photoState];
  const label = LABEL[row.photoState];

  return (
    <div className={compact ? "inline-flex items-center gap-1.5" : "space-y-1"}>
      <span
        className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${cls}`}
        title={row.photoStateMessage}
      >
        {label}
        {/* `photoState === "attached"` is already returned-out at line 72,
             so no need to re-check it here. */}
        {row.photoStateMinutesOld != null && (
          <span className="ml-1 opacity-75">
            · {formatAge(row.photoStateMinutesOld)}
          </span>
        )}
      </span>
      {!compact && (
        <>
          <div className="text-xs text-on-surface-variant">
            {row.photoStateMessage}
          </div>
          {row.photoStateAllowRunCheck && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                runCheck.mutate();
              }}
              disabled={runCheck.isPending}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-outline-variant hover:bg-surface-container-high disabled:opacity-50"
            >
              {runCheck.isPending ? "Checking…" : "Run Check"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
