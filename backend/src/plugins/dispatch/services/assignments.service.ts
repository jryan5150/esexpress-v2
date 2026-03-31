import { eq, and, sql, desc } from 'drizzle-orm';
import { assignments, loads, wells } from '../../../db/schema.js';
import {
  isValidTransition,
  validateDispatchReady,
  createStatusHistoryEntry,
  VALID_TRANSITIONS,
} from '../lib/state-machine.js';
import { ValidationError, NotFoundError } from '../../../lib/errors.js';
import type { Database } from '../../../db/client.js';
import type { AssignmentStatus } from '../../../db/schema.js';

export interface CreateAssignmentInput {
  wellId: number;
  loadId: number;
  assignedBy: number;
  assignedByName: string;
  autoMapTier?: number;
  autoMapScore?: string;
}

export async function createAssignment(db: Database, input: CreateAssignmentInput) {
  const entry = createStatusHistoryEntry('pending', input.assignedBy, input.assignedByName, 'Assignment created');
  const [assignment] = await db.insert(assignments).values({
    wellId: input.wellId,
    loadId: input.loadId,
    status: 'pending',
    assignedBy: input.assignedBy,
    autoMapTier: input.autoMapTier,
    autoMapScore: input.autoMapScore,
    statusHistory: [entry],
  }).returning();
  return assignment;
}

export async function transitionStatus(
  db: Database,
  assignmentId: number,
  newStatus: string,
  userId: number,
  userName: string,
  notes?: string,
) {
  const [assignment] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!assignment) throw new NotFoundError('Assignment', assignmentId);

  const currentStatus = assignment.status;
  if (!isValidTransition(currentStatus, newStatus)) {
    const allowed = VALID_TRANSITIONS[currentStatus as AssignmentStatus] ?? [];
    throw new ValidationError(
      `Invalid transition: ${currentStatus} -> ${newStatus}. Allowed: [${allowed.join(', ')}]`,
    );
  }

  if (newStatus === 'dispatch_ready') {
    const [load] = await db.select().from(loads).where(eq(loads.id, assignment.loadId)).limit(1);
    const result = validateDispatchReady({
      driverName: load?.driverName ?? null,
      loadNo: load?.loadNo ?? null,
      wellId: assignment.wellId,
    });
    if (!result.valid) {
      throw new ValidationError(
        `Missing required fields for dispatch_ready: ${result.missing.join(', ')}`,
      );
    }
  }

  const entry = createStatusHistoryEntry(newStatus, userId, userName, notes);
  const history = [...(assignment.statusHistory as any[]), entry];

  const [updated] = await db
    .update(assignments)
    .set({
      status: newStatus as AssignmentStatus,
      statusHistory: history,
      updatedAt: new Date(),
    })
    .where(eq(assignments.id, assignmentId))
    .returning();

  return updated;
}

export async function bulkAssign(
  db: Database,
  wellId: number,
  loadIds: number[],
  assignedBy: number,
  assignedByName: string,
) {
  const results = [];
  for (const loadId of loadIds) {
    try {
      const assignment = await createAssignment(db, { wellId, loadId, assignedBy, assignedByName });
      results.push({ loadId, success: true, assignmentId: assignment.id });
    } catch (err: any) {
      results.push({ loadId, success: false, error: err.message });
    }
  }
  return results;
}

export async function bulkApprove(
  db: Database,
  assignmentIds: number[],
  userId: number,
  userName: string,
) {
  const results = [];
  for (const id of assignmentIds) {
    try {
      await transitionStatus(db, id, 'assigned', userId, userName, 'Bulk approved');
      results.push({ assignmentId: id, success: true });
    } catch (err: any) {
      results.push({ assignmentId: id, success: false, error: err.message });
    }
  }
  return results;
}

export async function getAssignmentQueue(db: Database, page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  return db
    .select()
    .from(assignments)
    .where(eq(assignments.status, 'pending'))
    .orderBy(desc(assignments.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getDailyAssignments(db: Database, date: string) {
  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);
  return db
    .select()
    .from(assignments)
    .where(
      and(
        sql`${assignments.createdAt} >= ${startOfDay}`,
        sql`${assignments.createdAt} <= ${endOfDay}`,
      ),
    )
    .orderBy(desc(assignments.createdAt));
}

export async function getAssignmentStats(db: Database) {
  const statusCounts = await db
    .select({ status: assignments.status, count: sql<number>`count(*)` })
    .from(assignments)
    .groupBy(assignments.status);
  const photoStatusCounts = await db
    .select({ photoStatus: assignments.photoStatus, count: sql<number>`count(*)` })
    .from(assignments)
    .groupBy(assignments.photoStatus);
  return { statusCounts, photoStatusCounts };
}
