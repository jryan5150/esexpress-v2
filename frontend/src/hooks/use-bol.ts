import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/query-client";
import type {
  BolQueueItem,
  BolStats,
  BolSubmission,
  Paginated,
} from "../types/api";

export function useBolQueue(opts?: {
  page?: number;
  limit?: number;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.status) params.set("status", opts.status);
  const qs = params.toString() ? `?${params}` : "";
  return useQuery({
    queryKey: [...qk.bol.queue(), opts] as const,
    queryFn: () =>
      api.get<{
        data: BolQueueItem[];
        meta: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>(`/verification/jotform/queue${qs}`),
    refetchInterval: 30_000,
  });
}

export function useBolStats() {
  return useQuery({
    queryKey: qk.bol.stats(),
    queryFn: () => api.get<BolStats>("/verification/jotform/stats"),
    refetchInterval: 30_000,
  });
}

export function useBolDiscrepancies() {
  return useQuery({
    queryKey: qk.bol.discrepancies(),
    queryFn: () =>
      api.get<Paginated<BolQueueItem>>(
        "/verification/bol/operations/discrepancies",
      ),
    refetchInterval: 30_000,
  });
}

export function useMissingTickets(opts?: { page?: number; limit?: number }) {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString() ? `?${params}` : "";
  return useQuery({
    queryKey: [...qk.bol.all, "missing-tickets", opts] as const,
    queryFn: () =>
      api.get<{
        data: any[];
        meta: { page: number; limit: number; total: number };
      }>(`/dispatch/dispatch-desk/missing-tickets${qs}`),
    refetchInterval: 30_000,
  });
}

export function useAutoMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/verification/bol/operations/auto-match"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.bol.all });
    },
  });
}

export function useManualMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { submissionId: number; loadId: number }) =>
      api.post("/verification/bol/operations/manual-match", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.bol.all });
    },
  });
}

export function useReconcile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (loadId: number) =>
      api.post(`/verification/bol/operations/reconcile/${loadId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.bol.all });
      queryClient.invalidateQueries({ queryKey: qk.assignments.all });
    },
  });
}

/**
 * Manually link a JotForm photo submission to a load when the auto-match
 * couldn't find one (or was wrong). Invalidates the BOL queue + dispatch
 * desk so the new attached-photo state is reflected immediately.
 */
export function useManualMatchJotform() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { importId: number; loadId: number }) =>
      api.post("/verification/jotform/manual-match", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.bol.all });
      queryClient.invalidateQueries({ queryKey: qk.assignments.all });
      queryClient.invalidateQueries({ queryKey: qk.dispatchDesk.all });
    },
  });
}

interface JotformLoadSearchHit {
  id: number;
  loadNo: string;
  source: string;
  driverName: string | null;
  bolNo: string | null;
  ticketNo: string | null;
  deliveredOn: string | null;
  destinationName: string | null;
  weightTons: string | null;
}

export function useJotformLoadSearch(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ["jotform-load-search", query],
    queryFn: () =>
      api.get<JotformLoadSearchHit[]>(
        `/verification/jotform/load-search?q=${encodeURIComponent(query)}`,
      ),
    enabled: enabled && query.trim().length >= 2,
    staleTime: 30_000,
  });
}
