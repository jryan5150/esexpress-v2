// Load Count Status — mirrors the color-coded categories the team uses on
// their daily Load Count Sheet (see docs/transcripts/2026-04-09-team-follow-up.md).
// Hex values are taken from the "Color Key" tab of that sheet.
//
// Five statuses require data we don't observe yet (PCS OAuth, finance module,
// well-rate flag, PropX export signal). Those render in the legend as
// "coming soon" and never get assigned to a live row.

export type LoadCountStatus =
  | "missing_driver"
  | "missing_ticket"
  | "need_rate"
  | "being_built"
  | "completed"
  | "being_cleared"
  | "cleared"
  | "export_completed"
  | "invoiced";

export interface LoadCountStatusMeta {
  label: string;
  hex: string;
  /** True when we have data to ever place a load in this status today. */
  available: boolean;
}

export const LOAD_COUNT_STATUS: Record<LoadCountStatus, LoadCountStatusMeta> = {
  missing_driver: {
    label: "Missing Driver",
    hex: "#00FFFF",
    available: true,
  },
  missing_ticket: {
    label: "Missing Ticket",
    hex: "#9900FF",
    available: true,
  },
  need_rate: {
    label: "Need Well Rate Info",
    hex: "#B45F06",
    available: true,
  },
  being_built: {
    label: "Loads being built",
    hex: "#00FF00",
    available: true,
  },
  completed: {
    label: "Loads Completed",
    hex: "#FF00FF",
    available: true,
  },
  being_cleared: {
    label: "Loads Being cleared",
    hex: "#EA4C89",
    available: false,
  },
  cleared: {
    label: "Loads cleared",
    hex: "#D5A6BD",
    available: false,
  },
  export_completed: {
    label: "Export (Transfers) Completed",
    hex: "#FFFF00",
    available: false,
  },
  invoiced: {
    label: "Invoiced",
    hex: "#6FA8DC",
    available: false,
  },
};

export interface DerivableLoad {
  driverName: string | null;
  ticketNo: string | null;
  bolNo: string | null;
  assignmentStatus?: string | null;
  historicalComplete?: boolean;
  /** Whether the well this load is going to has been flagged as needing
   *  rate info by an admin (O-23). */
  wellNeedsRateInfo?: boolean;
}

/**
 * Priority order (first match wins):
 *   1. missing_driver     — can't dispatch without a driver
 *   2. missing_ticket     — no BOL and no ticket number
 *   3. need_rate          — well flagged as needing rate info
 *   4. completed          — terminal v2 state or flagged historical
 *   5. being_built        — default for an in-flight load
 */
export function deriveLoadCountStatus(load: DerivableLoad): LoadCountStatus {
  if (!load.driverName?.trim()) return "missing_driver";
  if (!load.ticketNo?.trim() && !load.bolNo?.trim()) return "missing_ticket";
  if (load.wellNeedsRateInfo) return "need_rate";

  if (load.historicalComplete) return "completed";
  if (
    load.assignmentStatus === "dispatched" ||
    load.assignmentStatus === "delivered" ||
    load.assignmentStatus === "complete" ||
    load.assignmentStatus === "finalized"
  ) {
    return "completed";
  }

  return "being_built";
}

/**
 * Choose a readable text color given a background hex, using a
 * perceptual-luminance approximation (Rec. 601). Light backgrounds get near-
 * black text, dark backgrounds get white. Threshold 0.5 picks black for:
 * yellow, cyan, green, dusty rose, slate blue, hot pink. White for: magenta,
 * purple, burnt orange.
 */
export function pillTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.5 ? "#111827" : "#ffffff";
}
