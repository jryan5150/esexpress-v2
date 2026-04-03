import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";

interface FeedbackPayload {
  category: "issue" | "question" | "suggestion";
  description: string;
  pageUrl: string;
  routeName: string;
  screenshotUrl: string | null;
  breadcrumbs: Array<Record<string, unknown>>;
  sessionSummary: Record<string, unknown>;
  browser: Record<string, unknown>;
}

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (payload: FeedbackPayload) => api.post("/feedback", payload),
  });
}

export function useUploadScreenshot() {
  return useMutation({
    mutationFn: (base64: string) =>
      api.post<{ url: string }>("/feedback/screenshot", { base64 }),
  });
}
