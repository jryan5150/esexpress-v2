import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/query-client";
import type {
  Well,
  Carrier,
  Assignment,
  DispatchDeskLoad,
  ValidationSummary,
  DispatchReadiness,
  Paginated,
} from "../types/api";

/** Format as YYYY-MM-DD in local timezone */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useWells(date?: string) {
  const qs = date ? `?date=${date}` : "";
  return useQuery({
    queryKey: [...qk.wells.list(), date ?? "all"],
    queryFn: () => api.get<Well[]>(`/dispatch/wells/${qs}`),
    staleTime: 60_000, // Wells don't change often — 1 min cache
  });
}

export function useWell(id: string) {
  return useQuery({
    queryKey: qk.wells.detail(id),
    queryFn: () => api.get<Well>(`/dispatch/wells/${id}`),
    enabled: !!id,
  });
}

export function useAssignmentQueue(wellId?: number) {
  const params = wellId ? `?wellId=${wellId}` : "";
  return useQuery({
    queryKey: qk.assignments.queue({ wellId }),
    queryFn: () =>
      api.get<Paginated<Assignment>>(`/dispatch/assignments/queue${params}`),
    refetchInterval: 30_000,
  });
}

export function useAssignmentStats() {
  return useQuery({
    queryKey: qk.assignments.stats(),
    queryFn: () =>
      api.get<Record<string, number>>("/dispatch/assignments/stats"),
    refetchInterval: 30_000,
  });
}

export function usePendingReview() {
  return useQuery({
    queryKey: qk.assignments.pendingReview(),
    queryFn: () =>
      api.get<Assignment[]>("/dispatch/assignments/pending-review"),
    refetchInterval: 30_000,
  });
}

export function useValidationSummary() {
  return useQuery({
    queryKey: qk.validation.summary(),
    queryFn: () => api.get<ValidationSummary>("/dispatch/validation/"),
    refetchInterval: 30_000,
  });
}

/**
 * Returns the last successful + most recent sync run per source (propx,
 * logistiq, automap, jotform). Used on the Home page so Jessica can see
 * at a glance whether data is flowing.
 */
interface PipelineRun {
  id: number;
  source: string;
  startedAt: string;
  completedAt: string | null;
  status: "success" | "failed" | "skipped";
  recordsProcessed: number | null;
  durationMs: number | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
}
interface PipelineEntry {
  lastRun: PipelineRun | null;
  recentRuns: Array<{ status: string; at: string }>;
}
type PipelineData = Record<string, PipelineEntry>;

export function usePipelineStatus() {
  return useQuery({
    queryKey: ["diag", "pipeline"],
    queryFn: () => api.get<PipelineData>("/diag/pipeline"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/**
 * Matcher-accuracy diagnostics over a rolling 7-day window.
 *
 * Visible-learning signal for dispatchers — feeds the small "Matcher: NN%"
 * pill on the Home page and the sparkline row at the top of the Load
 * Diagnostics page. See /backend diag.ts `/match-accuracy` for the source
 * of truth on the action-label mapping (accept vs override).
 */
export interface MatchAccuracyData {
  windowDays: number;
  overall: {
    decisionsCount: number;
    acceptRate: number;
    overrideRate: number;
  };
  byTier: {
    tier1: { count: number; acceptRate: number };
    tier2: { count: number; acceptRate: number };
    tier3: { count: number; acceptRate: number };
  };
  autoPromotion: {
    totalAssignments: number;
    tier1Count: number;
    tier1PctOfTotal: number;
    withPhotoCount: number;
    withPhotoPctOfTier1: number;
  };
  daily: Array<{
    date: string;
    acceptRate: number | null;
    decisionsCount: number;
  }>;
}

export function useMatchAccuracy() {
  return useQuery({
    queryKey: ["diag", "match-accuracy"],
    queryFn: () => api.get<MatchAccuracyData>("/diag/match-accuracy"),
    // Refresh every 2 minutes — this is a trend, not a live counter
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}

export function useDispatchReadiness() {
  return useQuery({
    queryKey: qk.readiness.all,
    queryFn: () => api.get<DispatchReadiness>("/dispatch/dispatch-readiness"),
    refetchInterval: 30_000,
  });
}

export function useDispatchDeskLoads(filters?: {
  wellId?: number;
  photoStatus?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  params.set("era", "live");
  if (filters?.wellId) params.set("wellId", String(filters.wellId));
  if (filters?.photoStatus) params.set("photoStatus", filters.photoStatus);
  if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) params.set("dateTo", filters.dateTo);
  if (filters?.date && !filters.dateFrom && !filters.dateTo)
    params.set("date", filters.date);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString() ? `?${params}` : "";
  return useQuery({
    queryKey: qk.dispatchDesk.loads(filters),
    queryFn: () =>
      api.get<Paginated<DispatchDeskLoad>>(`/dispatch/dispatch-desk/${qs}`),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useBulkApprove() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignmentIds: number[]) =>
      api.post("/dispatch/assignments/bulk-approve", { assignmentIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.assignments.all });
      queryClient.invalidateQueries({ queryKey: qk.validation.all });
      queryClient.invalidateQueries({ queryKey: qk.readiness.all });
    },
  });
}

export function useTransitionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: number; status: string; notes?: string }) =>
      api.put(`/dispatch/assignments/${params.id}/status`, {
        newStatus: params.status,
        notes: params.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.assignments.all });
      queryClient.invalidateQueries({ queryKey: qk.validation.all });
    },
  });
}

