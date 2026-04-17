import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/query-client";
import type {
  WorkbenchFilter,
  WorkbenchRow,
  HandlerStage,
} from "../types/api";

export function useWorkbench(filter: WorkbenchFilter, search?: string) {
  return useQuery({
    queryKey: qk.workbench.list(filter, search),
    queryFn: () =>
      api.get<{ rows: WorkbenchRow[]; total: number }>(
        `/dispatch/workbench?filter=${encodeURIComponent(filter)}${
          search ? `&search=${encodeURIComponent(search)}` : ""
        }`,
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
