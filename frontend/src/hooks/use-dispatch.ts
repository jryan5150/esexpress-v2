import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useDispatchToPcs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { wellId: string; loadIds: string[] }) =>
      api.post(`/wells/${payload.wellId}/dispatch`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["well-workspace"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
    },
  });
}
