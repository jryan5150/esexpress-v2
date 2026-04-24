/**
 * BOL Routes -- Track 6.3
 * ========================
 *
 * 12 routes in one file: 6 driver-facing + 6 operations/admin.
 *
 * Driver-facing routes (authenticated):
 *   POST /bol/submit                 Upload photos + trigger AI extraction
 *   GET  /bol/submissions            List submissions (filterable by status, driver)
 *   GET  /bol/submissions/:id        Submission detail with extraction data
 *   PUT  /bol/submissions/:id        Confirm/correct extracted data
 *   POST /bol/submissions/:id/retry  Retry AI extraction (respects MAX_RETRY_COUNT)
 *   GET  /bol/driver-stats/:driverId Driver submission stats
 *
 * Operations/Admin routes (admin/dispatcher):
 *   GET  /bol/operations/queue            Unified reconciliation queue
 *   POST /bol/operations/reconcile/:id    Mark load reconciled
 *   GET  /bol/operations/discrepancies    Loads with discrepancies
 *   POST /bol/operations/auto-match       Run auto-matching batch
 *   POST /bol/operations/manual-match     Manual match BOL to load
 *   GET  /bol/operations/stats            Operations dashboard stats
 */

import { type FastifyPluginAsync } from "fastify";
import multipart from "@fastify/multipart";
import { eq, and, isNull, count } from "drizzle-orm";
import { bolSubmissions } from "../../../db/schema.js";
import {
  processSubmission,
  MAX_RETRY_COUNT,
} from "../services/bol-extraction.service.js";
import {
  batchAutoMatch,
  manualMatch,
  getReconciliationQueue,
  getReconciliationStats,
} from "../services/reconciliation.service.js";

