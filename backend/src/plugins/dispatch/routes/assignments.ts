import { type FastifyPluginAsync } from 'fastify';
import { ASSIGNMENT_STATUSES } from '../../../db/schema.js';
import {
  getAssignmentQueue,
  getDailyAssignments,
  getAssignmentStats,
  transitionStatus,
  bulkAssign,
  bulkApprove,
} from '../services/assignments.service.js';
import { AppError } from '../../../lib/errors.js';

const assignmentRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /assignments/queue — paginated pending assignments
  fastify.get(
    '/queue',
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not connected' },
        });
      }
      const { page, limit } = request.query as { page: number; limit: number };
      const data = await getAssignmentQueue(db, page, limit);
      return { success: true, data, meta: { page, limit, count: data.length } };
    },
  );

  // GET /assignments/pending-review — Tier 1 auto-mapped, status pending
  fastify.get(
    '/pending-review',
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not connected' },
        });
      }
      const { eq, and, desc } = await import('drizzle-orm');
      const { assignments } = await import('../../../db/schema.js');
      const { page, limit } = request.query as { page: number; limit: number };
      const offset = (page - 1) * limit;
      const data = await db
        .select()
        .from(assignments)
        .where(and(eq(assignments.status, 'pending'), eq(assignments.autoMapTier, 1)))
        .orderBy(desc(assignments.createdAt))
        .limit(limit)
        .offset(offset);
      return { success: true, data, meta: { page, limit, count: data.length } };
    },
  );

  // GET /assignments/daily — assignments for a specific date
  fastify.get(
    '/daily',
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not connected' },
        });
      }
      const { date } = request.query as { date?: string };
      const resolvedDate = date ?? new Date().toISOString().slice(0, 10);
      const data = await getDailyAssignments(db, resolvedDate);
      return { success: true, data, meta: { date: resolvedDate, count: data.length } };
    },
  );

  // GET /assignments/stats — status + photo status counts
  fastify.get(
    '/stats',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not connected' },
        });
      }
      const data = await getAssignmentStats(db);
      return { success: true, data };
    },
  );

  // PUT /assignments/:id/status — transition assignment status
  fastify.put(
    '/:id/status',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'integer' } },
        },
        body: {
          type: 'object',
          required: ['newStatus'],
          properties: {
            newStatus: { type: 'string', enum: [...ASSIGNMENT_STATUSES] },
            notes: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not connected' },
        });
      }
      const { id } = request.params as { id: number };
      const { newStatus, notes } = request.body as { newStatus: string; notes?: string };
      const user = (request as any).user as { id: number; name: string };
      try {
        const data = await transitionStatus(db, id, newStatus, user.id, user.name, notes);
        return { success: true, data };
      } catch (err: any) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({
            success: false,
            error: { code: err.code, message: err.message },
          });
        }
        throw err;
      }
    },
  );

  // PUT /assignments/:id — update assignment fields (assignedTo, notes, etc.)
  fastify.put(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'integer' } },
        },
        body: {
          type: 'object',
          properties: {
            assignedTo: { type: 'integer' },
            notes: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not connected' },
        });
      }
      const { id } = request.params as { id: number };
      const updates = request.body as { assignedTo?: number; notes?: string };
      const { eq } = await import('drizzle-orm');
      const { assignments } = await import('../../../db/schema.js');
      const [existing] = await db
        .select()
        .from(assignments)
        .where(eq(assignments.id, id))
        .limit(1);
      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: `Assignment with id ${id} not found` },
        });
      }
      const [updated] = await db
        .update(assignments)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(assignments.id, id))
        .returning();
      return { success: true, data: updated };
    },
  );

  // POST /assignments/bulk-assign — create assignments for multiple loads to a well
  fastify.post(
    '/bulk-assign',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['wellId', 'loadIds'],
          properties: {
            wellId: { type: 'integer' },
            loadIds: { type: 'array', items: { type: 'integer' }, minItems: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not connected' },
        });
      }
      const { wellId, loadIds } = request.body as { wellId: number; loadIds: number[] };
      const user = (request as any).user as { id: number; name: string };
      const results = await bulkAssign(db, wellId, loadIds, user.id, user.name);
      const succeeded = results.filter((r) => r.success).length;
      return {
        success: true,
        data: results,
        meta: { total: results.length, succeeded, failed: results.length - succeeded },
      };
    },
  );

  // POST /assignments/bulk-approve — transition multiple pending assignments to assigned
  fastify.post(
    '/bulk-approve',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['assignmentIds'],
          properties: {
            assignmentIds: { type: 'array', items: { type: 'integer' }, minItems: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not connected' },
        });
      }
      const { assignmentIds } = request.body as { assignmentIds: number[] };
      const user = (request as any).user as { id: number; name: string };
      const results = await bulkApprove(db, assignmentIds, user.id, user.name);
      const succeeded = results.filter((r) => r.success).length;
      return {
        success: true,
        data: results,
        meta: { total: results.length, succeeded, failed: results.length - succeeded },
      };
    },
  );
};

export { assignmentRoutes };
