import { type FastifyPluginAsync } from "fastify";
import {
  queryLoads,
  getLoadById,
  updateLoad,
  createLoad,
  duplicateLoad,
} from "../services/loads.service.js";
import { AppError } from "../../../lib/errors.js";

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
            era: { type: "string", enum: ["live", "archive"] },
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
            rate: { type: ["string", "null"] },
            mileage: { type: ["string", "null"] },
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

  // POST /bulk-update — apply the same field updates to multiple loads at once
  fastify.post(
    "/bulk-update",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          required: ["loadIds", "updates"],
          properties: {
            loadIds: {
              type: "array",
              items: { type: "integer" },
              minItems: 1,
              maxItems: 200,
            },
            updates: {
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
                rate: { type: ["string", "null"] },
                mileage: { type: ["string", "null"] },
                deliveredOn: {
                  type: ["string", "null"],
                  pattern: "^\\d{4}-\\d{2}-\\d{2}",
                },
              },
              additionalProperties: false,
              minProperties: 1,
            },
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
      const { loadIds, updates } = request.body as {
        loadIds: number[];
        updates: Record<string, unknown>;
      };
      const results = await db.transaction(async (tx) => {
        return Promise.all(
          loadIds.map((id) =>
            updateLoad(tx, id, updates).then(
              (data) => ({ loadId: id, success: !!data }),
              () => ({ loadId: id, success: false }),
            ),
          ),
        );
      });
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

  // POST / — create a manual load with auto-assignment
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
          required: ["loadNo", "wellId"],
          properties: {
            loadNo: { type: "string", minLength: 1 },
            wellId: { type: "integer" },
            driverName: { type: ["string", "null"] },
            truckNo: { type: ["string", "null"] },
            trailerNo: { type: ["string", "null"] },
            carrierName: { type: ["string", "null"] },
            productDescription: { type: ["string", "null"] },
            originName: { type: ["string", "null"] },
            destinationName: { type: ["string", "null"] },
            weightTons: { type: ["string", "null"] },
            netWeightTons: { type: ["string", "null"] },
            bolNo: { type: ["string", "null"] },
            ticketNo: { type: ["string", "null"] },
            rate: { type: ["string", "null"] },
            mileage: { type: ["string", "null"] },
            deliveredOn: {
              type: ["string", "null"],
              pattern: "^\\d{4}-\\d{2}-\\d{2}",
            },
          },
          additionalProperties: false,
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
      const user = request.user as { id: number };
      try {
        const result = await createLoad(db, request.body as any, user.id);
        return reply.status(201).send({ success: true, data: result });
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

  // POST /:id/duplicate — clone a load N times with optional date offset
  fastify.post(
    "/:id/duplicate",
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
          required: ["count"],
          properties: {
            count: { type: "integer", minimum: 1, maximum: 100 },
            dateOffset: { type: "integer", default: 0 },
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
      const { count, dateOffset } = request.body as {
        count: number;
        dateOffset?: number;
      };
      const user = request.user as { id: number };

      const results = await duplicateLoad(
        db,
        id,
        { count, dateOffset },
        user.id,
      );
      if (!results) {
        return reply.status(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `Load with id ${id} not found or has no assignment`,
          },
        });
      }
      return reply.status(201).send({
        success: true,
        data: results,
        meta: { created: results.length },
      });
    },
  );
};

export { loadRoutes };
