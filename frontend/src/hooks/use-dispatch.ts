import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/query-client";

export interface DispatchResult {
  dispatched: number;
  failed: number;
  errors: Array<{ assignmentId: number; error: string }>;
}

export function useDispatchPreview() {
  return useMutation({
    mutationFn: (assignmentIds: number[]) =>
      api.post<{ preview: unknown }>("/pcs/dispatch-preview", {
        assignmentIds,
      }),
  });
}

export function useDispatchToPcs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignmentIds: number[]) =>
      api.post<DispatchResult>("/pcs/dispatch", { assignmentIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.assignments.all });
      queryClient.invalidateQueries({ queryKey: qk.dispatchDesk.all });
      queryClient.invalidateQueries({ queryKey: qk.readiness.all });
    },
  });
}
