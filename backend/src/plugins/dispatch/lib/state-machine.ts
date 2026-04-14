import type { AssignmentStatus } from "../../../db/schema.js";

export const VALID_TRANSITIONS: Partial<
  Record<AssignmentStatus, AssignmentStatus[]>
> = {
  pending: ["assigned", "cancelled"],
  assigned: ["reconciled", "dispatch_ready", "pending", "cancelled"],
  reconciled: ["dispatch_ready", "assigned", "cancelled"],
  dispatch_ready: ["dispatching", "reconciled", "assigned", "cancelled"],
  dispatching: ["dispatched", "failed"],
  dispatched: ["in_transit"],
  in_transit: ["at_terminal", "at_destination"],
  at_terminal: ["loaded"],
  loaded: ["at_destination"],
  at_destination: ["delivered"],
  delivered: ["completed"],
  failed: ["dispatch_ready", "cancelled"],
  cancelled: ["pending"],
};

export function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from as AssignmentStatus];
  if (!allowed) return false;
  return allowed.includes(to as AssignmentStatus);
}

export function validateDispatchReady(fields: {
  driverName: string | null;
  loadNo: string | null;
  wellId: number | null;
  // P-03 (Jessica Apr 6, ~54:20): "no 100% without photo". A load may not
  // advance to dispatch_ready unless the BOL photo is attached. Photo
  // status enum is "attached" | "pending" | "missing".
  photoStatus?: string | null;
}): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!fields.driverName) missing.push("driverName");
  if (!fields.loadNo) missing.push("loadNo");
  if (!fields.wellId) missing.push("wellId");
  if (fields.photoStatus !== "attached") missing.push("photo");
  return { valid: missing.length === 0, missing };
}

export function createStatusHistoryEntry(
  status: string,
  changedBy?: number,
  changedByName?: string,
  notes?: string,
) {
  return {
    status,
    changedAt: new Date().toISOString(),
    changedBy,
    changedByName,
    notes,
  };
}
