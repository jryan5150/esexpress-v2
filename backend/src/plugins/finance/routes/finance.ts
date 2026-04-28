import { type FastifyPluginAsync } from "fastify";
import { eq, and, between, sql, desc } from "drizzle-orm";
import { paymentBatches } from "../../../db/schema.js";
import {
  createBatch,
  createBatchesForAllDrivers,
  getBatch,
  updateBatch,
  transitionStatus,
  addDeduction,
  removeDeduction,
  diagnostics,
  type Deduction,
} from "../services/payment.service.js";

const DB_UNAVAILABLE = {
  success: false,
  error: { code: "SERVICE_UNAVAILABLE", message: "Database not connected" },
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const financeRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── GET /batches — list batches (filterable) ───────────────────
  fastify.get(
    "/batches",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: { type: "string" },
            driverId: { type: "string" },
            from: { type: "string", format: "date" },
            to: { type: "string", format: "date" },
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);
      const { status, driverId, from, to, page, limit } = request.query as {
        status?: string;
        driverId?: string;
        from?: string;
        to?: string;
        page?: number;
        limit?: number;
      };

      const pageNum = page ?? 1;
      const pageSize = limit ?? 50;
      const offset = (pageNum - 1) * pageSize;

      const conditions = [];
      if (status)
        conditions.push(
          eq(
            paymentBatches.status,
            status as unknown as typeof paymentBatches.status._.data,
          ),
        );
      if (driverId) conditions.push(eq(paymentBatches.driverId, driverId));
      if (from && to) {
        conditions.push(
          between(paymentBatches.weekStart, new Date(from), new Date(to)),
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select()
        .from(paymentBatches)
        .where(where)
        .orderBy(desc(paymentBatches.createdAt))
        .limit(pageSize)
        .offset(offset);

      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(paymentBatches)
        .where(where);

      return {
        success: true,
        data: rows,
        meta: {
          page: pageNum,
          limit: pageSize,
          total: countRow?.count ?? 0,
        },
      };
    },
  );

  // ─── POST /batches — create batch for driver + date range ───────
  fastify.post(
    "/batches",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "finance"]),
      ],
      schema: {
        body: {
          type: "object",
          required: ["driverId", "driverName", "weekStart", "weekEnd"],
          properties: {
            driverId: { type: "string", minLength: 1 },
            driverName: { type: "string", minLength: 1 },
            carrierName: { type: "string" },
            weekStart: { type: "string", format: "date" },
            weekEnd: { type: "string", format: "date" },
            ratePerTon: { type: "number", minimum: 0 },
            ratePerMile: { type: "number", minimum: 0 },
            rateType: { type: "string", enum: ["per_ton", "per_mile"] },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);
      const body = request.body as {
        driverId: string;
        driverName: string;
        carrierName?: string;
        weekStart: string;
        weekEnd: string;
        ratePerTon?: number;
        ratePerMile?: number;
        rateType?: "per_ton" | "per_mile";
      };

      const batch = await createBatch(db, {
        driverId: body.driverId,
        driverName: body.driverName,
        carrierName: body.carrierName,
        weekStart: new Date(body.weekStart),
        weekEnd: new Date(body.weekEnd),
        ratePerTon: body.ratePerTon,
        ratePerMile: body.ratePerMile,
        rateType: body.rateType,
        createdBy: request.user.id,
      });

      return { success: true, data: batch };
    },
  );

  // ─── POST /batches/create-all — create batches for ALL drivers ──
  fastify.post(
    "/batches/create-all",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "finance"]),
      ],
      schema: {
        body: {
          type: "object",
          required: ["weekStart", "weekEnd"],
          properties: {
            weekStart: { type: "string", format: "date" },
            weekEnd: { type: "string", format: "date" },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);
      const { weekStart, weekEnd } = request.body as {
        weekStart: string;
        weekEnd: string;
      };

      const result = await createBatchesForAllDrivers(
        db,
        { start: new Date(weekStart), end: new Date(weekEnd) },
        request.user.id,
      );

      return { success: true, data: result };
    },
  );

  // ─── GET /batches/:id — batch detail with loads ─────────────────
  fastify.get(
    "/batches/:id",
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
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);
      const { id } = request.params as { id: number };
      const batch = await getBatch(db, id);
      return { success: true, data: batch };
    },
  );

  // ─── PUT /batches/:id — update batch ────────────────────────────
  fastify.put(
    "/batches/:id",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "finance"]),
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
          properties: {
            ratePerTon: { type: "number", minimum: 0 },
            ratePerMile: { type: "number", minimum: 0 },
            rateType: { type: "string", enum: ["per_ton", "per_mile"] },
            carrierName: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);
      const { id } = request.params as { id: number };
      const body = request.body as Partial<{
        ratePerTon: number;
        ratePerMile: number;
        rateType: string;
        carrierName: string;
      }>;

      await updateBatch(db, id, body as Parameters<typeof updateBatch>[2]);

      return {
        success: true,
        data: { id, updatedAt: new Date().toISOString() },
      };
    },
  );

  // ─── POST /batches/:id/deductions — add deduction ───────────────
  fastify.post(
    "/batches/:id/deductions",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "finance"]),
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
          required: ["type", "amount", "description"],
          properties: {
            type: { type: "string", minLength: 1 },
            amount: { type: "number", minimum: 0 },
            description: { type: "string", minLength: 1 },
            reference: { type: "string" },
            date: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);
      const { id } = request.params as { id: number };
      const deduction = request.body as Deduction;

      await addDeduction(db, id, deduction);

      return {
        success: true,
        data: { batchId: id, addedAt: new Date().toISOString() },
      };
    },
  );

  // ─── DELETE /batches/:id/deductions/:idx — remove deduction ─────
  fastify.delete(
    "/batches/:id/deductions/:idx",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "finance"]),
      ],
      schema: {
        params: {
          type: "object",
          required: ["id", "idx"],
          properties: {
            id: { type: "integer" },
            idx: { type: "integer" },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);
      const { id, idx } = request.params as { id: number; idx: number };

      await removeDeduction(db, id, idx);

      return {
        success: true,
        data: {
          batchId: id,
          removedIndex: idx,
          removedAt: new Date().toISOString(),
        },
      };
    },
  );

  // ─── POST /batches/:id/submit — draft → pending_review ──────────
  fastify.post(
    "/batches/:id/submit",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "finance"]),
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
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);
      const { id } = request.params as { id: number };

      await transitionStatus(db, id, "pending_review", request.user.id);

      return {
        success: true,
        data: {
          batchId: id,
          status: "pending_review",
          transitionedAt: new Date().toISOString(),
        },
      };
    },
  );

  // ─── POST /batches/:id/approve — under_review → approved ────────
  fastify.post(
    "/batches/:id/approve",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
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
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);
      const { id } = request.params as { id: number };

      await transitionStatus(db, id, "approved", request.user.id);

      return {
        success: true,
        data: {
          batchId: id,
          status: "approved",
          transitionedAt: new Date().toISOString(),
        },
      };
    },
  );

  // ─── POST /batches/:id/reject — under_review → rejected ─────────
  fastify.post(
    "/batches/:id/reject",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "finance"]),
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
          properties: {
            notes: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);
      const { id } = request.params as { id: number };
      const { notes } = (request.body as { notes?: string }) ?? {};

      await transitionStatus(db, id, "rejected", request.user.id, notes);

      return {
        success: true,
        data: {
          batchId: id,
          status: "rejected",
          transitionedAt: new Date().toISOString(),
        },
      };
    },
  );

  // ─── POST /batches/:id/paid — approved → paid ──────────────────
  fastify.post(
    "/batches/:id/paid",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
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
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);
      const { id } = request.params as { id: number };

      await transitionStatus(db, id, "paid", request.user.id);

      return {
        success: true,
        data: {
          batchId: id,
          status: "paid",
          transitionedAt: new Date().toISOString(),
        },
      };
    },
  );

  // ─── POST /batches/:id/export — export to Google Sheets (stub) ──
  fastify.post(
    "/batches/:id/export",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "finance"]),
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
    async (request, _reply) => {
      const { id } = request.params as { id: number };

      // Stub: In production, this will call sheetsService.exportBatch()
      // and update the batch with sheetsExportUrl + sheetsExportedAt
      return {
        success: true,
        data: {
          batchId: id,
          status: "stub",
          message:
            "Sheets export not yet wired — will integrate with sheets plugin",
          requestedAt: new Date().toISOString(),
        },
      };
    },
  );

  // ─── POST /batches/:id/notify — notify driver (stub) ────────────
  fastify.post(
    "/batches/:id/notify",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "finance"]),
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
    async (request, _reply) => {
      const { id } = request.params as { id: number };

      // Stub: Will integrate with notification service (email/SMS/push)
      return {
        success: true,
        data: {
          batchId: id,
          status: "stub",
          message: "Driver notification not yet implemented",
          requestedAt: new Date().toISOString(),
        },
      };
    },
  );

  // ─── GET /summary — summary for date range ──────────────────────
  fastify.get(
    "/summary",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            from: { type: "string", format: "date" },
            to: { type: "string", format: "date" },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) return reply.status(503).send(DB_UNAVAILABLE);
      const { from, to } = request.query as { from?: string; to?: string };

      const conditions = [];
      if (from && to) {
        conditions.push(
          between(paymentBatches.weekStart, new Date(from), new Date(to)),
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [summary] = await db
        .select({
          totalBatches: sql<number>`count(*)::int`,
          totalGrossPay: sql<string>`COALESCE(sum(${paymentBatches.grossPay}), 0)`,
          totalDeductions: sql<string>`COALESCE(sum(${paymentBatches.totalDeductions}), 0)`,
          totalNetPay: sql<string>`COALESCE(sum(${paymentBatches.netPay}), 0)`,
          totalLoads: sql<number>`COALESCE(sum(${paymentBatches.loadCount}), 0)::int`,
        })
        .from(paymentBatches)
        .where(where);

      return {
        success: true,
        data: {
          totalBatches: summary?.totalBatches ?? 0,
          totalGrossPay: summary?.totalGrossPay ?? "0",
          totalDeductions: summary?.totalDeductions ?? "0",
          totalNetPay: summary?.totalNetPay ?? "0",
          totalLoads: summary?.totalLoads ?? 0,
          dateRange: from && to ? { from, to } : null,
        },
      };
    },
  );

  // ─── GET /drivers/:id/history — driver payment history ───────────
  fastify.get(
    "/drivers/:id/history",
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
    async (request, _reply) => {
      const db = fastify.db;
      const { id: driverId } = request.params as { id: string };

      const batches = await db
        .select()
        .from(paymentBatches)
        .where(eq(paymentBatches.driverId, driverId))
        .orderBy(desc(paymentBatches.weekStart));

      return {
        success: true,
        data: batches,
        meta: {
          driverId,
          total: batches.length,
        },
      };
    },
  );

  // ─── GET /pending-review — batches pending review ────────────────
  fastify.get(
    "/pending-review",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
          },
        },
      },
    },
    async (request, _reply) => {
      const db = fastify.db;
      const { page, limit } = request.query as {
        page?: number;
        limit?: number;
      };
      const pageNum = page ?? 1;
      const pageSize = limit ?? 50;
      const offset = (pageNum - 1) * pageSize;

      const where = eq(paymentBatches.status, "pending_review");

      const batches = await db
        .select()
        .from(paymentBatches)
        .where(where)
        .orderBy(desc(paymentBatches.createdAt))
        .limit(pageSize)
        .offset(offset);

      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(paymentBatches)
        .where(where);

      return {
        success: true,
        data: batches,
        meta: {
          page: pageNum,
          limit: pageSize,
          total: countRow?.count ?? 0,
        },
      };
    },
  );

  // ─── GET /status-summary — counts by status ─────────────────────
  fastify.get(
    "/status-summary",
    {
      preHandler: [fastify.authenticate],
    },
    async (_request, _reply) => {
      const db = fastify.db;

      const rows = await db
        .select({
          status: paymentBatches.status,
          count: sql<number>`count(*)::int`,
        })
        .from(paymentBatches)
        .groupBy(paymentBatches.status);

      const summary: Record<string, number> = {};
      for (const row of rows) {
        summary[row.status ?? "unknown"] = row.count;
      }

      return {
        success: true,
        data: { summary, total: rows.reduce((s, r) => s + r.count, 0) },
      };
    },
  );

  // ─── GET /drivers — drivers with payment activity ────────────────
  fastify.get(
    "/drivers",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
          },
        },
      },
    },
    async (request, _reply) => {
      const db = fastify.db;
      const { page, limit } = request.query as {
        page?: number;
        limit?: number;
      };
      const pageNum = page ?? 1;
      const pageSize = limit ?? 50;
      const offset = (pageNum - 1) * pageSize;

      const drivers = await db
        .select({
          driverId: paymentBatches.driverId,
          driverName: paymentBatches.driverName,
          carrierName: paymentBatches.carrierName,
          batchCount: sql<number>`count(*)::int`,
          totalGrossPay: sql<string>`COALESCE(sum(${paymentBatches.grossPay}), 0)`,
          totalNetPay: sql<string>`COALESCE(sum(${paymentBatches.netPay}), 0)`,
          lastBatchDate: sql<string>`max(${paymentBatches.weekEnd})`,
        })
        .from(paymentBatches)
        .groupBy(
          paymentBatches.driverId,
          paymentBatches.driverName,
          paymentBatches.carrierName,
        )
        .limit(pageSize)
        .offset(offset);

      const [countRow] = await db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(
          db
            .select({ driverId: paymentBatches.driverId })
            .from(paymentBatches)
            .groupBy(paymentBatches.driverId)
            .as("distinct_drivers"),
        );

      return {
        success: true,
        data: drivers,
        meta: {
          page: pageNum,
          limit: pageSize,
          total: countRow?.count ?? 0,
        },
      };
    },
  );

  // ─── GET /health — diagnostics endpoint ──────────────────────────
  fastify.get("/health", async (_request, _reply) => {
    const diag = diagnostics();
    return {
      success: true,
      data: {
        name: diag.name,
        status: diag.status,
        stats: diag.stats,
        checks: diag.checks,
        checkedAt: new Date().toISOString(),
      },
    };
  });
};

export default financeRoutes;
