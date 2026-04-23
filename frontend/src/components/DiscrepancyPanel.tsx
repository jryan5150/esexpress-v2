import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * Cross-check panel — renders the open discrepancies for a single
 * assignment as a compact section in the load drawer. Empty state
 * collapses to nothing so loads with no drift don't get visual noise.
 *
 * Each row: severity dot, type label, v2 vs PCS values, action to
 * mark resolved manually if the dispatcher decides it's not actionable.
 *
 * Data source: GET /api/v1/diag/discrepancies?assignmentId={id}.
 * Refreshes every 60s while drawer is open.
 */

interface Discrepancy {
  id: number;
  subjectKey: string;
  assignmentId: number | null;
  loadId: number | null;
  discrepancyType: string;
  severity: "info" | "warning" | "critical";
  v2Value: string | null;
  pcsValue: string | null;
  message: string;
  detectedAt: string;
  lastSeenAt: string;
}

interface DiscrepancyResponse {
  generatedAt: string;
  summary: { openTotal: number; byType: Record<string, number> };
  discrepancies: Discrepancy[];
}

const TYPE_LABEL: Record<string, string> = {
  status_drift: "Stage differs from PCS",
  weight_drift: "Weight differs from PCS",
  well_mismatch: "Different well in PCS",
  photo_gap: "Photo missing",
  rate_drift: "Rate differs from PCS",
  orphan_destination: "Destination not mapped",
};

const SEVERITY_DOT: Record<Discrepancy["severity"], string> = {
  info: "bg-blue-400",
  warning: "bg-amber-400",
  critical: "bg-red-500",
};

export function DiscrepancyPanel({ assignmentId }: { assignmentId: number }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["discrepancies", "assignment", assignmentId],
    queryFn: () =>
      api
        .get<{
          success: boolean;
          data: DiscrepancyResponse;
        }>(`/diag/discrepancies?assignmentId=${assignmentId}`)
        .then((r) => r.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) =>
      api.post(`/diag/discrepancies/${id}/resolve`, {
        notes: "manually resolved from drawer",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["discrepancies", "assignment", assignmentId],
      });
      queryClient.invalidateQueries({ queryKey: ["discrepancies"] });
    },
  });

  const items = query.data?.discrepancies ?? [];

  // Collapse to nothing when no open discrepancies — drawer stays clean
  if (query.isLoading) {
    return (
      <div className="space-y-2">
        <span className="text-[9px] font-semibold text-outline tracking-[0.08em] uppercase">
          What PCS sees
        </span>
        <div className="text-[10px] text-outline/60 italic">checking…</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-2">
        <span className="text-[9px] font-semibold text-outline tracking-[0.08em] uppercase">
          What PCS sees
        </span>
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
          <span className="material-symbols-outlined text-sm">
            check_circle
          </span>
          <span>v2 and PCS agree on this load</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="text-[9px] font-semibold text-outline tracking-[0.08em] uppercase">
        What PCS sees · {items.length} {items.length === 1 ? "issue" : "issues"}
      </span>
      <div className="space-y-1.5">
        {items.map((d) => (
          <div
            key={d.id}
            className="bg-surface-container-high/40 rounded-md p-2 text-xs space-y-0.5"
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[d.severity]}`}
              />
              <span className="font-semibold text-on-surface">
                {TYPE_LABEL[d.discrepancyType] ?? d.discrepancyType}
              </span>
              <button
                type="button"
                onClick={() => resolveMutation.mutate(d.id)}
                disabled={resolveMutation.isPending}
                className="ml-auto text-[10px] text-outline hover:text-primary underline disabled:opacity-50"
              >
                resolve
              </button>
            </div>
            <div className="text-on-surface-variant">{d.message}</div>
            {(d.v2Value || d.pcsValue) && (
              <div className="flex gap-3 text-[10px] text-outline tabular-nums">
                {d.v2Value && <span>v2: {d.v2Value}</span>}
                {d.pcsValue && <span>PCS: {d.pcsValue}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
