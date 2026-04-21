import { QueryClient, MutationCache } from "@tanstack/react-query";
import { notify } from "../components/Toast";

// Global mutation error surface — every failed save/advance/flag/etc.
// emits a toast even when the caller didn't wire its own onError. Prevents
// silent failures where an optimistic UI reverts without telling the user
// their change didn't persist. Per-mutation onError handlers still run on
// top of this; this is additive, not a replacement.
const mutationCache = new MutationCache({
  onError: (error) => {
    const msg =
      error instanceof Error && error.message
        ? error.message
        : "Couldn't save — your change may not have persisted. Try again.";
    notify(msg, "error");
  },
});

export const queryClient = new QueryClient({
  mutationCache,
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
  workbench: {
    all: ["workbench"] as const,
    list: (filter: string, search?: string) =>
      ["workbench", "list", filter, search ?? ""] as const,
  },
  readiness: {
    all: ["readiness"] as const,
  },
  suggestions: {
    all: ["suggestions"] as const,
    forLoad: (loadId: number) => [...qk.suggestions.all, loadId] as const,
  },
  loads: {
    all: ["loads"] as const,
    detail: (id: number) => ["loads", id] as const,
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
  search: {
    all: ["search"] as const,
    query: (q: string) => ["search", q] as const,
  },
  archive: {
    all: ["archive"] as const,
    loads: (filters?: Record<string, unknown>) =>
      [...(["archive", "loads"] as const), filters] as const,
    load: (id: number) => ["archive", "load", id] as const,
  },
} as const;

/**
 * Invalidate every surface that might be showing the same underlying load/
 * assignment/photo row. A mutation in the Workbench drawer and a mutation
 * in the BOL Center both hit the same data, so both views need a refetch.
 * Single call keeps every tab "live" without each hook having to know the
 * other's query keys.
 *
 * Covered surfaces:
 *   - Workbench list (any filter/sort/page)
 *   - BOL Center tabs: reconciliation queue, JotForm submissions,
 *     PropX photos, missing tickets, stats, discrepancies
 *   - Dispatch Desk (legacy but still mounted for Steph/Katie)
 *   - Assignments endpoints (validation page)
 *   - Load detail + readiness
 */
export function invalidateSharedSurfaces() {
  queryClient.invalidateQueries({ queryKey: qk.workbench.all });
  queryClient.invalidateQueries({ queryKey: qk.bol.all });
  queryClient.invalidateQueries({ queryKey: qk.assignments.all });
  queryClient.invalidateQueries({ queryKey: qk.dispatchDesk.all });
  queryClient.invalidateQueries({ queryKey: qk.loads.all });
  queryClient.invalidateQueries({ queryKey: qk.readiness.all });
  queryClient.invalidateQueries({ queryKey: qk.validation.all });
}
