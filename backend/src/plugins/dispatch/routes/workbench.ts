import { type FastifyPluginAsync } from "fastify";
import { AppError } from "../../../lib/errors.js";

const DB_UNAVAILABLE = {
  success: false,
  error: { code: "SERVICE_UNAVAILABLE", message: "Database not connected" },
};

const HANDLER_STAGE_ENUM = [
  "uncertain",
  "ready_to_build",
  "building",
  "entered",
  "cleared",
] as const;

const WORKBENCH_FILTER_ENUM = [
  "uncertain",
  "ready_to_build",
  "mine",
  "ready_to_clear",
  "entered_today",
  "all",
] as const;

export const workbenchRoutes: FastifyPluginAsync = async (fastify) => {
  // GET / — list workbench rows
  fastify.get(
    "/",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            filter: {
              type: "string",
              enum: [...WORKBENCH_FILTER_ENUM],
              default: "all",
            },
            search: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);

      const { listWorkbenchRows } =
        await import("../services/workbench.service.js");
      const user = request.user as { id: number; name: string };
      const query = request.query as {
        filter?: (typeof WORKBENCH_FILTER_ENUM)[number];
        search?: string;
        limit?: number;
        offset?: number;
      };

      try {
        const result = await listWorkbenchRows(db, {
          filter: query.filter ?? "all",
          userId: user.id,
          search: query.search,
          limit: query.limit,
          offset: query.offset,
        });
        return { success: true, data: result };
      } catch (err) {
        request.log.error({ err }, "workbench list failed");
        return reply.status(500).send({
          success: false,
          error: { code: "INTERNAL", message: "Workbench query failed" },
        });
      }
    },
  );

  // POST /:id/advance — advance handler_stage
  fastify.post(
    "/:id/advance",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "integer" } },
        },
        body: {
          type: "object",
          required: ["stage"],
          properties: {
            stage: { type: "string", enum: [...HANDLER_STAGE_ENUM] },
            notes: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);

      const { advanceStage } = await import("../services/workbench.service.js");
      const { id } = request.params as { id: number };
      const { stage, notes } = request.body as {
        stage: (typeof HANDLER_STAGE_ENUM)[number];
        notes?: string;
      };
      const user = request.user as { id: number; name: string };

      try {
        await advanceStage(db, id, stage, {
          userId: user.id,
          userName: user.name,
          notes,
        });
        return { success: true };
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({
            success: false,
            error: { code: err.code, message: err.message },
          });
        }
        request.log.error({ err }, "workbench op failed");
        return reply.status(500).send({
          success: false,
          error: { code: "INTERNAL", message: "Operation failed" },
        });
      }
    },
  );

  // POST /:id/claim — claim without stage change
  fastify.post(
    "/:id/claim",
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
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);

      const { claimAssignment } =
        await import("../services/workbench.service.js");
      const { id } = request.params as { id: number };
      const user = request.user as { id: number; name: string };

      try {
        await claimAssignment(db, id, user.id);
        return { success: true };
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({
            success: false,
            error: { code: err.code, message: err.message },
          });
        }
        request.log.error({ err }, "workbench op failed");
        return reply.status(500).send({
          success: false,
          error: { code: "INTERNAL", message: "Operation failed" },
        });
      }
    },
  );

  // POST /:id/flag — flag back to uncertain
  fastify.post(
    "/:id/flag",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "integer" } },
        },
        body: {
          type: "object",
          required: ["reason"],
          properties: {
            reason: { type: "string", minLength: 1 },
            notes: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);

      const { flagToUncertain } =
        await import("../services/workbench.service.js");
      const { id } = request.params as { id: number };
      const { reason, notes } = request.body as {
        reason: string;
        notes?: string;
      };
      const user = request.user as { id: number; name: string };

      try {
        await flagToUncertain(db, id, {
          userId: user.id,
          userName: user.name,
          reason,
          notes,
        });
        return { success: true };
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({
            success: false,
            error: { code: err.code, message: err.message },
          });
        }
        request.log.error({ err }, "workbench op failed");
        return reply.status(500).send({
          success: false,
          error: { code: "INTERNAL", message: "Operation failed" },
        });
      }
    },
  );

  // POST /build-duplicate — batch advance to building
  fastify.post(
    "/build-duplicate",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["assignmentIds"],
          properties: {
            assignmentIds: {
              type: "array",
              items: { type: "integer" },
              minItems: 1,
              maxItems: 200,
            },
            notes: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);

      const { advanceStage } = await import("../services/workbench.service.js");
      const { assignmentIds, notes } = request.body as {
        assignmentIds: number[];
        notes?: string;
      };
      const user = request.user as { id: number; name: string };

      const ctx = {
        userId: user.id,
        userName: user.name,
        notes: notes ?? "build+duplicate batch",
      };

      // Sequential execution: each advanceStage opens a transaction with
      // FOR UPDATE. Running 200 in parallel would risk pg pool exhaustion.
      const results: { id: number; ok: boolean; error?: string }[] = [];
      for (const id of assignmentIds) {
        try {
          await advanceStage(db, id, "building", ctx);
          results.push({ id, ok: true });
        } catch (err) {
          const error =
            err instanceof AppError ? err.message : "Operation failed";
          results.push({ id, ok: false, error });
        }
      }

      return { success: true, data: { results } };
    },
  );
};
