import { type FastifyPluginAsync } from "fastify";
import multipart from "@fastify/multipart";
import { eq, and, sql, desc } from "drizzle-orm";
import { LogistiqClient } from "../services/logistiq.service.js";
import {
  syncLogistiqLoads,
  normalizeFromLogistiq,
  detectCrossSourceConflicts,
} from "../services/logistiq-sync.service.js";
import { loads, ingestionConflicts } from "../../../db/schema.js";

// ---------------------------------------------------------------------------
// Process-level concurrency guard for sync operations
// ---------------------------------------------------------------------------

let syncInProgress = false;

/**
 * Build a LogistiqClient from environment variables.
 * Throws if required credentials are missing.
 */
function createLogistiqClientFromEnv(): LogistiqClient {
  const email = process.env.LOGISTIQ_EMAIL;
  const password = process.env.LOGISTIQ_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "LOGISTIQ_EMAIL and LOGISTIQ_PASSWORD environment variables are required",
    );
  }
  return new LogistiqClient({
    email,
    password,
    apiKey: process.env.LOGISTIQ_API_KEY,
    baseUrl: process.env.LOGISTIQ_BASE_URL,
    carrierId: process.env.LOGISTIQ_CARRIER_ID
      ? parseInt(process.env.LOGISTIQ_CARRIER_ID, 10)
      : undefined,
  });
}

// ---------------------------------------------------------------------------
// CSV parsing — lightweight, handles quoted fields
// ---------------------------------------------------------------------------

