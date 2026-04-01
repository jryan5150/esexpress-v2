export type AssignmentStatus =
  | "pending"
  | "suggested"
  | "assigned"
  | "dispatch_ready"
  | "dispatched"
  | "delivered"
  | "reconciled"
  | "closed";

export type ConfidenceTier = "tier1" | "tier2" | "tier3";

export type VerificationStatus = "verified" | "mismatch" | "missing";

export interface Verification {
  bol: VerificationStatus;
  bolDetail?: string;
  weight: VerificationStatus;
  weightDetail?: string;
  photo: VerificationStatus;
}

export interface Load {
  id: string;
  loadNumber: string;
  driverName: string | null;
  truckNumber: string | null;
  weight: number | null;
  bolNumber: string | null;
  sandPlant: string | null;
  product: string | null;
  loadInDate: string | null;
  unloadDate: string | null;
  status: AssignmentStatus;
  confidenceTier: ConfidenceTier;
  confidenceScore: number;
  verification: Verification;
  wellId: string;
  wellName: string;
}

export interface Well {
  id: string;
  name: string;
  aliases: string[];
  dailyTargetLoads: number;
  status: "active" | "standby" | "completed" | "closed";
  latitude: number | null;
  longitude: number | null;
}
