/**
 * Verification Photos Routes -- Track 3.2
 * ========================================
 *
 * Photo proxy, ZIP download, JotForm sync trigger, and match stats.
 *
 * Routes:
 *   GET  /photos/load/:loadId   Photos for a specific load
 *   GET  /photos/proxy          SSRF-safe proxy fetch (?url=...)
 *   POST /photos/zip            ZIP download for assignment photos
 *   POST /jotform/sync          Trigger JotForm weight ticket sync
 *   GET  /jotform/stats         JotForm match statistics
 */

import { type FastifyPluginAsync } from "fastify";
import { eq, inArray, count } from "drizzle-orm";
import { photos, jotformImports } from "../../../db/schema.js";
import {
  isAllowedPhotoHost,
  proxyPhoto,
  createPhotoZip,
} from "../services/photo.service.js";
import {
  syncWeightTickets,
  type JotFormConfig,
} from "../services/jotform.service.js";

// Process-level concurrency guard for JotForm sync
let jotformSyncInProgress = false;

const photosRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── GET /photos/load/:loadId -- all photos for a load ────────────
  fastify.get(
    "/photos/load/:loadId",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["loadId"],
          properties: {
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

      const { loadId } = request.params as { loadId: number };

      const rows = await db
        .select({
          id: photos.id,
          loadId: photos.loadId,
          assignmentId: photos.assignmentId,
          source: photos.source,
          sourceUrl: photos.sourceUrl,
          type: photos.type,
          ticketNo: photos.ticketNo,
          driverName: photos.driverName,
          pcsUploaded: photos.pcsUploaded,
          pcsAttachmentType: photos.pcsAttachmentType,
          createdAt: photos.createdAt,
        })
        .from(photos)
        .where(eq(photos.loadId, loadId));

      return {
        success: true,
        data: rows,
        meta: { total: rows.length },
      };
    },
  );

  // ─── GET /photos/proxy -- SSRF-safe photo proxy ───────────────────
  fastify.get(
    "/photos/proxy",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string", format: "uri" },
          },
        },
      },
    },
    async (request, reply) => {
      const { url } = request.query as { url: string };

      // Fast synchronous check before async validation
      if (!isAllowedPhotoHost(url)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "INVALID_URL",
            message: "URL is not from an allowed photo host",
          },
        });
      }

      try {
        const { buffer, contentType } = await proxyPhoto(url);

        return reply
          .header("Content-Type", contentType)
          .header("Cache-Control", "public, max-age=3600")
          .header("X-Proxy-Source", "esexpress-photo-proxy")
          .send(buffer);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Proxy fetch failed";
        return reply.status(502).send({
          success: false,
          error: {
            code: "PROXY_ERROR",
            message,
          },
        });
      }
    },
  );

  // ─── POST /photos/zip -- ZIP download for assignment photos ───────
  fastify.post(
    "/photos/zip",
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
              maxItems: 50,
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

      // Fetch all photos for the given assignments
      const rows = await db
        .select({ sourceUrl: photos.sourceUrl })
        .from(photos)
        .where(inArray(photos.assignmentId, assignmentIds));

      const urls = rows
        .map((r) => r.sourceUrl)
        .filter((u): u is string => u != null && isAllowedPhotoHost(u));

      if (urls.length === 0) {
        return reply.status(404).send({
          success: false,
          error: {
            code: "NO_PHOTOS",
            message: "No downloadable photos found for the given assignments",
          },
        });
      }

      try {
        const { buffer, skipped } = await createPhotoZip(urls);

        return reply
          .header("Content-Type", "application/zip")
          .header(
            "Content-Disposition",
            `attachment; filename="photos-${Date.now()}.zip"`,
          )
          .header("X-Photos-Included", String(urls.length - skipped.length))
          .header("X-Photos-Skipped", String(skipped.length))
          .send(buffer);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "ZIP creation failed";
        return reply.status(502).send({
          success: false,
          error: {
            code: "ZIP_ERROR",
            message,
          },
        });
      }
    },
  );

  // ─── POST /jotform/sync -- trigger JotForm weight ticket sync ─────
  fastify.post(
    "/jotform/sync",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
            offset: { type: "integer", minimum: 0, default: 0 },
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

      const apiKey = process.env.JOTFORM_API_KEY;
      if (!apiKey) {
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "JOTFORM_API_KEY not configured",
          },
        });
      }

      if (jotformSyncInProgress) {
        return reply.status(409).send({
          success: false,
          error: {
            code: "CONFLICT",
            message: "A JotForm sync is already in progress",
          },
        });
      }

      const { limit, offset } = request.query as {
        limit?: number;
        offset?: number;
      };

      const config: JotFormConfig = {
        apiKey,
        formId: process.env.JOTFORM_FORM_ID,
        baseUrl: process.env.JOTFORM_BASE_URL,
      };

      jotformSyncInProgress = true;
      try {
        const result = await syncWeightTickets(db, config, { limit, offset });
        return { success: true, data: result };
      } finally {
        jotformSyncInProgress = false;
      }
    },
  );

  // ─── GET /jotform/stats -- JotForm match statistics ───────────────
  fastify.get(
    "/jotform/stats",
    {
      preHandler: [fastify.authenticate],
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

      // Aggregate match stats from jotform_imports table
      const [totals] = await db.select({ total: count() }).from(jotformImports);

      const statusCounts = await db
        .select({
          status: jotformImports.status,
          count: count(),
        })
        .from(jotformImports)
        .groupBy(jotformImports.status);

      const methodCounts = await db
        .select({
          matchMethod: jotformImports.matchMethod,
          count: count(),
        })
        .from(jotformImports)
        .groupBy(jotformImports.matchMethod);

      const statusMap: Record<string, number> = {};
      for (const row of statusCounts) {
        statusMap[row.status ?? "unknown"] = row.count;
      }

      const methodMap: Record<string, number> = {};
      for (const row of methodCounts) {
        methodMap[row.matchMethod ?? "unmatched"] = row.count;
      }

      const total = totals?.total ?? 0;
      const matched = statusMap["matched"] ?? 0;
      const matchRate =
        total > 0 ? ((matched / total) * 100).toFixed(1) : "0.0";

      return {
        success: true,
        data: {
          total,
          matchRate: `${matchRate}%`,
          byStatus: statusMap,
          byMethod: methodMap,
        },
      };
    },
  );
};

export default photosRoutes;
