import { type FastifyPluginAsync } from "fastify";
import {
  listWells,
  getWellById,
  createWell,
  updateWell,
  absorbDestination,
} from "../services/wells.service.js";

const wellRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /wells — list all wells
  fastify.get(
    "/",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["active", "standby", "completed", "closed"],
            },
            date: {
              type: "string",
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "array" },
              meta: {
                type: "object",
                properties: { total: { type: "number" } },
              },
            },
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
      const { status, date } = request.query as {
        status?: string;
        date?: string;
      };
      const data = await listWells(db, { status, date });
      return { success: true, data, meta: { total: data.length } };
    },
  );

  // GET /wells/:id — get well by id
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
      const well = await getWellById(db, id);
      if (!well) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: `Well with id ${id} not found` },
        });
      }
      return { success: true, data: well };
    },
  );

  // POST /wells — create well (admin/dispatcher only)
  fastify.post(
    "/",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1 },
            aliases: { type: "array", items: { type: "string" } },
            status: {
              type: "string",
              enum: ["active", "standby", "completed", "closed"],
            },
            dailyTargetLoads: { type: "integer" },
            dailyTargetTons: { type: "string" },
            latitude: { type: "string" },
            longitude: { type: "string" },
            propxJobId: { type: "string" },
            propxDestinationId: { type: "string" },
            needsRateInfo: { type: "boolean" },
            ratePerTon: { type: ["string", "null"] },
            ffcRate: { type: ["string", "null"] },
            fscRate: { type: ["string", "null"] },
            mileageFromLoader: { type: ["string", "null"] },
            customerName: { type: ["string", "null"] },
            carrierId: { type: ["integer", "null"] },
            loaderSandplant: { type: ["string", "null"] },
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
      const well = await createWell(db, request.body as any);
      return reply.status(201).send({ success: true, data: well });
    },
  );

  // PUT /wells/:id — update well (admin/dispatcher only)
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
            aliases: { type: "array", items: { type: "string" } },
            status: {
              type: "string",
              enum: ["active", "standby", "completed", "closed"],
            },
            dailyTargetLoads: { type: "integer" },
            dailyTargetTons: { type: "string" },
            latitude: { type: "string" },
            longitude: { type: "string" },
            propxJobId: { type: "string" },
            propxDestinationId: { type: "string" },
            needsRateInfo: { type: "boolean" },
            ratePerTon: { type: ["string", "null"] },
            ffcRate: { type: ["string", "null"] },
            fscRate: { type: ["string", "null"] },
            mileageFromLoader: { type: ["string", "null"] },
            customerName: { type: ["string", "null"] },
            carrierId: { type: ["integer", "null"] },
            loaderSandplant: { type: ["string", "null"] },
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
      const well = await updateWell(db, id, request.body as any);
      if (!well) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: `Well with id ${id} not found` },
        });
      }
      return { success: true, data: well };
    },
  );

  // POST /wells/:id/absorb-destination — add an alias + re-map orphan loads.
  // ----------------------------------------------------------------------
  // Single-click resolution for orphan_destination discrepancies. When the
  // cross-check sweep surfaces "34 loads point to 'Apache-Formentera-Wrangler'
  // — closest match Liberty Apache Formentera Wrangler (100%)", the dispatcher
  // (or admin agent) calls this endpoint to:
  //   1. Append the destination string to the well's aliases (so future loads
  //      with that destination auto-bind to this well via the matcher).
  //   2. Update existing assignments whose load.destination_name matches AND
  //      whose well_id is currently NULL — pointing them at this well.
  //
  // Idempotent: re-calling with the same destination is a no-op for both
  // alias (case-insensitive de-dup) and remap (only touches null wellIds).
  fastify.post(
    "/:id/absorb-destination",
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
          required: ["destinationName"],
          properties: {
            destinationName: { type: "string", minLength: 1, maxLength: 200 },
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
      const { id } = request.params as { id: number };
      const { destinationName } = request.body as { destinationName: string };
      const result = await absorbDestination(db, id, destinationName);
      if (!result.wellExists) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: `Well ${id} not found` },
        });
      }
      return { success: true, data: result };
    },
  );
};

export { wellRoutes };
