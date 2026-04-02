import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/query-client";
import type {
  BolQueueItem,
  BolStats,
  BolSubmission,
  Paginated,
} from "../types/api";

export function useBolQueue() {
  return useQuery({
    queryKey: qk.bol.queue(),
    queryFn: () =>
      api.get<BolQueueItem[]>("/verification/bol/operations/queue"),
    refetchInterval: 30_000,
  });
}

export function useBolStats() {
  return useQuery({
    queryKey: qk.bol.stats(),
    queryFn: () => api.get<BolStats>("/verification/bol/operations/stats"),
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
