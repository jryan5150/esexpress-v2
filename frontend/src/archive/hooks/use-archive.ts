import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { qk } from "../../lib/query-client";
import type { DispatchDeskLoad, Paginated } from "../../types/api";

export function useArchiveLoads(filters?: {
  wellId?: number;
  date?: string;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  params.set("era", "archive");
  if (filters?.wellId) params.set("wellId", String(filters.wellId));
  if (filters?.date) params.set("date", filters.date);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: qk.archive.loads(filters),
    queryFn: () =>
      api.get<Paginated<DispatchDeskLoad>>(`/dispatch/dispatch-desk?${qs}`),
  });
}

export function useArchiveLoad(id: number) {
  return useQuery({
    queryKey: qk.archive.load(id),
    queryFn: () =>
      api.get<DispatchDeskLoad>(`/dispatch/loads/${id}?era=archive`),
    enabled: id > 0,
  });
}
