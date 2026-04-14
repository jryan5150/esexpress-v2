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
    available: false,
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
}

/**
 * Priority order (first match wins):
 *   1. missing_driver     — can't dispatch without a driver
 *   2. missing_ticket     — no BOL and no ticket number
 *   3. completed          — terminal v2 state or flagged historical
 *   4. being_built        — default for an in-flight load
 */
export function deriveLoadCountStatus(load: DerivableLoad): LoadCountStatus {
  if (!load.driverName?.trim()) return "missing_driver";
  if (!load.ticketNo?.trim() && !load.bolNo?.trim()) return "missing_ticket";

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

/** Hex → readable text color for pills. Saturated backgrounds → white text. */
export function pillTextColor(_hex: string): string {
  return "#ffffff";
}