/**
 * Parse a CSV string into an array of objects keyed by header names.
 * Handles quoted fields with commas/newlines, trims whitespace.
 */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? "").trim();
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Split a single CSV line into fields, respecting quoted fields.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const logistiqRoutes: FastifyPluginAsync = async (fastify) => {
  // Register multipart support for file uploads within this plugin scope
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB
      files: 1,
    },
  });

  // ─── POST /sync/logistiq — trigger Logistiq sync for date range ────
  fastify.post(
    "/sync/logistiq",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
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

      const { from, to } = request.body as { from: string; to: string };
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

      if (syncInProgress) {
        return reply.status(409).send({
          success: false,
          error: {
            code: "CONFLICT",
            message: "A Logistiq sync is already in progress",
          },
        });
      }

      syncInProgress = true;
      try {
        const client = createLogistiqClientFromEnv();
        const syncResult = await syncLogistiqLoads(db, client, {
          from: fromDate,
          to: toDate,
        });

        // Detect cross-source conflicts for newly inserted loads
        let conflictCount = 0;
        if (syncResult.inserted > 0 || syncResult.updated > 0) {
          // Get IDs of recently upserted logistiq loads in this date range
          const recentLoads = await db
            .select({ id: loads.id })
            .from(loads)
            .where(
              and(
                eq(loads.source, "logistiq"),
                sql`${loads.updatedAt} >= NOW() - INTERVAL '5 minutes'`,
              ),
            );

          if (recentLoads.length > 0) {
            const conflictResult = await detectCrossSourceConflicts(
              db,
              recentLoads.map((l) => l.id),
            );
            conflictCount = conflictResult.conflictsCreated;
          }
        }

        return {
          success: true,
          data: {
            ...syncResult,
            conflictsDetected: conflictCount,
          },
        };
      } finally {
        syncInProgress = false;
      }
    },
  );

  // ─── POST /logistiq/upload — CSV/Excel upload + preview ────────────
  fastify.post(
    "/logistiq/upload",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
    },
    async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "No file uploaded. Send a CSV file via multipart form.",
          },
        });
      }

      const filename = file.filename.toLowerCase();
      if (!filename.endsWith(".csv")) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Unsupported file type. Only CSV files are supported currently.",
          },
        });
      }

      // Read the file buffer
      const buffer = await file.toBuffer();
      const text = buffer.toString("utf-8");

      // Parse CSV
      const rawRows = parseCsv(text);
      if (rawRows.length === 0) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "CSV file is empty or has no data rows.",
          },
        });
      }

      // Build column mapping from headers
      const headers = Object.keys(rawRows[0]);

      // Preview: normalize each row to show what the system will produce
      const previewed = rawRows.map((row) => normalizeFromLogistiq(row));

      // Compute match rate: rows that have a non-empty loadNo
      const matched = previewed.filter((p) => p.loadNo && p.loadNo !== "");

      return {
        success: true,
        data: {
          filename: file.filename,
          totalRows: rawRows.length,
          parsedRows: previewed.length,
          matchRate:
            rawRows.length > 0
              ? Number(((matched.length / rawRows.length) * 100).toFixed(1))
              : 0,
          columnHeaders: headers,
          preview: previewed.slice(0, 10), // First 10 rows as preview
        },
      };
    },
  );

  // ─── POST /logistiq/commit — commit previewed records ──────────────
  fastify.post(
    "/logistiq/commit",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          required: ["rows"],
          properties: {
            rows: {
              type: "array",
              items: { type: "object" },
              minItems: 1,
            },
            columnMap: { type: "object" },
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

      const { rows, columnMap } = request.body as {
        rows: Record<string, unknown>[];
        columnMap?: Record<string, string>;
      };

      // Normalize rows — apply column mapping if provided
      const normalized = rows.map((row) => {
        if (columnMap) {
          const mapped: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(row)) {
            const canonicalKey = columnMap[key] ?? key;
            mapped[canonicalKey] = value;
          }
          return normalizeFromLogistiq(mapped);
        }
        return normalizeFromLogistiq(row);
      });

      let inserted = 0;
      let updated = 0;
      const errors: Array<{ sourceId: string; error: string }> = [];

      for (const load of normalized) {
        try {
          // Check if this load already exists
          const existing = await db
            .select({ id: loads.id })
            .from(loads)
            .where(
              and(
                eq(loads.source, load.source),
                eq(loads.sourceId, load.sourceId),
              ),
            )
            .limit(1);

          await db
            .insert(loads)
            .values({
              loadNo: load.loadNo,
              source: load.source,
              sourceId: load.sourceId,
              driverName: load.driverName,
              driverId: load.driverId,
              truckNo: load.truckNo,
              trailerNo: load.trailerNo,
              carrierName: load.carrierName,
              customerName: load.customerName,
              productDescription: load.productDescription,
              originName: load.originName,
              destinationName: load.destinationName,
              weightTons: load.weightTons,
              netWeightTons: load.netWeightTons,
              rate: load.rate,
              mileage: load.mileage,
              bolNo: load.bolNo,
              orderNo: load.orderNo,
              referenceNo: load.referenceNo,
              ticketNo: load.ticketNo,
              status: load.status,
              deliveredOn: load.deliveredOn,
              rawData: load.rawData,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [loads.source, loads.sourceId],
              set: {
                loadNo: load.loadNo,
                driverName: load.driverName,
                driverId: load.driverId,
                truckNo: load.truckNo,
                trailerNo: load.trailerNo,
                carrierName: load.carrierName,
                customerName: load.customerName,
                productDescription: load.productDescription,
                originName: load.originName,
                destinationName: load.destinationName,
                weightTons: load.weightTons,
                netWeightTons: load.netWeightTons,
                rate: load.rate,
                mileage: load.mileage,
                bolNo: load.bolNo,
                orderNo: load.orderNo,
                referenceNo: load.referenceNo,
                ticketNo: load.ticketNo,
                status: load.status,
                deliveredOn: load.deliveredOn,
                rawData: load.rawData,
                updatedAt: new Date(),
              },
            });

          if (existing.length > 0) {
            updated++;
          } else {
            inserted++;
          }
        } catch (err: unknown) {
          errors.push({
            sourceId: load.sourceId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return {
        success: true,
        data: {
          totalRows: rows.length,
          inserted,
          updated,
          errors: errors.length > 0 ? errors : undefined,
        },
      };
    },
  );

  // ─── GET /logistiq/conflicts — unresolved ingestion conflicts ──────
  fastify.get(
    "/logistiq/conflicts",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
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

      const { page = 1, limit = 20 } = request.query as {
        page?: number;
        limit?: number;
      };
      const offset = (page - 1) * limit;

      const [conflicts, countResult] = await Promise.all([
        db
          .select()
          .from(ingestionConflicts)
          .where(eq(ingestionConflicts.status, "pending"))
          .orderBy(desc(ingestionConflicts.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(ingestionConflicts)
          .where(eq(ingestionConflicts.status, "pending")),
      ]);

      const total = countResult[0]?.count ?? 0;

      return {
        success: true,
        data: conflicts,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    },
  );

  // ─── PUT /logistiq/conflicts/:id/resolve — resolve a conflict ──────
  fastify.put(
    "/logistiq/conflicts/:id/resolve",
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
        body: {
          type: "object",
          required: ["resolution"],
          properties: {
            resolution: {
              type: "string",
              enum: ["resolved_propx", "resolved_logistiq", "resolved_manual"],
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

      const { id } = request.params as { id: number };
      const { resolution } = request.body as {
        resolution: "resolved_propx" | "resolved_logistiq" | "resolved_manual";
      };
      const user = request.user as { id: number };

      // Verify the conflict exists and is pending
      const [existing] = await db
        .select({
          id: ingestionConflicts.id,
          status: ingestionConflicts.status,
        })
        .from(ingestionConflicts)
        .where(eq(ingestionConflicts.id, id))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `Conflict ${id} not found`,
          },
        });
      }

      if (existing.status !== "pending") {
        return reply.status(409).send({
          success: false,
          error: {
            code: "CONFLICT",
            message: `Conflict ${id} is already resolved (status: ${existing.status})`,
          },
        });
      }

      const [updated] = await db
        .update(ingestionConflicts)
        .set({
          status: resolution,
          resolvedBy: user.id,
          resolvedAt: new Date(),
        })
        .where(eq(ingestionConflicts.id, id))
        .returning();

      return {
        success: true,
        data: updated,
      };
    },
  );

  // ─── GET /logistiq/stats — Logistiq-specific ingestion stats ───────
  fastify.get(
    "/logistiq/stats",
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

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [totalResult, todayResult, conflictsResult, lastSyncResult] =
        await Promise.all([
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(loads)
            .where(eq(loads.source, "logistiq")),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(loads)
            .where(
              and(
                eq(loads.source, "logistiq"),
                sql`${loads.createdAt} >= ${todayStart}`,
              ),
            ),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(ingestionConflicts)
            .where(eq(ingestionConflicts.status, "pending")),
          db
            .select({ lastUpdated: sql<string>`max(${loads.updatedAt})` })
            .from(loads)
            .where(eq(loads.source, "logistiq")),
        ]);

      return {
        success: true,
        data: {
          totalLoads: totalResult[0]?.count ?? 0,
          syncedToday: todayResult[0]?.count ?? 0,
          unresolvedConflicts: conflictsResult[0]?.count ?? 0,
          lastSyncAt: lastSyncResult[0]?.lastUpdated ?? null,
        },
      };
    },
  );
};

export default logistiqRoutes;
