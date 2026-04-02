import { type FastifyPluginAsync } from "fastify";
import {
  getValidationSummary,
  getAssignmentsByTier,
  confirmMatch,
  rejectMatch,
  manualResolve,
  trustSheets,
} from "../services/validation.service.js";
import { AppError } from "../../../lib/errors.js";

const DB_UNAVAILABLE = {
  success: false,
  error: { code: "SERVICE_UNAVAILABLE", message: "Database not connected" },
};

const validationRoutes: FastifyPluginAsync = async (fastify) => {
  // GET / — tier summary stats
  fastify.get(
    "/",
    {
      preHandler: [fastify.authenticate],
    },
    async (_request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);

      const data = await getValidationSummary(db);
      return { success: true, data };
    },
  );

  // GET /tier/:n — pending assignments for a specific tier
  fastify.get(
    "/tier/:n",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["n"],
          properties: {
            n: { type: "integer", minimum: 1, maximum: 3 },
          },
        },
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);

      const { n } = request.params as { n: number };
      const { page = 1, limit = 50 } = request.query as {
        page?: number;
        limit?: number;
      };
      const { data, total } = await getAssignmentsByTier(db, n, {
        page,
        limit,
      });
      return {
        success: true,
        data,
        meta: {
          tier: n,
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    },
  );

  // POST /confirm — confirm an auto-mapped assignment
  fastify.post(
    "/confirm",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["assignmentId"],
          properties: {
            assignmentId: { type: "integer" },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);

      const { assignmentId } = request.body as { assignmentId: number };
      const user = (request as any).user as { id: number; name: string };

      try {
        const data = await confirmMatch(db, assignmentId, user.id, user.name);
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

  // POST /reject — reject an auto-mapped assignment
  fastify.post(
    "/reject",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["assignmentId"],
          properties: {
            assignmentId: { type: "integer" },
            reason: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);

      const { assignmentId, reason } = request.body as {
        assignmentId: number;
        reason?: string;
      };
      const user = (request as any).user as { id: number; name: string };

      try {
        const data = await rejectMatch(
          db,
          assignmentId,
          user.id,
          user.name,
          reason,
        );
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

  // POST /resolve — manually resolve a Tier 3 unmatched load
  fastify.post(
    "/resolve",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["loadId", "wellId"],
          properties: {
            loadId: { type: "integer" },
            wellId: { type: "integer" },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);

      const { loadId, wellId } = request.body as {
        loadId: number;
        wellId: number;
      };
      const user = (request as any).user as { id: number; name: string };

      try {
        const data = await manualResolve(
          db,
          loadId,
          wellId,
          user.id,
          user.name,
        );
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

  // POST /trust-sheets — bulk approve assignments from Sheets import (admin only)
  fastify.post(
    "/trust-sheets",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
      schema: {
        body: {
          type: "object",
          required: ["assignmentIds"],
          properties: {
            assignmentIds: {
              type: "array",
              items: { type: "integer" },
              minItems: 1,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);

      const { assignmentIds } = request.body as { assignmentIds: number[] };
      const user = (request as any).user as { id: number; name: string };

      const results = await trustSheets(db, assignmentIds, user.id, user.name);
      const succeeded = results.filter((r) => r.success).length;
      return {
        success: true,
        data: results,
        meta: {
          total: results.length,
          succeeded,
          failed: results.length - succeeded,
        },
      };
    },
  );
};

export { validationRoutes };
