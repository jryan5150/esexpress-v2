import { type FastifyPluginAsync } from "fastify";
import {
  PCS_DISPATCH_ENABLED,
  postStatus,
  sendDispatchMessage,
  clearRoutes,
  healthCheck,
  diagnostics,
} from "../services/pcs-soap.service.js";
import { dispatchLoad } from "../services/pcs-rest.service.js";
import { buildDispatchPackage } from "../lib/dispatch-package.js";
import { NotFoundError } from "../../../lib/errors.js";
import { assignments, loads, wells } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";
import { eq, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch assignment + load + well for dispatch-preview.
 * Extracted to avoid duplicating the join logic from the service layer
 * (buildDispatchPackage is a pure function, so we do the DB fetch here).
 */
async function fetchPreviewData(db: Database, assignmentId: number) {
  const rows = await db
    .select({
      assignmentId: assignments.id,
      assignmentStatus: assignments.status,
      loadNo: loads.loadNo,
      driverName: loads.driverName,
      truckNo: loads.truckNo,
      trailerNo: loads.trailerNo,
      originName: loads.originName,
      destinationName: loads.destinationName,
      productDescription: loads.productDescription,
      weightTons: loads.weightTons,
      wellName: wells.name,
    })
    .from(assignments)
    .innerJoin(loads, eq(assignments.loadId, loads.id))
    .innerJoin(wells, eq(assignments.wellId, wells.id))
    .where(eq(assignments.id, assignmentId))
    .limit(1);

  if (rows.length === 0) {
    throw new NotFoundError("Assignment", assignmentId);
  }

  const row = rows[0];
  return {
    assignment: { id: row.assignmentId, status: row.assignmentStatus },
    load: {
      loadNo: row.loadNo,
      driverName: row.driverName,
      truckNo: row.truckNo,
      trailerNo: row.trailerNo,
      originName: row.originName,
      destinationName: row.destinationName,
      productDescription: row.productDescription,
      weightTons: row.weightTons,
    },
    well: { name: row.wellName },
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const pcsRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── POST /dispatch-preview — dry-run dispatch package ─────────────
  fastify.post(
    "/dispatch-preview",
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
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });
      }

      const { assignmentId } = request.body as { assignmentId: number };
      const { assignment, load, well } = await fetchPreviewData(
        db,
        assignmentId,
      );
      const pkg = buildDispatchPackage(assignment, load, well);

      return {
        success: true,
        data: {
          dispatchPackage: pkg,
          dispatchEnabled: PCS_DISPATCH_ENABLED,
        },
      };
    },
  );

  // ─── POST /dispatch — live dispatch to PCS ────────────────────────
  fastify.post(
    "/dispatch",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
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
      if (!PCS_DISPATCH_ENABLED) {
        return reply.status(403).send({
          success: false,
          error: {
            code: "PCS_DISPATCH_DISABLED",
            message:
              "PCS dispatch is disabled. Set PCS_DISPATCH_ENABLED=true to enable.",
          },
        });
      }

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

      const { assignmentId } = request.body as { assignmentId: number };
      const result = await dispatchLoad(db, assignmentId);

      return {
        success: result.success,
        data: result,
      };
    },
  );

  // ─── POST /status — push status update to PCS ────────────────────
  fastify.post(
    "/status",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          required: ["assignmentId", "status"],
          properties: {
            assignmentId: { type: "integer" },
            status: { type: "string" },
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

      const { assignmentId, status } = request.body as {
        assignmentId: number;
        status: string;
      };
      await postStatus(db, assignmentId, status);

      return {
        success: true,
        data: { assignmentId, status, pushedAt: new Date().toISOString() },
      };
    },
  );

  // ─── GET /status/:assignmentId — get PCS status for assignment ────
  fastify.get(
    "/status/:assignmentId",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
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
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });
      }

      const { assignmentId } = request.params as { assignmentId: number };

      const [row] = await db
        .select({
          id: assignments.id,
          status: assignments.status,
          pcsDispatch: assignments.pcsDispatch,
        })
        .from(assignments)
        .where(eq(assignments.id, assignmentId))
        .limit(1);

      if (!row) {
        throw new NotFoundError("Assignment", assignmentId);
      }

      return {
        success: true,
        data: {
          assignmentId: row.id,
          internalStatus: row.status,
          pcsDispatch: row.pcsDispatch,
        },
      };
    },
  );

  // ─── POST /sync-status — bulk status sync ─────────────────────────
  fastify.post(
    "/sync-status",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          required: ["assignmentIds"],
          properties: {
            assignmentIds: {
              type: "array",
              items: { type: "integer" },
              minItems: 1,
              maxItems: 100,
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

      const { assignmentIds } = request.body as { assignmentIds: number[] };

      // Fetch current PCS dispatch data for all requested assignments
      const rows = await db
        .select({
          id: assignments.id,
          status: assignments.status,
          pcsDispatch: assignments.pcsDispatch,
        })
        .from(assignments)
        .where(inArray(assignments.id, assignmentIds));

      // For bulk sync, gather all matching assignments
      // Note: actual PCS status sync (pulling from PCS) is a future feature
      // (blocked on unknown SOAP method per CLAUDE.md). For now, this returns
      // the locally-tracked PCS dispatch info for the requested assignments.
      const results = rows.map((row) => ({
        assignmentId: row.id,
        internalStatus: row.status,
        pcsDispatch: row.pcsDispatch,
      }));

      return {
        success: true,
        data: {
          synced: results,
          total: results.length,
          requestedCount: assignmentIds.length,
        },
      };
    },
  );

  // ─── POST /clear-routes — undo dispatch (clear PCS routes) ───────
  fastify.post(
    "/clear-routes",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          required: ["loadId", "dispatchId"],
          properties: {
            loadId: { type: "integer" },
            dispatchId: { type: "string" },
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

      const { loadId, dispatchId } = request.body as {
        loadId: number;
        dispatchId: string;
      };
      await clearRoutes(db, loadId, dispatchId);

      return {
        success: true,
        data: { loadId, dispatchId, clearedAt: new Date().toISOString() },
      };
    },
  );

  // ─── GET /health — PCS connectivity check ─────────────────────────
  fastify.get("/health", async (_request, _reply) => {
    const result = await healthCheck();
    const diag = diagnostics();

    return {
      success: true,
      data: {
        pcsOnline: result.online,
        circuitBreaker: diag.status,
        dispatchEnabled: PCS_DISPATCH_ENABLED,
        checkedAt: new Date().toISOString(),
      },
    };
  });

  // ─── POST /sync-loads — pull PCS load list + reconcile onto v2 ────
  // Reads PCS GetLoads for the configured division and updates
  // assignments.pcsSequence + pcsDispatch with the PCS state. Returns a
  // summary including "missed by v2" (PCS loads with no v2 match) so we
  // can surface ingest gaps without needing Jessica's reconciliation sheet.
  //
  // Admin-only for now. Can be cron'd later.
  fastify.post(
    "/sync-loads",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
      schema: {
        body: {
          type: "object",
          properties: {
            sinceDays: { type: "integer", minimum: 1, maximum: 90 },
            companyLetter: { type: "string", minLength: 1, maxLength: 1 },
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
      const { syncPcsLoads } = await import("../services/pcs-sync.service.js");
      const body = (request.body ?? {}) as {
        sinceDays?: number;
        companyLetter?: string;
      };
      const fromDate = new Date(
        Date.now() - (body.sinceDays ?? 7) * 24 * 60 * 60 * 1000,
      );
      try {
        const result = await syncPcsLoads(db, {
          fromDate,
          companyLetter: body.companyLetter,
        });
        return { success: true, data: result };
      } catch (err) {
        request.log.error({ err }, "pcs sync failed");
        return reply.status(500).send({
          success: false,
          error: {
            code: "PCS_SYNC_ERROR",
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
    },
  );

  // ─── POST /send-dispatch-message — driver notification via PCS ────
  fastify.post(
    "/send-dispatch-message",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          required: ["assignmentId", "message"],
          properties: {
            assignmentId: { type: "integer" },
            message: { type: "string", minLength: 1, maxLength: 2000 },
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

      const { assignmentId, message } = request.body as {
        assignmentId: number;
        message: string;
      };
      await sendDispatchMessage(db, assignmentId, message);

      return {
        success: true,
        data: {
          assignmentId,
          sentAt: new Date().toISOString(),
        },
      };
    },
  );

  // ─── GET /session-status — auth/session health check ──────────────
  fastify.get(
    "/session-status",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const diag = diagnostics();
      const companyIdCheck = diag.checks.find(
        (c) => c.name === "pcs-company-id",
      );
      const accessKeyCheck = diag.checks.find(
        (c) => c.name === "pcs-access-key",
      );

      return {
        success: true,
        data: {
          dispatchEnabled: PCS_DISPATCH_ENABLED,
          credentialsConfigured:
            (companyIdCheck?.ok ?? false) && (accessKeyCheck?.ok ?? false),
          circuitBreaker: diag.status,
          checks: diag.checks,
        },
      };
    },
  );
};

export default pcsRoutes;
