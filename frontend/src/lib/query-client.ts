import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

export const queryKeys = {
  feed: {
    all: ["feed"] as const,
    summary: () => ["feed", "summary"] as const,
  },

  wells: {
    all: ["wells"] as const,
    list: (filters?: unknown) => ["wells", "list", filters] as const,
    detail: (id: string) => ["wells", "detail", id] as const,
    workspace: (id: string) => ["wells", "workspace", id] as const,
  },

  assignments: {
    all: ["assignments"] as const,
    byWell: (wellId: string) => ["assignments", "byWell", wellId] as const,
  },

  bol: {
    all: ["bol"] as const,
    queue: (filters?: unknown) => ["bol", "queue", filters] as const,
  },

  dispatch: {
    all: ["dispatch"] as const,
    readiness: (wellId: string) => ["dispatch", "readiness", wellId] as const,
  },
} as const;
