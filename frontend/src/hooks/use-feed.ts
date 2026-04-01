import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { FeedData } from "@/types/feed";

export function useFeed() {
  return useQuery<FeedData>({
    queryKey: ["feed"],
    queryFn: () => api.get<FeedData>("/feed"),
    staleTime: 30_000,
  });
}
