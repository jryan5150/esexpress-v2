import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk, invalidateSharedSurfaces } from "../lib/query-client";
import type { WorkbenchFilter, WorkbenchRow, HandlerStage } from "../types/api";

export interface WorkbenchQueryOpts {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  truckNo?: string;
  /** Exact well id. Takes precedence over wellName. */
  wellId?: number;
  /** Substring match on wells.name. Ignored if wellId is set. */
  wellName?: string;
  /** Sort column. Default stage_changed_at. delivered_on for date-ordered. */
  sortBy?: "stage_changed_at" | "delivered_on";
  /** Sort direction. Default desc. */
  sortDir?: "asc" | "desc";
  /** Page size. Allowed: 25, 50, 75, 100. Default 50. */
  pageSize?: number;
  /** 0-indexed page number. Default 0. */
  page?: number;
}

export const PAGE_SIZE_OPTIONS = [25, 50, 75, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export function useWorkbench(
  filter: WorkbenchFilter,
  opts: WorkbenchQueryOpts = {},
) {
  const {
    search,
    dateFrom,
    dateTo,
    truckNo,
    wellId,
    wellName,
    sortBy,
    sortDir,
  } = opts;
  const pageSize: PageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(
    opts.pageSize ?? 50,
  )
    ? (opts.pageSize as PageSize)
    : 50;
  const page = Math.max(0, opts.page ?? 0);
  const params = new URLSearchParams({ filter });
  params.set("limit", String(pageSize));
  params.set("offset", String(page * pageSize));
  if (search) params.set("search", search);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (truckNo) params.set("truckNo", truckNo);
  if (wellId) params.set("wellId", String(wellId));
  else if (wellName) params.set("wellName", wellName);
  if (sortBy) params.set("sortBy", sortBy);
  if (sortDir) params.set("sortDir", sortDir);
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
    sortBy ?? "",
    sortDir ?? "",
    pageSize,
    page,
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
  return useMutation({
    mutationFn: (p: { id: number; stage: HandlerStage; notes?: string }) =>
      api.post(`/dispatch/workbench/${p.id}/advance`, {
        stage: p.stage,
        notes: p.notes,
      }),
    onSuccess: () => invalidateSharedSurfaces(),
  });
}

export function useClaim() {
  return useMutation({
    mutationFn: (id: number) => api.post(`/dispatch/workbench/${id}/claim`),
    onSuccess: () => invalidateSharedSurfaces(),
  });
}

export function useFlagToUncertain() {
  return useMutation({
    mutationFn: (p: { id: number; reason: string; notes?: string }) =>
      api.post(`/dispatch/workbench/${p.id}/flag`, {
        reason: p.reason,
        notes: p.notes,
      }),
    onSuccess: () => invalidateSharedSurfaces(),
  });
}

export function useBuildDuplicate() {
  return useMutation({
    mutationFn: (p: { assignmentIds: number[]; notes?: string }) =>
      api.post("/dispatch/workbench/build-duplicate", p),
    onSuccess: () => invalidateSharedSurfaces(),
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
  return useMutation({
    mutationFn: (p: { id: number; action: ResolveAction; notes?: string }) =>
      api.post(`/dispatch/workbench/${p.id}/route`, {
        action: p.action,
        notes: p.notes,
      }),
    onSuccess: () => invalidateSharedSurfaces(),
  });
}

/** Bulk advance uncertain → ready_to_build. Per-row failures returned in
 *  the results array (e.g. rows with open uncertain_reasons still get
 *  blocked by the state machine gate). */
export function useBulkConfirm() {
  return useMutation({
    mutationFn: (p: { assignmentIds: number[]; notes?: string }) =>
      api.post<{ results: { id: number; ok: boolean; error?: string }[] }>(
        "/dispatch/workbench/bulk-confirm",
        p,
      ),
    onSuccess: () => invalidateSharedSurfaces(),
  });
}

/**
 * PATCH load fields (bolNo, driverName, rate, weight, etc.) from the
 * workbench drawer. Invalidates workbench so the row reflects the edit.
 */
export function useUpdateLoadField() {
  return useMutation({
    mutationFn: (p: { loadId: number; updates: Record<string, unknown> }) =>
      api.patch(`/dispatch/loads/${p.loadId}`, p.updates),
    onSuccess: () => {
      invalidateSharedSurfaces();
      
    },
  });
}

/**
 * PATCH the PCS load number on an assignment. Manual entry lane while
 * bidirectional PCS OAuth isn't live — Jodi's payroll report joins on this.
 */
export function useUpdatePcsNumber() {
  return useMutation({
    mutationFn: (p: { assignmentId: number; pcsNumber: string | null }) =>
      api.patch(`/dispatch/workbench/${p.assignmentId}/pcs-number`, {
        pcsNumber: p.pcsNumber,
      }),
    onSuccess: () => {
      invalidateSharedSurfaces();
    },
  });
}

/**
 * PATCH the free-form dispatcher notes on an assignment. Save-on-blur
 * pattern in the drawer — operator context persists for the next handler.
 */
export function useUpdateAssignmentNotes() {
  return useMutation({
    mutationFn: (p: { assignmentId: number; notes: string | null }) =>
      api.patch(`/dispatch/workbench/${p.assignmentId}/notes`, {
        notes: p.notes,
      }),
    onSuccess: () => {
      invalidateSharedSurfaces();
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
