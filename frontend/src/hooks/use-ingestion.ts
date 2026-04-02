import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/query-client";

export function useSyncPropx() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { startDate: string; endDate: string }) =>
      api.post("/ingestion/sync/propx", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.assignments.all });
      queryClient.invalidateQueries({ queryKey: qk.dispatchDesk.all });
    },
  });
}

export function useSyncLogistiq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { startDate: string; endDate: string }) =>
      api.post("/ingestion/sync/logistiq", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.assignments.all });
      queryClient.invalidateQueries({ queryKey: qk.dispatchDesk.all });
    },
  });
}
