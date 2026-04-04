import { type FastifyPluginAsync } from "fastify";
import { AppError } from "../../../lib/errors.js";
import type { PhotoStatus } from "../../../db/schema.js";

const DB_UNAVAILABLE = {
  success: false,
  error: { code: "SERVICE_UNAVAILABLE", message: "Database not connected" },
};

const dispatchDeskRoutes: FastifyPluginAsync = async (fastify) => {
  // GET / — dispatch desk loads with optional filters
  fastify.get(
    "/",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            wellId: { type: "integer" },
            photoStatus: {
              type: "string",
              enum: ["attached", "pending", "missing"],
            },
            date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);

      const { getDispatchDeskLoads } =
        await import("../services/dispatch-desk.service.js");
      const query = request.query as {
        wellId?: number;
        photoStatus?: PhotoStatus;
        date?: string;
        page?: number;
        limit?: number;
      };

      const result = await getDispatchDeskLoads(db, {
        wellId: query.wellId,
        photoStatus: query.photoStatus,
        date: query.date,
        page: query.page,
        limit: query.limit,
      });

      return { success: true, ...result };
    },
  );

  // POST /mark-entered — assign PCS sequence numbers + transition to dispatch_ready
  fastify.post(
    "/mark-entered",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          required: ["assignmentIds", "pcsStartingNumber"],
          properties: {
            assignmentIds: {
              type: "array",
              items: { type: "integer" },
              minItems: 1,
            },
            pcsStartingNumber: { type: "integer", minimum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);

      const { markEntered } =
        await import("../services/dispatch-desk.service.js");
      const { assignmentIds, pcsStartingNumber } = request.body as {
        assignmentIds: number[];
        pcsStartingNumber: number;
      };
      const user = request.user as { id: number; name: string };

      try {
        const results = await markEntered(db, {
          assignmentIds,
          pcsStartingNumber,
          userId: user.id,
          userName: user.name,
        });

        const succeeded = results.filter((r) => r.success).length;
        const blocked = results.filter((r) => r.blocked).length;

        return {
          success: true,
          data: results,
          meta: {
            total: results.length,
            succeeded,
            blocked,
            failed: results.length - succeeded - blocked,
          },
        };
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

  // GET /missing-tickets — loads with no ticket and no matched JotForm submission
  fastify.get(
    "/missing-tickets",
    {
      preHandler: [fastify.authenticate],
      schema: {
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

      const { getMissingTicketLoads } =
        await import("../services/dispatch-desk.service.js");
      const { page, limit } = request.query as {
        page?: number;
        limit?: number;
      };
      const result = await getMissingTicketLoads(db, { page, limit });
      return { success: true, ...result };
    },
  );
};

export { dispatchDeskRoutes };