export interface LoadFieldUpdate {
  driverName?: string | null;
  truckNo?: string | null;
  trailerNo?: string | null;
  carrierName?: string | null;
  weightTons?: string | null;
  netWeightTons?: string | null;
  bolNo?: string | null;
  ticketNo?: string | null;
  rate?: string | null;
  mileage?: string | null;
}

export function useUpdateLoad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      loadId,
      updates,
    }: {
      loadId: number;
      updates: LoadFieldUpdate;
    }) => api.patch(`/dispatch/loads/${loadId}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.dispatchDesk.all });
      queryClient.invalidateQueries({ queryKey: qk.assignments.all });
      queryClient.invalidateQueries({ queryKey: qk.loads.all });
      queryClient.invalidateQueries({ queryKey: qk.validation.all });
    },
  });
}

export function useBulkUpdateLoads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      loadIds,
      updates,
    }: {
      loadIds: number[];
      updates: Record<string, unknown>;
    }) => api.post("/dispatch/loads/bulk-update", { loadIds, updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.dispatchDesk.all });
      queryClient.invalidateQueries({ queryKey: qk.wells.all });
      queryClient.invalidateQueries({ queryKey: qk.loads.all });
    },
  });
}

export function useClaimAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      assignmentId,
      userId,
    }: {
      assignmentId: number;
      userId: number;
    }) =>
      api.put(`/dispatch/assignments/${assignmentId}`, { assignedTo: userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.dispatchDesk.all });
    },
  });
}

export function useDuplicateLoad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      loadId,
      count,
      dateOffset,
    }: {
      loadId: number;
      count: number;
      dateOffset?: number;
    }) =>
      api.post(`/dispatch/loads/${loadId}/duplicate`, { count, dateOffset }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.dispatchDesk.all });
      queryClient.invalidateQueries({ queryKey: qk.wells.all });
      queryClient.invalidateQueries({ queryKey: qk.loads.all });
    },
  });
}

export function useValidationConfirm() {
  return useMutation({
    mutationFn: (params: { assignmentId: number }) =>
      api.post("/dispatch/validation/confirm", params),
  });
}

export function useValidationReject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { assignmentId: number; reason?: string }) =>
      api.post("/dispatch/validation/reject", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.validation.all });
      queryClient.invalidateQueries({ queryKey: qk.assignments.all });
    },
  });
}

export function useWellSuggestions(loadId: number | null) {
  return useQuery({
    queryKey: qk.suggestions.forLoad(loadId!),
    queryFn: () =>
      api.get<
        Array<{
          wellId: number;
          wellName: string;
          score: number;
          tier: number;
          matchType: string;
        }>
      >(`/dispatch/suggest/${loadId}`),
    enabled: loadId !== null,
    staleTime: 60_000,
  });
}

export function useManualResolve() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { loadId: number; wellId: number }) =>
      api.post("/dispatch/validation/resolve", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.validation.all });
      queryClient.invalidateQueries({ queryKey: qk.assignments.all });
      queryClient.invalidateQueries({ queryKey: qk.wells.all });
      queryClient.invalidateQueries({ queryKey: qk.readiness.all });
    },
  });
}

export function useCreateWell() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { name: string }) =>
      api.post<Well>("/dispatch/wells/", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.wells.all });
    },
  });
}

export function useUpdateWell() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      id: number;
      patch: Partial<{
        name: string;
        aliases: string[];
        status: "active" | "standby" | "completed" | "closed";
        dailyTargetLoads: number;
        dailyTargetTons: string;
        latitude: string;
        longitude: string;
        propxJobId: string;
        propxDestinationId: string;
        needsRateInfo: boolean;
        ratePerTon: string | null;
        ffcRate: string | null;
        fscRate: string | null;
        mileageFromLoader: string | null;
        customerName: string | null;
        carrierId: number | null;
        loaderSandplant: string | null;
      }>;
    }) => api.put<Well>(`/dispatch/wells/${params.id}`, params.patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.wells.all });
      queryClient.invalidateQueries({ queryKey: qk.readiness.all });
    },
  });
}

// Carriers — small helper. Cached aggressively since this list changes
// rarely (3 rows seeded, phase-flipped by humans only).
export function useCarriers() {
  return useQuery({
    queryKey: ["carriers", "list"],
    queryFn: () => api.get<Carrier[]>("/dispatch/carriers/"),
    staleTime: 5 * 60_000, // 5 min — carriers change rarely
  });
}

export function useUpdateCarrier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      id: number;
      patch: Partial<{
        name: string;
        phase: "phase1" | "phase2";
        active: boolean;
        notes: string | null;
      }>;
    }) => api.put<Carrier>(`/dispatch/carriers/${params.id}`, params.patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carriers"] });
    },
  });
}

export function useSheetValidation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      spreadsheetId: string;
      sheetName: string;
      columnMap: Record<string, string>;
    }) => api.post("/sheets/validate-from-sheet", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.dispatchDesk.all });
      queryClient.invalidateQueries({ queryKey: qk.wells.all });
    },
  });
}
