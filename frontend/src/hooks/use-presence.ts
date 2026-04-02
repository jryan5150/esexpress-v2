import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";

interface UserPresence {
  userId: number;
  userName: string;
  currentPage: string;
  wellId: number | null;
  wellName: string | null;
  assignmentId: number | null;
  lastSeen: string;
}

export function usePresence() {
  return useQuery({
    queryKey: ["presence"],
    queryFn: () => api.get<UserPresence[]>("/dispatch/presence/"),
    refetchInterval: 10_000,
  });
}

export function useHeartbeat(location: {
  currentPage: string;
  wellId?: number | null;
  wellName?: string | null;
  assignmentId?: number | null;
}) {
  const heartbeat = useMutation({
    mutationFn: (payload: typeof location) =>
      api.post("/dispatch/presence/heartbeat", payload),
  });

  useEffect(() => {
    // Send immediately
    heartbeat.mutate(location);

    // Then every 15 seconds
    const interval = setInterval(() => {
      heartbeat.mutate(location);
    }, 15_000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.currentPage, location.wellId]);
}
