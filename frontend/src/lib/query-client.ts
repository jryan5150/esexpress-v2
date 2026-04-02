import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

export const qk = {
  wells: {
    all: ["wells"] as const,
    list: () => [...qk.wells.all, "list"] as const,
    detail: (id: string) => [...qk.wells.all, id] as const,
  },
  assignments: {
    all: ["assignments"] as const,
    queue: (filters?: Record<string, unknown>) =>
      [...qk.assignments.all, "queue", filters] as const,
    daily: (date: string) => [...qk.assignments.all, "daily", date] as const,
    stats: () => [...qk.assignments.all, "stats"] as const,
    pendingReview: () => [...qk.assignments.all, "pending-review"] as const,
  },
  validation: {
    all: ["validation"] as const,
    summary: () => [...qk.validation.all, "summary"] as const,
    tier: (n: number) => [...qk.validation.all, "tier", n] as const,
  },
  dispatchDesk: {
    all: ["dispatch-desk"] as const,
    loads: (filters?: Record<string, unknown>) =>
      [...qk.dispatchDesk.all, "loads", filters] as const,
  },
  readiness: {
    all: ["readiness"] as const,
  },
  bol: {
    all: ["bol"] as const,
    queue: () => [...qk.bol.all, "queue"] as const,
    stats: () => [...qk.bol.all, "stats"] as const,
    discrepancies: () => [...qk.bol.all, "discrepancies"] as const,
    submissions: (filters?: Record<string, unknown>) =>
      [...qk.bol.all, "submissions", filters] as const,
  },
  finance: {
    all: ["finance"] as const,
    batches: (filters?: Record<string, unknown>) =>
      [...qk.finance.all, "batches", filters] as const,
    summary: () => [...qk.finance.all, "summary"] as const,
    statusSummary: () => [...qk.finance.all, "status-summary"] as const,
  },
  auth: {
    me: ["auth", "me"] as const,
  },
} as const;
