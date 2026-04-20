import { type FastifyPluginAsync } from "fastify";
import { AppError } from "../../../lib/errors.js";
import {
  recordDecision,
  snapshotAssignmentScore,
  type DecisionAction,
} from "../services/match-decisions.service.js";

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
  "missing_ticket",
  "missing_driver",
  "needs_rate",
  "built_today",
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
            // Date range filter on loads.delivered_on — ISO YYYY-MM-DD.
            // Both inclusive; Chicago-local interpretation on the service side.
            dateFrom: { type: "string", format: "date" },
            dateTo: { type: "string", format: "date" },
            // Truck filter — substring match on loads.truck_no.
            truckNo: { type: "string", maxLength: 40 },
            // Well filter — exact well id or substring on wells.name.
            wellId: { type: "integer", minimum: 1 },
            wellName: { type: "string", maxLength: 200 },
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
        dateFrom?: string;
        dateTo?: string;
        truckNo?: string;
        wellId?: number;
        wellName?: string;
        limit?: number;
        offset?: number;
      };

      try {
        const result = await listWorkbenchRows(db, {
          filter: query.filter ?? "all",
          userId: user.id,
          search: query.search,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          truckNo: query.truckNo,
          wellId: query.wellId,
          wellName: query.wellName,
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

      const snapshot = await snapshotAssignmentScore(db, id).catch(() => null);

      try {
        await advanceStage(db, id, stage, {
          userId: user.id,
          userName: user.name,
          notes,
        });
        if (snapshot) {
          recordDecision(db, {
            assignmentId: id,
            action: `advance:${stage}` as DecisionAction,
            userId: user.id,
            notes,
            featuresBefore: snapshot.features,
            scoreBefore: snapshot.score,
          }).catch((err) =>
            request.log.warn({ err }, "recordDecision failed (advance)"),
          );
        }
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

      const snapshot = await snapshotAssignmentScore(db, id).catch(() => null);

      try {
        await flagToUncertain(db, id, {
          userId: user.id,
          userName: user.name,
          reason,
          notes,
        });
        if (snapshot) {
          recordDecision(db, {
            assignmentId: id,
            action: "flag_back",
            userId: user.id,
            notes: `flag_back:${reason}${notes ? ` — ${notes}` : ""}`,
            featuresBefore: snapshot.features,
            scoreBefore: snapshot.score,
          }).catch((err) =>
            request.log.warn({ err }, "recordDecision failed (flag)"),
          );
        }
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

  // POST /:id/route — granular Resolve actions for an uncertain row.
  // action=confirm        → clears reasons + advances to ready_to_build
  // action=needs_rate     → re-tags with rate_missing, stays uncertain
  // action=missing_ticket → re-tags with missing_tickets
  // action=missing_driver → re-tags with missing_driver
  // action=flag_other     → clears reason tags, holds context in notes
  fastify.post(
    "/:id/route",
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
          required: ["action"],
          properties: {
            action: {
              type: "string",
              enum: [
                "confirm",
                "needs_rate",
                "missing_ticket",
                "missing_driver",
                "flag_other",
              ],
            },
            notes: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);

      const { routeUncertain } =
        await import("../services/workbench.service.js");
      const { id } = request.params as { id: number };
      const { action, notes } = request.body as {
        action:
          | "confirm"
          | "needs_rate"
          | "missing_ticket"
          | "missing_driver"
          | "flag_other";
        notes?: string;
      };
      const user = request.user as { id: number; name: string };

      const snapshot = await snapshotAssignmentScore(db, id).catch(() => null);

      try {
        await routeUncertain(db, id, action, {
          userId: user.id,
          userName: user.name,
          notes,
        });
        if (snapshot) {
          recordDecision(db, {
            assignmentId: id,
            action: `route:${action}` as DecisionAction,
            userId: user.id,
            notes,
            featuresBefore: snapshot.features,
            scoreBefore: snapshot.score,
          }).catch((err) =>
            request.log.warn({ err }, "recordDecision failed (route)"),
          );
        }
        return { success: true };
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({
            success: false,
            error: { code: err.code, message: err.message },
          });
        }
        request.log.error({ err }, "workbench route failed");
        return reply.status(500).send({
          success: false,
          error: { code: "INTERNAL", message: "Operation failed" },
        });
      }
    },
  );

  // POST /bulk-confirm — batch advance from uncertain → ready_to_build.
  // Mirror of /build-duplicate but for the validation gate step. The state
  // machine's allowedTransition blocks uncertain→ready_to_build when the
  // row still has open uncertain_reasons, so rows with triggers fail
  // individually in the results list without blocking the rest.
  fastify.post(
    "/bulk-confirm",
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
        notes: notes ?? "bulk-confirm batch",
      };

      const results: { id: number; ok: boolean; error?: string }[] = [];
      for (const id of assignmentIds) {
        const snapshot = await snapshotAssignmentScore(db, id).catch(
          () => null,
        );
        try {
          await advanceStage(db, id, "ready_to_build", ctx);
          results.push({ id, ok: true });
          if (snapshot) {
            recordDecision(db, {
              assignmentId: id,
              action: "bulk_confirm",
              userId: user.id,
              notes: ctx.notes,
              featuresBefore: snapshot.features,
              scoreBefore: snapshot.score,
            }).catch((err) =>
              request.log.warn(
                { err },
                "recordDecision failed (bulk_confirm)",
              ),
            );
          }
        } catch (err) {
          const error =
            err instanceof AppError ? err.message : "Operation failed";
          results.push({ id, ok: false, error });
        }
      }
      return { success: true, data: { results } };
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
