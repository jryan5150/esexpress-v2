import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/query-client";

// Re-export the type from the central types file
export type { DispatchDeskLoad } from "../types/api";

export function useMarkEntered() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      assignmentIds: number[];
      pcsStartingNumber: number;
    }) => api.post("/dispatch/dispatch-desk/mark-entered", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.dispatchDesk.all });
      queryClient.invalidateQueries({ queryKey: qk.assignments.all });
    },
  });
}

export function useAdvanceToReady() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignmentIds: number[]) =>
      api.post("/dispatch/assignments/bulk-advance", { assignmentIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.dispatchDesk.all });
      queryClient.invalidateQueries({ queryKey: qk.assignments.all });
      queryClient.invalidateQueries({ queryKey: qk.wells.all });
      queryClient.invalidateQueries({ queryKey: qk.readiness.all });
    },
  });
}

export function useAutoMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params?: { limit?: number }) =>
      api.post("/dispatch/auto-map", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.wells.all });
      queryClient.invalidateQueries({ queryKey: qk.assignments.all });
      queryClient.invalidateQueries({ queryKey: qk.validation.all });
      queryClient.invalidateQueries({ queryKey: qk.readiness.all });
    },
  });
}
