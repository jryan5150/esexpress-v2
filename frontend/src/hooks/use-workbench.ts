import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/query-client";
import type {
  WorkbenchFilter,
  WorkbenchRow,
  HandlerStage,
} from "../types/api";

export interface WorkbenchQueryOpts {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  truckNo?: string;
  /** Exact well id. Takes precedence over wellName. */
  wellId?: number;
  /** Substring match on wells.name. Ignored if wellId is set. */
  wellName?: string;
}

export function useWorkbench(
  filter: WorkbenchFilter,
  opts: WorkbenchQueryOpts = {},
) {
  const { search, dateFrom, dateTo, truckNo, wellId, wellName } = opts;
  const params = new URLSearchParams({ filter });
  // Pull the full filter set on a single page so the demo + dispatchers
  // can scroll the entire queue. Backend caps at 500. Uncertain ~643,
  // Ready to Build ~2,240 — Ready to Build still gets a 500-row sample
  // until we build true pagination UI.
  params.set("limit", "500");
  if (search) params.set("search", search);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (truckNo) params.set("truckNo", truckNo);
  if (wellId) params.set("wellId", String(wellId));
  else if (wellName) params.set("wellName", wellName);
  const key = [
    "workbench",
    "list",
    filter,
    search ?? "",
    dateFrom ?? "",
    dateTo ?? "",
    truckNo ?? "",
    wellId ?? "",
    wellName ?? "",
  ] as const;
  return useQuery({
    queryKey: key,
    queryFn: () =>
      api.get<{ rows: WorkbenchRow[]; total: number }>(
        `/dispatch/workbench?${params.toString()}`,
      ),
    staleTime: 5_000,
  });
}

export function useAdvanceStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: number; stage: HandlerStage; notes?: string }) =>
      api.post(`/dispatch/workbench/${p.id}/advance`, {
        stage: p.stage,
        notes: p.notes,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workbench.all }),
  });
}

export function useClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/dispatch/workbench/${id}/claim`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workbench.all }),
  });
}

export function useFlagToUncertain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: number; reason: string; notes?: string }) =>
      api.post(`/dispatch/workbench/${p.id}/flag`, {
        reason: p.reason,
        notes: p.notes,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workbench.all }),
  });
}

export function useBuildDuplicate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { assignmentIds: number[]; notes?: string }) =>
      api.post("/dispatch/workbench/build-duplicate", p),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workbench.all }),
  });
}

export type ResolveAction =
  | "confirm"
  | "needs_rate"
  | "missing_ticket"
  | "missing_driver"
  | "flag_other"
  | "reject";

/** Granular Resolve action on an uncertain row.
 *  confirm         → clears reasons + advances to ready_to_build
 *  needs_rate      → re-tags with rate_missing
 *  missing_ticket  → re-tags with missing_tickets
 *  missing_driver  → re-tags with missing_driver
 *  flag_other      → clears reason tags, keeps row in uncertain with note
 *  reject          → status='cancelled', handler_stage='cleared'; row leaves
 *                    every active queue. Audit kept in status_history.
 */
export function useRouteUncertain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: number; action: ResolveAction; notes?: string }) =>
      api.post(`/dispatch/workbench/${p.id}/route`, {
        action: p.action,
        notes: p.notes,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workbench.all }),
  });
}

/** Bulk advance uncertain → ready_to_build. Per-row failures returned in
 *  the results array (e.g. rows with open uncertain_reasons still get
 *  blocked by the state machine gate). */
export function useBulkConfirm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { assignmentIds: number[]; notes?: string }) =>
      api.post<{ results: { id: number; ok: boolean; error?: string }[] }>(
        "/dispatch/workbench/bulk-confirm",
        p,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workbench.all }),
  });
}

/**
 * PATCH load fields (bolNo, driverName, rate, weight, etc.) from the
 * workbench drawer. Invalidates workbench so the row reflects the edit.
 */
export function useUpdateLoadField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { loadId: number; updates: Record<string, unknown> }) =>
      api.patch(`/dispatch/loads/${p.loadId}`, p.updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workbench.all });
      qc.invalidateQueries({ queryKey: qk.loads.all });
    },
  });
}

/**
 * BOL reconciliation detail for a load — surfaces the OCR-extracted values
 * and the discrepancies reconciliation caught. Used by the drawer to show
 * "what matching found" next to editable load fields.
 */
export function useBolReconciliation(loadId: number | null) {
  return useQuery({
    queryKey: ["bol-reconciliation", loadId],
    queryFn: () =>
      api.get<{
        bolSubmissionId: number;
        matchedLoadId: number | null;
        matchMethod: string | null;
        matchScore: number | null;
        status: string | null;
        ocrBolNo: string | null;
        ocrDriverName: string | null;
        ocrWeightLbs: number | null;
        ocrDeliveryDate: string | null;
        discrepancies: Array<{
          field: string;
          expected: unknown;
          actual: unknown;
          severity: string;
        }>;
      } | null>(`/verification/bol/by-load/${loadId}`),
    enabled: loadId != null,
    staleTime: 30_000,
  });
}