const bolRoutes: FastifyPluginAsync = async (fastify) => {
  // Register multipart support for photo uploads within this plugin scope
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB per file
      files: 10, // max 10 photos per submission
    },
  });

  // ─── DRIVER-FACING ROUTES ────────────────────────────────────────

  // ─── POST /bol/submit -- Upload photos + trigger AI extraction ───
  fastify.post(
    "/bol/submit",
    {
      preHandler: [fastify.authenticate],
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

      // Parse multipart form data
      const parts = request.parts();
      const photoUrls: Array<{
        url: string;
        cloudinaryId: string;
        filename: string;
      }> = [];
      let driverId: string | null = null;
      let driverName: string | null = null;
      let loadNumber: string | null = null;

      for await (const part of parts) {
        if (part.type === "file") {
          // In production, upload to Cloudinary/S3 and store URL.
          // For now, convert to base64 data URL for extraction.
          const buffer = await part.toBuffer();
          const base64 = buffer.toString("base64");
          const mimeType = part.mimetype || "image/jpeg";
          const dataUrl = `data:${mimeType};base64,${base64}`;
          photoUrls.push({
            url: dataUrl,
            cloudinaryId: "",
            filename: part.filename || "photo.jpg",
          });
        } else {
          // Text fields
          const value = part.value as string;
          if (part.fieldname === "driverId") driverId = value;
          else if (part.fieldname === "driverName") driverName = value;
          else if (part.fieldname === "loadNumber") loadNumber = value;
        }
      }

      if (photoUrls.length === 0) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "At least one photo is required",
          },
        });
      }

      // Create BOL submission row
      const [submission] = await db
        .insert(bolSubmissions)
        .values({
          driverId,
          driverName,
          loadNumber,
          photos: photoUrls,
          status: "pending",
          retryCount: 0,
        })
        .returning({ id: bolSubmissions.id });

      // Trigger async extraction (fire and forget -- don't block the response)
      processSubmission(db, submission.id).catch((err) => {
        fastify.log.error(
          { submissionId: submission.id, err },
          "Background BOL extraction failed",
        );
      });

      return reply.status(201).send({
        success: true,
        data: {
          submissionId: submission.id,
          status: "pending",
          photoCount: photoUrls.length,
        },
      });
    },
  );

  // ─── GET /bol/submissions -- List submissions ─────────────────────
  fastify.get(
    "/bol/submissions",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: { type: "string" },
            driverId: { type: "string" },
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
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

      const { status, driverId, page, limit } = request.query as {
        status?: string;
        driverId?: string;
        page?: number;
        limit?: number;
      };

      const pageNum = page ?? 1;
      const pageSize = limit ?? 20;
      const offset = (pageNum - 1) * pageSize;

      // Build WHERE conditions
      const conditions = [];
      if (status)
        conditions.push(
          eq(
            bolSubmissions.status,
            status as unknown as typeof bolSubmissions.status._.data,
          ),
        );
      if (driverId) conditions.push(eq(bolSubmissions.driverId, driverId));

      let query = db
        .select({
          id: bolSubmissions.id,
          driverId: bolSubmissions.driverId,
          driverName: bolSubmissions.driverName,
          loadNumber: bolSubmissions.loadNumber,
          status: bolSubmissions.status,
          aiConfidence: bolSubmissions.aiConfidence,
          matchedLoadId: bolSubmissions.matchedLoadId,
          matchMethod: bolSubmissions.matchMethod,
          createdAt: bolSubmissions.createdAt,
        })
        .from(bolSubmissions)
        .limit(pageSize)
        .offset(offset)
        .orderBy(bolSubmissions.createdAt);

      if (conditions.length === 1) {
        query = query.where(conditions[0]) as typeof query;
      } else if (conditions.length > 1) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const rows = await query;

      // Get total count
      let countQuery = db.select({ total: count() }).from(bolSubmissions);
      if (conditions.length === 1) {
        countQuery = countQuery.where(conditions[0]) as typeof countQuery;
      } else if (conditions.length > 1) {
        countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
      }
      const [totals] = await countQuery;

      return {
        success: true,
        data: rows,
        meta: {
          total: totals?.total ?? 0,
          page: pageNum,
          limit: pageSize,
        },
      };
    },
  );

  // ─── GET /bol/submissions/:id -- Submission detail ────────────────
  fastify.get(
    "/bol/submissions/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "integer" },
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

      const [submission] = await db
        .select()
        .from(bolSubmissions)
        .where(eq(bolSubmissions.id, id))
        .limit(1);

      if (!submission) {
        return reply.status(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `BOL submission ${id} not found`,
          },
        });
      }

      return {
        success: true,
        data: submission,
      };
    },
  );

  // ─── PUT /bol/submissions/:id -- Confirm/correct extracted data ───
  fastify.put(
    "/bol/submissions/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "integer" },
          },
        },
        body: {
          type: "object",
          required: ["corrections"],
          properties: {
            corrections: { type: "object" },
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
      const { corrections } = request.body as {
        corrections: Record<string, unknown>;
      };

      // Verify submission exists
      const [submission] = await db
        .select()
        .from(bolSubmissions)
        .where(eq(bolSubmissions.id, id))
        .limit(1);

      if (!submission) {
        return reply.status(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `BOL submission ${id} not found`,
          },
        });
      }

      await db
        .update(bolSubmissions)
        .set({
          driverCorrections: corrections,
          driverConfirmedAt: new Date(),
          status: "confirmed",
        })
        .where(eq(bolSubmissions.id, id));

      return {
        success: true,
        data: {
          id,
          status: "confirmed",
          driverConfirmedAt: new Date().toISOString(),
        },
      };
    },
  );

  // ─── POST /bol/submissions/:id/retry -- Retry AI extraction ──────
  fastify.post(
    "/bol/submissions/:id/retry",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "integer" },
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

      // Load submission to check retry count
      const [submission] = await db
        .select()
        .from(bolSubmissions)
        .where(eq(bolSubmissions.id, id))
        .limit(1);

      if (!submission) {
        return reply.status(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `BOL submission ${id} not found`,
          },
        });
      }

      const currentRetries = submission.retryCount ?? 0;
      if (currentRetries >= MAX_RETRY_COUNT) {
        return reply.status(409).send({
          success: false,
          error: {
            code: "MAX_RETRIES_EXCEEDED",
            message: `Submission ${id} has reached the maximum retry count (${MAX_RETRY_COUNT})`,
          },
        });
      }

      // Trigger re-extraction (fire and forget)
      processSubmission(db, id).catch((err) => {
        fastify.log.error(
          { submissionId: id, err },
          "Background BOL re-extraction failed",
        );
      });

      return {
        success: true,
        data: {
          id,
          retryCount: currentRetries + 1,
          maxRetries: MAX_RETRY_COUNT,
          status: "extracting",
        },
      };
    },
  );

  // ─── GET /bol/driver-stats/:driverId -- Driver submission stats ───
  fastify.get(
    "/bol/driver-stats/:driverId",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["driverId"],
          properties: {
            driverId: { type: "string" },
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

      const { driverId } = request.params as { driverId: string };

      const [totals] = await db
        .select({ total: count() })
        .from(bolSubmissions)
        .where(eq(bolSubmissions.driverId, driverId));

      const statusCounts = await db
        .select({
          status: bolSubmissions.status,
          count: count(),
        })
        .from(bolSubmissions)
        .where(eq(bolSubmissions.driverId, driverId))
        .groupBy(bolSubmissions.status);

      const byStatus: Record<string, number> = {};
      for (const row of statusCounts) {
        byStatus[row.status ?? "unknown"] = row.count;
      }

      return {
        success: true,
        data: {
          driverId,
          total: totals?.total ?? 0,
          byStatus,
        },
      };
    },
  );

  // ─── OPERATIONS ROUTES (ADMIN) ───────────────────────────────────

  // ─── GET /bol/operations/queue -- Unified reconciliation queue ────
  fastify.get(
    "/bol/operations/queue",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: { type: "string" },
            page: { type: "integer", minimum: 1, default: 1 },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 500,
              default: 100,
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

      const { status, page, limit } = request.query as {
        status?: string;
        page?: number;
        limit?: number;
      };

      const pageNum = page ?? 1;
      const pageSize = limit ?? 100;
      const offset = (pageNum - 1) * pageSize;

      const queue = await getReconciliationQueue(db, {
        status: status as Parameters<typeof getReconciliationQueue>[1] extends
          | { status?: infer S }
          | undefined
          ? S
          : never,
        limit: pageSize,
        offset,
      });

      return {
        success: true,
        data: queue,
        meta: { total: queue.length, page: pageNum, limit: pageSize },
      };
    },
  );

  // ─── GET /bol/propx-queue -- PropX ticket photo review surface ───
  // Mirrors the JotForm queue shape — list of photos with matched load
  // metadata — so the BolQueue page's PropX tab can render the same card
  // layout. The photos table already carries propx-sourced rows from the
  // B2 backfill + sync-time inserts. Joining to loads gives the load_no,
  // driver, delivered date, well, source_id for the proxied image URL.
  fastify.get(
    "/bol/propx-queue",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["all", "matched", "unmatched"],
              default: "all",
            },
            search: { type: "string", maxLength: 80 },
            dateFrom: { type: "string", format: "date" },
            dateTo: { type: "string", format: "date" },
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

      const { status, search, dateFrom, dateTo, page, limit } =
        request.query as {
          status?: "all" | "matched" | "unmatched";
          search?: string;
          dateFrom?: string;
          dateTo?: string;
          page?: number;
          limit?: number;
        };

      const pageNum = page ?? 1;
      const pageSize = limit ?? 50;
      const offset = (pageNum - 1) * pageSize;

      const { photos, loads, assignments } =
        await import("../../../db/schema.js");
      const { and, desc, sql } = await import("drizzle-orm");

      const conditions: Array<ReturnType<typeof sql>> = [
        sql`${photos.source} = 'propx'`,
      ];
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          sql`(${loads.loadNo} ILIKE ${pattern} OR ${loads.ticketNo} ILIKE ${pattern} OR ${loads.bolNo} ILIKE ${pattern} OR ${loads.driverName} ILIKE ${pattern} OR ${loads.truckNo} ILIKE ${pattern})`,
        );
      }
      if (dateFrom) {
        conditions.push(
          sql`${loads.deliveredOn} >= ${`${dateFrom}T00:00:00-05:00`}::timestamptz`,
        );
      }
      if (dateTo) {
        conditions.push(
          sql`${loads.deliveredOn} <= ${`${dateTo}T23:59:59.999-05:00`}::timestamptz`,
        );
      }
      if (status === "matched") {
        conditions.push(sql`${assignments.id} IS NOT NULL`);
      } else if (status === "unmatched") {
        conditions.push(sql`${assignments.id} IS NULL`);
      }

      const whereClause = and(...conditions);

      const rows = await db
        .select({
          photoId: photos.id,
          sourceUrl: photos.sourceUrl,
          photoType: photos.type,
          createdAt: photos.createdAt,
          loadId: loads.id,
          loadNo: loads.loadNo,
          sourceId: loads.sourceId,
          bolNo: loads.bolNo,
          ticketNo: loads.ticketNo,
          driverName: loads.driverName,
          truckNo: loads.truckNo,
          carrierName: loads.carrierName,
          weightTons: loads.weightTons,
          deliveredOn: loads.deliveredOn,
          assignmentId: assignments.id,
          handlerStage: assignments.handlerStage,
          wellName: sql<string | null>`(
            SELECT w.name FROM wells w WHERE w.id = ${assignments.wellId}
          )`,
        })
        .from(photos)
        .leftJoin(loads, sql`${loads.id} = ${photos.loadId}`)
        .leftJoin(assignments, sql`${assignments.loadId} = ${loads.id}`)
        .where(whereClause)
        .orderBy(desc(loads.deliveredOn))
        .limit(pageSize)
        .offset(offset);

      // Total count for pagination (same where clause, cheaper query)
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(photos)
        .leftJoin(loads, sql`${loads.id} = ${photos.loadId}`)
        .leftJoin(assignments, sql`${assignments.loadId} = ${loads.id}`)
        .where(whereClause);

      return {
        success: true,
        data: rows,
        meta: { total, page: pageNum, limit: pageSize },
      };
    },
  );

  // ─── POST /bol/operations/reconcile/:id -- Mark load reconciled ──
  fastify.post(
    "/bol/operations/reconcile/:id",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "integer" },
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

      // Verify submission exists
      const [submission] = await db
        .select()
        .from(bolSubmissions)
        .where(eq(bolSubmissions.id, id))
        .limit(1);

      if (!submission) {
        return reply.status(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `BOL submission ${id} not found`,
          },
        });
      }

      // Mark as confirmed (reconciled)
      await db
        .update(bolSubmissions)
        .set({
          status: "confirmed",
          driverConfirmedAt: new Date(),
        })
        .where(eq(bolSubmissions.id, id));

      return {
        success: true,
        data: {
          id,
          status: "confirmed",
          reconciledAt: new Date().toISOString(),
        },
      };
    },
  );

  // ─── GET /bol/operations/discrepancies -- Loads with discrepancies ─
  fastify.get(
    "/bol/operations/discrepancies",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 500,
              default: 100,
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

      const { page, limit } = request.query as {
        page?: number;
        limit?: number;
      };

      const pageNum = page ?? 1;
      const pageSize = limit ?? 100;
      const offset = (pageNum - 1) * pageSize;

      const rows = await db
        .select()
        .from(bolSubmissions)
        .where(eq(bolSubmissions.status, "discrepancy"))
        .limit(pageSize)
        .offset(offset)
        .orderBy(bolSubmissions.createdAt);

      return {
        success: true,
        data: rows,
        meta: { total: rows.length, page: pageNum, limit: pageSize },
      };
    },
  );

  // ─── POST /bol/operations/auto-match -- Run auto-matching batch ──
  fastify.post(
    "/bol/operations/auto-match",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          properties: {
            submissionIds: {
              type: "array",
              items: { type: "integer" },
              minItems: 1,
              maxItems: 200,
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

      const { submissionIds } = (request.body ?? {}) as {
        submissionIds?: number[];
      };

      // If no specific IDs, auto-match all unmatched extracted submissions
      let ids = submissionIds;
      if (!ids || ids.length === 0) {
        const unmatched = await db
          .select({ id: bolSubmissions.id })
          .from(bolSubmissions)
          .where(isNull(bolSubmissions.matchedLoadId))
          .limit(200);
        ids = unmatched.map((r) => r.id);
      }

      if (ids.length === 0) {
        return {
          success: true,
          data: { total: 0, matched: 0, unmatched: 0, results: [] },
        };
      }

      const result = await batchAutoMatch(db, ids);

      return {
        success: true,
        data: result,
      };
    },
  );

  // ─── POST /bol/operations/manual-match -- Manual match BOL to load ─
  fastify.post(
    "/bol/operations/manual-match",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          required: ["submissionId", "loadId"],
          properties: {
            submissionId: { type: "integer" },
            loadId: { type: "integer" },
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

      const { submissionId, loadId } = request.body as {
        submissionId: number;
        loadId: number;
      };

      const userId = (request.user as { id: number }).id;

      try {
        await manualMatch(db, submissionId, loadId, userId);

        return {
          success: true,
          data: {
            submissionId,
            loadId,
            matchMethod: "manual",
            matchedAt: new Date().toISOString(),
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.includes("not found")) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message,
            },
          });
        }

        throw err;
      }
    },
  );

  // ─── GET /bol/operations/stats -- Operations dashboard stats ──────
  fastify.get(
    "/bol/operations/stats",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
    },
    async (_request, reply) => {
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

      const stats = await getReconciliationStats(db);

      return {
        success: true,
        data: stats,
      };
    },
  );

  // ─── GET /bol/by-load/:loadId ──── BOL reconciliation detail for a load
  // Used by the Workbench drawer to surface OCR-extracted values and
  // discrepancies reconciliation caught. Returns null (not 404) when no
  // BOL submission exists yet — the drawer renders an empty state.
  fastify.get(
    "/bol/by-load/:loadId",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["loadId"],
          properties: { loadId: { type: "integer" } },
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
      const { loadId } = request.params as { loadId: number };

      const [sub] = await db
        .select()
        .from(bolSubmissions)
        .where(eq(bolSubmissions.matchedLoadId, loadId))
        .limit(1);

      if (!sub) {
        return { success: true, data: null };
      }

      const extracted = (sub.aiExtractedData ?? {}) as Record<string, unknown>;
      return {
        success: true,
        data: {
          bolSubmissionId: sub.id,
          matchedLoadId: sub.matchedLoadId,
          matchMethod: sub.matchMethod,
          matchScore: sub.matchScore,
          status: sub.status,
          ocrBolNo: (extracted.ticketNo as string | null) ?? null,
          ocrDriverName: (extracted.driverName as string | null) ?? null,
          ocrWeightLbs: (extracted.weight as number | null) ?? null,
          ocrDeliveryDate: (extracted.deliveryDate as string | null) ?? null,
          discrepancies: (sub.discrepancies ?? []) as Array<{
            field: string;
            expected: unknown;
            actual: unknown;
            severity: string;
          }>,
        },
      };
    },
  );
  // ─── Re-OCR backfilled bol_submissions ────────────────────────────
  // Async fire-and-forget. Targets bol_submissions where
  // aiExtractedData IS NULL AND photos[] non-empty (the 805 backfilled
  // CSV-imported rows that bypassed Vision originally). Each row:
  //   1. extractFromPhotos(photo URLs) — Anthropic Vision call
  //   2. Persist aiExtractedData + aiConfidence + aiMetadata
  //   3. matchSubmissionToLoad — link to a load if extracted ticket # binds
  //   4. assignment.photo_status = 'attached' on the matched load
  //
  // Cost ~$0.01-0.02/row × 805 = ~$8-15. Time ~10-15 min at concurrency=4.
  fastify.post(
    "/bol/reocr-backfilled/start",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
      schema: {
        body: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 5000,
              default: 1000,
            },
            concurrency: {
              type: "integer",
              minimum: 1,
              maximum: 6,
              default: 4,
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
          error: { code: "SERVICE_UNAVAILABLE", message: "DB not connected" },
        });
      }
      const { startReOcrJob, getReOcrJob } =
        await import("../services/bol-reocr.service.js");
      const existing = getReOcrJob();
      if (existing && existing.status === "running") {
        return reply.status(409).send({
          success: false,
          error: { code: "CONFLICT", message: "Re-OCR already running" },
          data: existing,
        });
      }
      const body = (request.body ?? {}) as {
        limit?: number;
        concurrency?: number;
      };
      const job = startReOcrJob({
        db,
        limit: body.limit,
        concurrency: body.concurrency,
      });
      return reply.status(202).send({ success: true, data: job });
    },
  );

  fastify.get(
    "/bol/reocr-backfilled/status",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] },
    async () => {
      const { getReOcrJob } = await import("../services/bol-reocr.service.js");
      return { success: true, data: getReOcrJob() ?? { status: "idle" } };
    },
  );

  fastify.post(
    "/bol/reocr-backfilled/stop",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] },
    async () => {
      const { stopReOcrJob, getReOcrJob } =
        await import("../services/bol-reocr.service.js");
      const stopped = stopReOcrJob();
      return {
        success: true,
        data: { stopped, job: getReOcrJob() ?? null },
      };
    },
  );
};

export default bolRoutes;
