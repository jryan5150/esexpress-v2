/**
 * Photo backfill admin endpoints.
 *
 * Three sibling endpoints — each phase invocable independently:
 *
 *   POST /photo-backfill/refs           Phase 1: insert missing photos rows
 *   POST /photo-backfill/gcs/start      Phase 2: kick off long-running upload
 *   GET  /photo-backfill/gcs/status     Phase 2: monitor progress
 *   POST /photo-backfill/gcs/stop       Phase 2: cancel mid-flight
 *   POST /photo-backfill/photo-status   Phase 3: flip assignment.photo_status
 *
 * All admin-gated. Phase 1 + 3 run synchronously and return counts.
 * Phase 2 fires async with bounded concurrency and reports via status.
 */
import { type FastifyPluginAsync } from "fastify";
import {
  backfillPropxPhotoRefs,
  backfillAssignmentPhotoStatus,
  startGcsBackfillJob,
  getGcsBackfillJob,
  stopGcsBackfillJob,
} from "../services/photo-backfill.service.js";

const DEFAULT_FROM = "2026-01-01";

const photoBackfillRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── Phase 1 ───
  fastify.post(
    "/refs",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
      schema: {
        body: {
          type: "object",
          properties: {
            fromDate: { type: "string", format: "date" },
            toDate: { type: "string", format: "date" },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "DB not connected" },
        });
      }
      const body = (request.body ?? {}) as {
        fromDate?: string;
        toDate?: string;
      };
      const fromDate = new Date(body.fromDate ?? DEFAULT_FROM);
      const toDate = body.toDate ? new Date(body.toDate) : new Date();
      const result = await backfillPropxPhotoRefs(db, fromDate, toDate);
      return { success: true, data: result };
    },
  );

  // ─── Phase 2: start ───
  fastify.post(
    "/gcs/start",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
      schema: {
        body: {
          type: "object",
          properties: {
            fromDate: { type: "string", format: "date" },
            toDate: { type: "string", format: "date" },
            concurrency: { type: "integer", minimum: 1, maximum: 8 },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "DB not connected" },
        });
      }
      const body = (request.body ?? {}) as {
        fromDate?: string;
        toDate?: string;
        concurrency?: number;
      };
      const existing = getGcsBackfillJob();
      if (existing && existing.status === "running") {
        return reply.status(409).send({
          success: false,
          error: { code: "CONFLICT", message: "Backfill already running" },
          data: existing,
        });
      }
      const fromDate = new Date(body.fromDate ?? DEFAULT_FROM);
      const toDate = body.toDate ? new Date(body.toDate) : new Date();
      const job = startGcsBackfillJob({
        db,
        fromDate,
        toDate,
        concurrency: body.concurrency,
      });
      return reply.status(202).send({ success: true, data: job });
    },
  );

  // ─── Phase 2: status ───
  fastify.get(
    "/gcs/status",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
    },
    async () => {
      return {
        success: true,
        data: getGcsBackfillJob() ?? { status: "idle" },
      };
    },
  );

  // ─── Phase 2: stop ───
  fastify.post(
    "/gcs/stop",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
    },
    async () => {
      const stopped = stopGcsBackfillJob();
      return {
        success: true,
        data: { stopped, job: getGcsBackfillJob() ?? null },
      };
    },
  );

  // ─── Phase 3 ───
  fastify.post(
    "/photo-status",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
    },
    async (_request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "DB not connected" },
        });
      }
      const result = await backfillAssignmentPhotoStatus(db);
      return { success: true, data: result };
    },
  );
};

export { photoBackfillRoutes };
