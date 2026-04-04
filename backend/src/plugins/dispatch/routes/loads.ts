import { type FastifyPluginAsync } from "fastify";
import {
  queryLoads,
  getLoadById,
  updateLoad,
} from "../services/loads.service.js";

const loadRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            source: { type: "string", enum: ["propx", "logistiq", "manual"] },
            status: { type: "string" },
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });
      }
      const filters = request.query as any;
      const result = await queryLoads(db, filters);
      return { success: true, data: result.data, meta: result.meta };
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
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });
      }
      const { id } = request.params as { id: number };
      const load = await getLoadById(db, id);
      if (!load) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: `Load with id ${id} not found` },
        });
      }
      return { success: true, data: load };
    },
  );

  // PATCH /:id — update editable load fields (pre-dispatch corrections)
  fastify.patch(
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
            driverName: { type: ["string", "null"] },
            truckNo: { type: ["string", "null"] },
            trailerNo: { type: ["string", "null"] },
            carrierName: { type: ["string", "null"] },
            weightTons: { type: ["string", "null"] },
            netWeightTons: { type: ["string", "null"] },
            bolNo: { type: ["string", "null"] },
            ticketNo: { type: ["string", "null"] },
          },
          additionalProperties: false,
          minProperties: 1,
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });
      }
      const { id } = request.params as { id: number };
      const updates = request.body as Record<string, unknown>;

      const updated = await updateLoad(db, id, updates);
      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: `Load with id ${id} not found` },
        });
      }
      return { success: true, data: updated };
    },
  );
};

export { loadRoutes };
