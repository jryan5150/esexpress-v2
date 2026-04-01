import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface BolItem {
  bolNumber: string;
  status: "matched" | "unmatched" | "discrepancy" | "missing_ticket";
  detail?: string;
  driverName?: string;
  weightPropx?: number;
  weightTicket?: number;
}

interface BolQueueData {
  matched: BolItem[];
  unmatched: BolItem[];
  discrepancies: BolItem[];
  missingTickets: BolItem[];
  totalExceptions: number;
  readyForExport: number;
}

export type { BolItem, BolQueueData };

export function useBolQueue() {
  return useQuery<BolQueueData>({
    queryKey: ["bol-queue"],
    queryFn: () => api.get<BolQueueData>("/bol/queue"),
    staleTime: 30_000,
  });
}
