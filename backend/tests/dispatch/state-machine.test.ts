import { describe, it, expect, beforeAll } from 'vitest';

describe('Assignment State Machine', () => {
  let stateMachine: typeof import('../../src/plugins/dispatch/lib/state-machine.js');

  beforeAll(async () => {
    stateMachine = await import('../../src/plugins/dispatch/lib/state-machine.js');
  });

  it('exports VALID_TRANSITIONS map', () => {
    expect(stateMachine.VALID_TRANSITIONS).toBeDefined();
    expect(typeof stateMachine.VALID_TRANSITIONS).toBe('object');
  });

  it('pending can transition to assigned or cancelled', () => {
    expect(stateMachine.VALID_TRANSITIONS.pending).toEqual(['assigned', 'cancelled']);
  });

  it('assigned can transition to dispatch_ready, pending, or cancelled', () => {
    expect(stateMachine.VALID_TRANSITIONS.assigned).toEqual(['dispatch_ready', 'pending', 'cancelled']);
  });

  it('dispatch_ready can transition to dispatching, assigned, or cancelled', () => {
    expect(stateMachine.VALID_TRANSITIONS.dispatch_ready).toEqual(['dispatching', 'assigned', 'cancelled']);
  });

  it('dispatching can transition to dispatched or failed', () => {
    expect(stateMachine.VALID_TRANSITIONS.dispatching).toEqual(['dispatched', 'failed']);
  });

  it('dispatched can only transition to in_transit', () => {
    expect(stateMachine.VALID_TRANSITIONS.dispatched).toEqual(['in_transit']);
  });

  it('delivered can only transition to completed', () => {
    expect(stateMachine.VALID_TRANSITIONS.delivered).toEqual(['completed']);
  });

  it('failed can transition to dispatch_ready or cancelled', () => {
    expect(stateMachine.VALID_TRANSITIONS.failed).toEqual(['dispatch_ready', 'cancelled']);
  });

  it('cancelled can transition back to pending', () => {
    expect(stateMachine.VALID_TRANSITIONS.cancelled).toEqual(['pending']);
  });

  it('completed is a terminal state (no transitions)', () => {
    expect(stateMachine.VALID_TRANSITIONS.completed).toBeUndefined();
  });

  it('isValidTransition returns true for valid transitions', () => {
    expect(stateMachine.isValidTransition('pending', 'assigned')).toBe(true);
    expect(stateMachine.isValidTransition('assigned', 'dispatch_ready')).toBe(true);
    expect(stateMachine.isValidTransition('dispatch_ready', 'dispatching')).toBe(true);
  });

  it('isValidTransition returns false for invalid transitions', () => {
    expect(stateMachine.isValidTransition('pending', 'dispatched')).toBe(false);
    expect(stateMachine.isValidTransition('completed', 'pending')).toBe(false);
    expect(stateMachine.isValidTransition('delivered', 'cancelled')).toBe(false);
  });

  it('validateDispatchReady checks required fields', () => {
    const result = stateMachine.validateDispatchReady({
      driverName: null,
      loadNo: 'L-001',
      wellId: 1,
    });
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('driverName');
  });

  it('validateDispatchReady passes with all fields', () => {
    const result = stateMachine.validateDispatchReady({
      driverName: 'John Doe',
      loadNo: 'L-001',
      wellId: 1,
    });
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('createStatusHistoryEntry returns a valid entry', () => {
    const entry = stateMachine.createStatusHistoryEntry('assigned', 1, 'Admin', 'Assigned to well');
    expect(entry.status).toBe('assigned');
    expect(entry.changedBy).toBe(1);
    expect(entry.changedByName).toBe('Admin');
    expect(entry.notes).toBe('Assigned to well');
    expect(entry.changedAt).toBeDefined();
  });
});
