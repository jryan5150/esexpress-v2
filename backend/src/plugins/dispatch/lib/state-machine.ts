import type { AssignmentStatus } from '../../../db/schema.js';

export const VALID_TRANSITIONS: Partial<Record<AssignmentStatus, AssignmentStatus[]>> = {
  pending:        ['assigned', 'cancelled'],
  assigned:       ['dispatch_ready', 'pending', 'cancelled'],
  dispatch_ready: ['dispatching', 'assigned', 'cancelled'],
  dispatching:    ['dispatched', 'failed'],
  dispatched:     ['in_transit'],
  in_transit:     ['at_terminal', 'at_destination'],
  at_terminal:    ['loaded'],
  loaded:         ['at_destination'],
  at_destination: ['delivered'],
  delivered:      ['completed'],
  failed:         ['dispatch_ready', 'cancelled'],
  cancelled:      ['pending'],
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
}): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!fields.driverName) missing.push('driverName');
  if (!fields.loadNo) missing.push('loadNo');
  if (!fields.wellId) missing.push('wellId');
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
