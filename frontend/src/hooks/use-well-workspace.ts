import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { LoadGroup } from "@/types/feed";

interface WellWorkspaceData {
  wellName: string;
  basin: string;
  targetLoads: number;
  currentLoads: number;
  groups: LoadGroup[];
}

export function useWellWorkspace(wellId: string | undefined) {
  return useQuery<WellWorkspaceData>({
    queryKey: ["well-workspace", wellId],
    queryFn: () => api.get<WellWorkspaceData>(`/wells/${wellId}/workspace`),
    enabled: !!wellId,
    staleTime: 15_000,
  });
}

export function useResolveLoad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      loadId: string;
      resolution: string;
      value?: string;
    }) => api.post(`/loads/${payload.loadId}/resolve`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["well-workspace"] }),
  });
}

export function useBulkApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { wellId: string; loadIds: string[] }) =>
      api.post(`/wells/${payload.wellId}/bulk-approve`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["well-workspace"] }),
  });
}
