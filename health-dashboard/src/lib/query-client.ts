import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 30_000,
      staleTime: 15_000,
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});
