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
  // ─── GET /photos/gcs/:submissionId -- proxy photo from GCS ──
  fastify.get(
    "/photos/gcs/:submissionId",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["submissionId"],
          properties: { submissionId: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      const { submissionId } = request.params as { submissionId: string };
      const bucket = process.env.GCS_PHOTO_BUCKET;
      const keyJson = process.env.GCS_SERVICE_ACCOUNT_KEY;

      if (!bucket || !keyJson) {
        return reply.status(503).send({
          success: false,
          error: {
            code: "CONFIG_ERROR",
            message: "GCS photo storage not configured",
          },
        });
      }

      // Get OAuth2 access token from service account key
      const { createSign } = await import("node:crypto");
      const sa = JSON.parse(keyJson);

      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(
        JSON.stringify({ alg: "RS256", typ: "JWT" }),
      ).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          iss: sa.client_email,
          scope: "https://www.googleapis.com/auth/devstorage.read_only",
          aud: "https://oauth2.googleapis.com/token",
          iat: now,
          exp: now + 3600,
        }),
      ).toString("base64url");

      const signer = createSign("RSA-SHA256");
      signer.update(`${header}.${payload}`);
      const signature = signer.sign(sa.private_key, "base64url");
      const jwt = `${header}.${payload}.${signature}`;

      // Exchange JWT for access token
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
      });
      const tokenData = (await tokenRes.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        return reply.status(500).send({
          success: false,
          error: {
            code: "AUTH_ERROR",
            message: "Failed to get GCS access token",
          },
        });
      }

      // Try fetching the photo with common extensions
      const extensions = ["jpg", "jpeg", "png", "pdf"];
      for (const ext of extensions) {
        const objectPath = encodeURIComponent(`photos/${submissionId}.${ext}`);
        const gcsUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${objectPath}?alt=media`;

        const photoRes = await fetch(gcsUrl, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        if (photoRes.ok) {
          const contentType =
            photoRes.headers.get("content-type") || "image/jpeg";
          reply.header("Content-Type", contentType);
          reply.header("Cache-Control", "public, max-age=86400");
          const buffer = Buffer.from(await photoRes.arrayBuffer());
          return reply.send(buffer);
        }
      }

      return reply.status(404).send({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `No photo found for submission ${submissionId}`,
        },
      });
    },
  );

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
  // NOTE: no auth preHandler. Browser <img> tags cannot send Authorization
  // headers, and we have no cookie-based auth plumbing. The SSRF allowlist
  // (photo.service.ts ALLOWED_PHOTO_HOSTS) is the guard — only JotForm,
  // PropX, and GCS hosts are ever fetched, and the URL itself is a public
  // JotForm capability URL. Reverting M-6 from commit 7adf33c for the same
  // reason documented in commit 0aee4f4: header-based JWT breaks <img>.
  fastify.get(
    "/photos/proxy",
    {
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

        // Force inline display with a filename based on the upstream URL, so
        // window.open()/new-tab navigation renders the image instead of
        // saving a file named "proxy" (which is what Chrome derives from
        // the URL path when no Content-Disposition is set).
        const ext =
          contentType === "image/png"
            ? "png"
            : contentType === "image/webp"
              ? "webp"
              : contentType === "application/pdf"
                ? "pdf"
                : "jpg";

        return reply
          .header("Content-Type", contentType)
          .header("Content-Disposition", `inline; filename="ticket.${ext}"`)
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
