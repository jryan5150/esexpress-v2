import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/query-client";
import type { SearchResponse } from "../types/api";

export function useGlobalSearch(query: string) {
  return useQuery({
    queryKey: qk.search.query(query),
    queryFn: () =>
      api.get<SearchResponse>(
        `/dispatch/search?q=${encodeURIComponent(query)}&limit=10`,
      ),
    enabled: query.length >= 2,
    staleTime: 10_000,
  });
}
