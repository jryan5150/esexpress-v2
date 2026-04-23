// Well
export interface Well {
  id: number;
  name: string;
  aliases: string[];
  propxDestinationId: string | null;
  propxJobId: string | null;
  latitude: number | null;
  longitude: number | null;
  dailyTargetLoads: number;
  dailyTargetTons: number | null;
  status: "active" | "standby" | "completed" | "closed";
  needsRateInfo?: boolean;
  // Per-well commercial + logistics fields (admin-owned, added 2026-04-22).
  // Numerics are wire-string (drizzle numeric -> string) to preserve
  // precision; frontend renders as-is and sends back as strings.
  ratePerTon?: string | null;
  ffcRate?: string | null;
  fscRate?: string | null;
  mileageFromLoader?: string | null;
  customerName?: string | null;
  carrierId?: number | null;
  loaderSandplant?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Carrier — trucking company we coordinate dispatch for.
// phase drives the validation-rollout dial (phase1 = Jessica validates
// all loads; phase2 = builder self-validates on dispatch desk).
export interface Carrier {
  id: number;
  name: string;
  phase: "phase1" | "phase2";
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// Well with aggregated assignment stats (from listing endpoint)
export interface WellWithStats extends Well {
  totalLoads: number;
  ready: number;
  review: number;
  assigned: number;
  missing: number;
  validated: number;
}

// Load (from PropX/Logistiq ingestion)
export interface Load {
  id: number;
  propxLoadId: string;
  jobId: string | null;
  dataSource: "propx" | "logistiq" | "manual";
  driverName: string | null;
  truckNumber: string | null;
  carrierName: string | null;
  product: string | null;
  sandPlant: string | null;
  destinationName: string | null;
  weight: number | null;
  weightUnit: string | null;
  bolNumber: string | null;
  ticketNumber: string | null;
  loadInDate: string | null;
  unloadDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// Assignment (dispatch record)
export type AssignmentStatus =
  | "pending"
  | "suggested"
  | "assigned"
  | "dispatch_ready"
  | "dispatched"
  | "delivered"
  | "reconciled"
  | "closed"
  | "cancelled"
  | "rejected";

export type PhotoStatus = "attached" | "pending" | "missing";

export interface Assignment {
  id: number;
  wellId: number;
  loadId: number;
  assignmentStatus: AssignmentStatus;
  confidenceTier: number | null;
  confidenceScore: number | null;
  photoStatus: PhotoStatus;
  assignedTo: string | null;
  notes: string | null;
  pcsSequenceNumber: number | null;
  createdAt: string;
  updatedAt: string;
  // Joined fields (when expanded)
  well?: Well;
  load?: Load;
}

// Dispatch desk load (joined view for clipboard bridge)
export interface DispatchDeskLoad {
  assignmentId: number;
  assignmentStatus: AssignmentStatus;
  photoStatus: PhotoStatus | null;
  pcsSequence: number | null;
  autoMapTier: number | null;
  loadId: number;
  loadNo: string;
  driverName: string | null;
  truckNo: string | null;
  carrierName: string | null;
  productDescription: string | null;
  weightTons: string | null;
  bolNo: string | null;
  ticketNo: string | null;
  deliveredOn: string | null;
  wellId: number;
  wellName: string;
  canEnter: boolean;
  photoUrls?: string[];
  notes?: string | null;
  matchAudit?: unknown;
}

// Validation tier summary
export interface ValidationSummary {
  tier1: { count: number; description: string };
  tier2: { count: number; description: string };
  tier3: { count: number; description: string };
  total: number;
}

// BOL operations
export interface BolSubmission {
  id: number;
  loadId: number | null;
  driverId: string | null;
  bolNumber: string | null;
  weight: number | null;
  status:
    | "pending"
    | "extracting"
    | "extracted"
    | "matched"
    | "discrepancy"
    | "confirmed"
    | "failed";
  photoUrls: string[];
  extractedData: Record<string, unknown> | null;
  createdAt: string;
}

export interface BolQueueItem {
  submission: BolSubmission;
  matchedLoad: Load | null;
  discrepancies: Array<{
    field: string;
    bolValue: unknown;
    loadValue: unknown;
    message: string;
  }>;
}

export interface BolStats {
  total: number;
  matched: number;
  unmatched: number;
  discrepancy: number;
  pending: number;
}

// Finance
export type BatchStatus =
  | "draft"
  | "pending_review"
  | "under_review"
  | "approved"
  | "paid"
  | "rejected"
  | "cancelled";

export interface PaymentBatch {
  id: number;
  driverId: string;
  driverName: string;
  startDate: string;
  endDate: string;
  loadCount: number;
  totalAmount: string;
  ratePerTon: string | null;
  ratePerMile: string | null;
  rateType: string | null;
  status: BatchStatus;
  deductions: Array<{ description: string; amount: number }>;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceStatusSummary {
  draft: number;
  pending_review: number;
  under_review: number;
  approved: number;
  paid: number;
  rejected: number;
  cancelled: number;
}

export interface FinanceSummary {
  totalPending: number;
  totalPaid: number;
  batchCount: number;
}

// Auth
export interface User {
  id: number;
  email: string;
  name: string;
  role: "admin" | "dispatcher" | "viewer";
}

export interface LoginResponse {
  token: string;
  user: User;
}

// Paginated response
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Dispatch readiness
export interface DispatchReadiness {
  totalAssignments: number;
  readyCount: number;
  missingFields: Array<{ field: string; count: number }>;
  completionRate: number;
}

// ── Search ────────────────────────────────────────────────
export interface SearchResult {
  id: number;
  loadNo: string;
  driverName: string | null;
  carrierName: string | null;
  bolNo: string | null;
  ticketNo: string | null;
  deliveredOn: string | null;
  wellName: string | null;
}

export interface SearchResponse {
  live: SearchResult[];
  archive: SearchResult[];
}

// ── Breadcrumbs ───────────────────────────────────────────
export type BreadcrumbZone = "live" | "archive" | "search";

export interface BreadcrumbEvent {
  eventType: string;
  eventData: Record<string, unknown>;
  zone: BreadcrumbZone;
  timestamp: string;
}

// ── Workbench (v5) ────────────────────────────────────────
export type HandlerStage =
  | "uncertain"
  | "ready_to_build"
  | "building"
  | "entered"
  | "cleared";

export type UncertainReason =
  | "unassigned_well"
  | "fuzzy_match"
  | "bol_mismatch"
  | "weight_mismatch"
  | "no_photo_48h"
  | "rate_missing"
  | "missing_driver"
  | "missing_tickets";

export type WorkbenchFilter =
  | "uncertain"
  | "ready_to_build"
  | "mine"
  | "ready_to_clear"
  | "entered_today"
  | "missing_ticket"
  | "missing_driver"
  | "needs_rate"
  | "built_today"
  | "not_in_pcs"
  | "all";

export type LoadSource = "propx" | "logistiq" | "jotform" | "manual";

export interface WorkbenchRow {
  assignmentId: number;
  handlerStage: HandlerStage;
  currentHandlerId: number | null;
  currentHandlerName: string | null;
  currentHandlerColor: string | null;
  uncertainReasons: UncertainReason[];
  stageChangedAt: string | null;
  enteredOn: string | null;
  loadId: number;
  loadNo: string;
  loadSource: LoadSource;
  driverName: string | null;
  carrierName: string | null;
  bolNo: string | null;
  ticketNo: string | null;
  weightTons: string | null;
  truckNo: string | null;
  deliveredOn: string | null;
  pickupState: "pending" | "in_progress" | "complete" | null;
  deliveryState: "pending" | "in_progress" | "complete" | null;
  wellId: number | null;
  wellName: string | null;
  photoStatus: "attached" | "pending" | "missing" | null;
  photoThumbUrl: string | null;
  /** Total count across assignment-scoped + load-scoped + historical bol_submissions.
   *  Drives the multi-photo count badge on rows and the prev/next affordance
   *  on the drawer. 0 when no photo exists anywhere. */
  photoCount: number;
  /** Derived semantic state — answers "why isn't there a photo?" instead
   *  of binary attached/missing. See photo-state.service.ts. Auto-
   *  transitions based on load age + JotForm sync cadence. */
  photoState:
    | "attached"
    | "pending_jotform"
    | "overdue"
    | "needs_review"
    | "human_flagged_missing"
    | "unreadable";
  /** Contextual message for non-attached states (empty for attached). */
  photoStateMessage: string;
  /** Minutes since load.createdAt — drives overdue math; null if unknown. */
  photoStateMinutesOld: number | null;
  /** Hint: should UI show a "Run Check" button to force a JotForm sync? */
  photoStateAllowRunCheck: boolean;
  /** ISO — when the next scheduled JotForm sync will fire. */
  photoStateNextSync: string | null;
  rate: string | null;
  pcsNumber: string | null;
  /** PCS-side status (populated by /pcs/sync-loads). "Active" | "Dispatched"
   *  | "Delivered" | etc. null if v2 has no PCS record for this load. */
  pcsStatus: string | null;
  /** PCS internal loadId — present when reconciled against PCS. null if not. */
  pcsLoadId: number | null;
  notes: string | null;
  statusHistory: Array<{
    status: string;
    changedAt: string;
    changedBy?: number;
    changedByName?: string;
    notes?: string;
  }>;
  matchScore: number;
  matchTier: "high" | "medium" | "low" | "uncertain";
  matchDrivers: Array<{
    feature: string;
    value: number;
    weight: number;
    contribution: number;
  }>;
}
