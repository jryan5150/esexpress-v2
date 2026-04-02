import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/query-client";
import type {
  PaymentBatch,
  FinanceStatusSummary,
  FinanceSummary,
  Paginated,
} from "../types/api";

export function useFinanceBatches(filters?: {
  status?: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.page) params.set("page", String(filters.page));
  const qs = params.toString() ? `?${params}` : "";
  return useQuery({
    queryKey: qk.finance.batches(filters),
    queryFn: () => api.get<Paginated<PaymentBatch>>(`/finance/batches${qs}`),
  });
}

export function useFinanceStatusSummary() {
  return useQuery({
    queryKey: qk.finance.statusSummary(),
    queryFn: () => api.get<FinanceStatusSummary>("/finance/status-summary"),
  });
}

export function useFinanceSummary() {
  return useQuery({
    queryKey: qk.finance.summary(),
    queryFn: () => api.get<FinanceSummary>("/finance/summary"),
  });
}

export function useCreateBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      driverId: string;
      startDate: string;
      endDate: string;
    }) => api.post<PaymentBatch>("/finance/batches", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.finance.all });
    },
  });
}

export function useBatchAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      batchId: number;
      action: "submit" | "approve" | "reject" | "paid";
    }) => api.post(`/finance/batches/${params.batchId}/${params.action}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.finance.all });
    },
  });
}
