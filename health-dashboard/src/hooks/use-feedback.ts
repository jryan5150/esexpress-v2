import { useQuery } from "@tanstack/react-query";
import {
  fetchFeedbackList,
  fetchFeedbackDetail,
  fetchFeedbackStats,
  type FeedbackItem,
  type FeedbackDetail,
  type FeedbackStats,
} from "../lib/api";

export function useFeedbackList() {
  return useQuery<FeedbackItem[]>({
    queryKey: ["feedback", "list"],
    queryFn: fetchFeedbackList,
  });
}

export function useFeedbackDetail(id: string | null) {
  return useQuery<FeedbackDetail>({
    queryKey: ["feedback", "detail", id],
    queryFn: () => fetchFeedbackDetail(id!),
    enabled: id !== null,
  });
}

export function useFeedbackStats() {
  return useQuery<FeedbackStats>({
    queryKey: ["feedback", "stats"],
    queryFn: fetchFeedbackStats,
  });
}
