import { type FastifyPluginAsync } from "fastify";
import {
  listCarriers,
  getCarrierById,
  updateCarrier,
} from "../services/carriers.service.js";

/**
 * GET /api/v1/dispatch/carriers        — list carriers (any authenticated user)
 * GET /api/v1/dispatch/carriers/:id    — detail
 * PUT /api/v1/dispatch/carriers/:id    — update phase / active / notes (admin only)
 *
 * Intentionally read-mostly: seed data is loaded by the migration. The
 * phase toggle is the only frequently-used write endpoint — Jessica
 * flips a carrier from phase1 → phase2 once PCS REST dispatch is live
 * for that carrier.
 */
const carrierRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/",
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "array" },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const db = fastify.db;
      if (!db) {
        return (reply as any).status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });
      }
      const data = await listCarriers(db);
      return { success: true, data };
    },
  );

  fastify.get(
    "/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "integer" } },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) {
        return (reply as any).status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });
      }
      const { id } = request.params as { id: number };
      const carrier = await getCarrierById(db, id);
      if (!carrier) {
        return reply.status(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `Carrier with id ${id} not found`,
          },
        });
      }
      return { success: true, data: carrier };
    },
  );

  fastify.put(
    "/:id",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "integer" } },
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1 },
            phase: { type: "string", enum: ["phase1", "phase2"] },
            active: { type: "boolean" },
            notes: { type: ["string", "null"] },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) {
        return (reply as any).status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });
      }
      const { id } = request.params as { id: number };
      const carrier = await updateCarrier(db, id, request.body as any);
      if (!carrier) {
        return reply.status(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `Carrier with id ${id} not found`,
          },
        });
      }
      return { success: true, data: carrier };
    },
  );
};

export { carrierRoutes };
