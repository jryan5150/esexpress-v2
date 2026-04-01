import type { Load } from "./load";

export interface SystemHandledSummary {
  loadsMatched: number;
  bolsAttached: number;
  photosLinked: number;
}

export interface OperatorPresence {
  userId: string;
  name: string;
  color: string;
  location: string;
  lastActive: string;
}

export interface WellSummary {
  wellId: string;
  wellName: string;
  totalLoads: number;
  readyCount: number;
  reviewCount: number;
  missingCount: number;
  operators: OperatorPresence[];
}

export interface FeedData {
  systemHandled: SystemHandledSummary;
  wellSummaries: WellSummary[];
  date: string;
}

export interface LoadGroup {
  status: "ready" | "review" | "missing";
  loads: Load[];
  count: number;
}
