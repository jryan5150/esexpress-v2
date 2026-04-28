import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { qk } from "../../lib/query-client";
import type { DispatchDeskLoad } from "../../types/api";

// Backend returns {success, data: DispatchDeskLoad[], meta: {page, limit, count}}.
// api.get unwraps json.data, so the queryFn resolves to the array directly.
// We bundle it back into an items/total shape so the page renders without
// double-unwrap surprises.
interface ArchivePage {
  items: DispatchDeskLoad[];
  total: number;
}

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

  return useQuery<ArchivePage>({
    queryKey: qk.archive.loads(filters),
    queryFn: async () => {
      const items = await api.get<DispatchDeskLoad[]>(
        `/dispatch/dispatch-desk?${qs}`,
      );
      // Backend doesn't return a total. Use returned page size as a
      // floor — pagination shows "this page of N" honestly, and the
      // Pagination control's `next` button stays available while a
      // full page comes back.
      const limit = filters?.limit ?? 100;
      const page = filters?.page ?? 1;
      const total =
        items.length === limit
          ? page * limit + 1
          : (page - 1) * limit + items.length;
      return { items, total };
    },
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
