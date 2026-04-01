import { type FastifyPluginAsync } from "fastify";
import { PropxClient } from "../services/propx.service.js";
import { syncPropxLoads } from "../services/propx-sync.service.js";

// Process-level concurrency guard for sync operations
let syncInProgress = false;

/**
 * Build a PropxClient from environment variables.
 * Throws if PROPX_API_KEY is not set.
 */
function createPropxClientFromEnv(): PropxClient {
  const apiKey = process.env.PROPX_API_KEY;
  if (!apiKey) {
    throw new Error("PROPX_API_KEY environment variable is required");
  }
  return new PropxClient({
    apiKey,
    baseUrl: process.env.PROPX_BASE_URL,
  });
}

const propxRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── POST /sync/propx — trigger PropX load sync for date range ─────
  fastify.post(
    "/sync/propx",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        querystring: {
          type: "object",
          required: ["from", "to"],
          properties: {
            from: { type: "string", format: "date" },
            to: { type: "string", format: "date" },
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

      const { from, to } = request.query as { from: string; to: string };
      const fromDate = new Date(from);
      const toDate = new Date(to);

      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid date format. Use YYYY-MM-DD.",
          },
        });
      }

      if (fromDate > toDate) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: '"from" date must be before "to" date',
          },
        });
      }

      // In-memory guard to prevent concurrent syncs.
      // pg_try_advisory_xact_lock would release immediately after the SELECT
      // since Drizzle auto-commits. A process-level flag is sufficient for
      // single-instance deployment; upgrade to Redis or session-level pg lock
      // if horizontal scaling is needed.
      if (syncInProgress) {
        return reply.status(409).send({
          success: false,
          error: {
            code: "CONFLICT",
            message: "A PropX sync is already in progress",
          },
        });
      }

      syncInProgress = true;
      try {
        const client = createPropxClientFromEnv();
        const result = await syncPropxLoads(db, client, {
          from: fromDate,
          to: toDate,
        });

        return {
          success: true,
          data: result,
        };
      } finally {
        syncInProgress = false;
      }
    },
  );

  // ─── GET /propx/carriers — cached carrier list ─────────────────────
  fastify.get(
    "/propx/carriers",
    {
      preHandler: [fastify.authenticate],
    },
    async (_request, reply) => {
      const client = createPropxClientFromEnv();
      const data = await client.getCarriers();
      return { success: true, data, meta: { total: data.length } };
    },
  );

  // ─── GET /propx/drivers — cached driver list ───────────────────────
  fastify.get(
    "/propx/drivers",
    {
      preHandler: [fastify.authenticate],
    },
    async (_request, reply) => {
      const client = createPropxClientFromEnv();
      const data = await client.getDrivers();
      return { success: true, data, meta: { total: data.length } };
    },
  );

  // ─── GET /propx/terminals — cached terminal list ───────────────────
  fastify.get(
    "/propx/terminals",
    {
      preHandler: [fastify.authenticate],
    },
    async (_request, reply) => {
      const client = createPropxClientFromEnv();
      const data = await client.getTerminals();
      return { success: true, data, meta: { total: data.length } };
    },
  );

  // ─── GET /propx/destinations — cached destination list ─────────────
  fastify.get(
    "/propx/destinations",
    {
      preHandler: [fastify.authenticate],
    },
    async (_request, reply) => {
      const client = createPropxClientFromEnv();
      const data = await client.getDestinations();
      return { success: true, data, meta: { total: data.length } };
    },
  );

  // ─── GET /propx/products — cached product list ─────────────────────
  fastify.get(
    "/propx/products",
    {
      preHandler: [fastify.authenticate],
    },
    async (_request, reply) => {
      const client = createPropxClientFromEnv();
      const data = await client.getProducts();
      return { success: true, data, meta: { total: data.length } };
    },
  );

  // ─── GET /propx/jobs — jobs with optional status filter ────────────
  fastify.get(
    "/propx/jobs",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { status } = request.query as { status?: string };
      const client = createPropxClientFromEnv();
      const data = await client.getJobs(status ? { status } : undefined);
      return { success: true, data, meta: { total: data.length } };
    },
  );

  // ─── GET /propx/jobs/:id/loads — loads for a specific job ──────────
  fastify.get(
    "/propx/jobs/:id/loads",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const client = createPropxClientFromEnv();
      const data = await client.getJobLoads(id);
      return { success: true, data, meta: { total: data.length } };
    },
  );
};

export default propxRoutes;
