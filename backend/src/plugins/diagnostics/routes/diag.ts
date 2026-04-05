import { type FastifyPluginAsync } from "fastify";
import { perfBuffer } from "../../../lib/perf-buffer.js";

const diagRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /health — overall system status (public)
  fastify.get("/health", async () => {
    const stats = perfBuffer.computeStats(Date.now() - 24 * 60 * 60 * 1000);
    const errorRate =
      stats.count > 0
        ? Object.values(stats.errorsByStatus).reduce((a, b) => a + b, 0) /
          stats.count
        : 0;

    let status: "green" | "yellow" | "red" = "green";
    if (errorRate > 0.1 || stats.p95 > 5000) status = "red";
    else if (errorRate > 0.02 || stats.p95 > 2000) status = "yellow";

    return {
      success: true,
      data: {
        status,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: "2.0.0",
      },
    };
  });

  // GET /pipeline — last sync per source (auth required)
  fastify.get(
    "/pipeline",
    { preHandler: [fastify.authenticate] },
    async (_request, reply) => {
      const db = fastify.db;
      if (!db)
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });

      const { syncRuns } = await import("../../../db/schema.js");
      const { desc, eq } = await import("drizzle-orm");

      const sources = ["propx", "logistiq", "automap", "jotform"] as const;
      const pipeline: Record<string, unknown> = {};

      for (const source of sources) {
        const [latest] = await db
          .select()
          .from(syncRuns)
          .where(eq(syncRuns.source, source))
          .orderBy(desc(syncRuns.startedAt))
          .limit(1);

        const recentRuns = await db
          .select({ status: syncRuns.status, startedAt: syncRuns.startedAt })
          .from(syncRuns)
          .where(eq(syncRuns.source, source))
          .orderBy(desc(syncRuns.startedAt))
          .limit(5);

        pipeline[source] = {
          lastRun: latest || null,
          recentRuns: recentRuns.map((r) => ({
            status: r.status,
            at: r.startedAt,
          })),
        };
      }

      return { success: true, data: pipeline };
    },
  );

  // GET /performance — request timing stats
  fastify.get(
    "/performance",
    { preHandler: [fastify.authenticate] },
    async () => {
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const stats = perfBuffer.computeStats(since);

      const entries = perfBuffer.getEntries(since);
      const hourlyBuckets: number[] = new Array(24).fill(0);
      const hourlyCounts: number[] = new Array(24).fill(0);
      for (const e of entries) {
        const hoursAgo = Math.floor(
          (Date.now() - e.timestamp) / (60 * 60 * 1000),
        );
        if (hoursAgo >= 0 && hoursAgo < 24) {
          const idx = 23 - hoursAgo;
          hourlyBuckets[idx] += e.responseTimeMs;
          hourlyCounts[idx]++;
        }
      }
      const hourlyAvg = hourlyBuckets.map((total, i) =>
        hourlyCounts[i] > 0 ? Math.round(total / hourlyCounts[i]) : 0,
      );

      return { success: true, data: { ...stats, hourlyAvg } };
    },
  );

  // GET /pool — DB connection stats (auth required)
  fastify.get("/pool", { preHandler: [fastify.authenticate] }, async () => {
    return {
      success: true,
      data: {
        maxConnections: 10,
        note: "Pool stats require postgres.js instrumentation",
      },
    };
  });

  // GET /pcs — circuit breaker state (auth required)
  fastify.get("/pcs", { preHandler: [fastify.authenticate] }, async () => {
    return {
      success: true,
      data: {
        state: "closed",
        note: "Wire to actual PCS breaker when plugin exposes it",
      },
    };
  });

  // GET /volume — load/assignment/dispatch counts (auth required)
  fastify.get(
    "/volume",
    { preHandler: [fastify.authenticate] },
    async (_request, reply) => {
      const db = fastify.db;
      if (!db)
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });

      const { loads, assignments } = await import("../../../db/schema.js");
      const { count, gte, eq } = await import("drizzle-orm");

      const now = new Date();
      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [loadsToday] = await db
        .select({ count: count() })
        .from(loads)
        .where(gte(loads.createdAt, todayStart));
      const [loadsWeek] = await db
        .select({ count: count() })
        .from(loads)
        .where(gte(loads.createdAt, weekAgo));
      const [loadsMonth] = await db
        .select({ count: count() })
        .from(loads)
        .where(gte(loads.createdAt, monthAgo));
      const [assignmentsTotal] = await db
        .select({ count: count() })
        .from(assignments);
      const [dispatched] = await db
        .select({ count: count() })
        .from(assignments)
        .where(eq(assignments.status, "dispatched"));

      return {
        success: true,
        data: {
          loads: {
            today: loadsToday.count,
            week: loadsWeek.count,
            month: loadsMonth.count,
          },
          assignments: { total: assignmentsTotal.count },
          dispatched: { total: dispatched.count },
        },
      };
    },
  );

  // GET /presence — active users
  fastify.get("/presence", async () => {
    return {
      success: true,
      data: { activeUsers: [], note: "Wire to presence heartbeat store" },
    };
  });
};

export default diagRoutes;
