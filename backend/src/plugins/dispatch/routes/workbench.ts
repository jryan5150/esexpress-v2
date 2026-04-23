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
  "not_in_pcs",
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
            sortBy: {
              type: "string",
              enum: ["stage_changed_at", "delivered_on"],
            },
            sortDir: { type: "string", enum: ["asc", "desc"] },
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
        sortBy?: "stage_changed_at" | "delivered_on";
        sortDir?: "asc" | "desc";
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
          sortBy: query.sortBy,
          sortDir: query.sortDir,
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

  // GET /:id/photos — all photo URLs for the drawer's prev/next carousel.
  // Pulled on-demand (not in the list response) to keep the list query fast.
  // Merges assignment-scoped, load-scoped, and historical bol_submissions
  // sources, deduplicated. Signed via the same photoSign helper the list
  // uses so cross-origin JotForm/GCS photos remain proxyable.
  fastify.get(
    "/:id/photos",
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
      const { listAssignmentPhotos } =
        await import("../services/workbench.service.js");
      const { id } = request.params as { id: number };
      try {
        const urls = await listAssignmentPhotos(db, id);
        return { success: true, data: urls };
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({
            success: false,
            error: { code: err.code, message: err.message },
          });
        }
        request.log.error({ err }, "list assignment photos failed");
        return reply.status(500).send({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to load photos" },
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

  // PATCH /:id/pcs-number — set PCS load number (manual entry while OAuth
  // isn't live). Jodi's payroll report joins on this. Replaces blank input
  // with null so the column correctly treats absence vs "". Once bi-di
  // OAuth lands this endpoint stays but the UI field becomes read-only.
  fastify.patch(
    "/:id/pcs-number",
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
          required: ["pcsNumber"],
          properties: {
            pcsNumber: { type: ["string", "null"] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);
      const { id } = request.params as { id: number };
      const { pcsNumber } = request.body as { pcsNumber: string | null };
      const { assignments } = await import("../../../db/schema.js");
      const { eq } = await import("drizzle-orm");
      const clean =
        pcsNumber && pcsNumber.trim().length > 0 ? pcsNumber.trim() : null;
      const [updated] = await db
        .update(assignments)
        .set({ pcsNumber: clean, updatedAt: new Date() })
        .where(eq(assignments.id, id))
        .returning({ id: assignments.id, pcsNumber: assignments.pcsNumber });
      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: `Assignment ${id} not found` },
        });
      }
      return { success: true, data: updated };
    },
  );

  // PATCH /:id/notes — set free-form dispatcher notes on an assignment.
  // Surfaced in the drawer's Notes section so Jessica can leave a reason,
  // a follow-up hint, or context for the next handler (Steph, Katie) to see.
  fastify.patch(
    "/:id/notes",
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
          required: ["notes"],
          properties: {
            notes: { type: ["string", "null"], maxLength: 2000 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);
      const { id } = request.params as { id: number };
      const { notes } = request.body as { notes: string | null };
      const { assignments } = await import("../../../db/schema.js");
      const { eq } = await import("drizzle-orm");
      const clean = notes && notes.trim().length > 0 ? notes.trim() : null;
      const [updated] = await db
        .update(assignments)
        .set({ notes: clean, updatedAt: new Date() })
        .where(eq(assignments.id, id))
        .returning({ id: assignments.id, notes: assignments.notes });
      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: `Assignment ${id} not found` },
        });
      }
      return { success: true, data: updated };
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
              request.log.warn({ err }, "recordDecision failed (bulk_confirm)"),
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

  // POST /:id/rerun-ocr — re-run Claude Vision extraction on the latest
  // BOL submission for this assignment's load. Available to any dispatcher
  // (not admin-gated, per 2026-04-22: "I want the OCR for everyone").
  // Use cases: OCR extracted wrong BOL#/weight, photo orientation fixed
  // after initial pass, driver uploaded better photo, initial confidence
  // was low. Resets retryCount so the MAX_RETRY guard doesn't block.
  fastify.post(
    "/:id/rerun-ocr",
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
      const { id: assignmentId } = request.params as { id: number };
      try {
        const { eq, sql: drizzleSql } = await import("drizzle-orm");
        const { assignments, bolSubmissions } =
          await import("../../../db/schema.js");

        // Find assignment's load
        const [row] = await db
          .select({ loadId: assignments.loadId })
          .from(assignments)
          .where(eq(assignments.id, assignmentId))
          .limit(1);
        if (!row?.loadId) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NO_LOAD",
              message: "Assignment has no linked load to re-OCR.",
            },
          });
        }

        // Find latest bol_submission matched to this load
        const [submission] = await db
          .select({ id: bolSubmissions.id })
          .from(bolSubmissions)
          .where(eq(bolSubmissions.matchedLoadId, row.loadId))
          .orderBy(drizzleSql`${bolSubmissions.id} DESC`)
          .limit(1);

        if (!submission) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NO_BOL_SUBMISSION",
              message:
                "No BOL submission exists for this load yet. Ensure a JotForm photo is attached first.",
            },
          });
        }

        // Reset retryCount so the MAX_RETRY guard allows re-extraction
        await db
          .update(bolSubmissions)
          .set({ retryCount: 0 })
          .where(eq(bolSubmissions.id, submission.id));

        const { processSubmission } =
          await import("../../verification/services/bol-extraction.service.js");
        const result = await processSubmission(db, submission.id);

        return {
          success: true,
          data: {
            submissionId: submission.id,
            extraction: result.extraction,
            validation: result.validation,
          },
        };
      } catch (err) {
        request.log.error({ err }, "rerun-ocr failed");
        return reply.status(500).send({
          success: false,
          error: {
            code: "RERUN_OCR_FAILED",
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
    },
  );

  // POST /:id/run-photo-check — force JotForm sync small-window, return
  // quickly so the drawer's "Run Check" button feels instant. Used to
  // avoid the 30-min cron wait when driver says "I just uploaded."
  // Available to any authenticated dispatcher (not admin-gated) so Scout
  // or Steph can self-serve without escalating.
  fastify.post(
    "/:id/run-photo-check",
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
      try {
        const apiKey = process.env.JOTFORM_API_KEY;
        if (!apiKey) {
          return reply.status(503).send({
            success: false,
            error: {
              code: "JOTFORM_NOT_CONFIGURED",
              message: "JotForm API key not set — ask admin to configure.",
            },
          });
        }
        const { syncWeightTickets } =
          await import("../../verification/services/jotform.service.js");
        // Small window so the button feels fast. 50 recent submissions
        // cover ~2 hours of driver uploads at typical rate.
        const result = await syncWeightTickets(
          db,
          {
            apiKey,
            formId: process.env.JOTFORM_FORM_ID,
            baseUrl: process.env.JOTFORM_BASE_URL,
          },
          { limit: 50, offset: 0 },
        );
        return {
          success: true,
          data: {
            fetched: result.fetched ?? 0,
            matched: result.matched ?? 0,
            stored: result.stored ?? 0,
          },
        };
      } catch (err) {
        request.log.error({ err }, "run-photo-check failed");
        return reply.status(500).send({
          success: false,
          error: {
            code: "RUN_PHOTO_CHECK_FAILED",
            message: err instanceof Error ? err.message : String(err),
          },
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
