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

  // GET /historical-stats — auditable proof of what's captured in the archive
  // Used by the archive page to show "N loads captured, M complete and searchable"
  // Also the source-of-truth when explaining data coverage to stakeholders.
  fastify.get("/historical-stats", async (_request, reply) => {
    const db = fastify.db;
    if (!db)
      return reply.status(503).send({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Database not connected",
        },
      });

    const { loads } = await import("../../../db/schema.js");
    const { sql, desc, eq, and, isNotNull } = await import("drizzle-orm");

    // Totals + breakdown queries run in parallel for efficiency
    const [
      totalsRow,
      sourceBreakdown,
      reasonBreakdown,
      completenessRow,
      dateRangeRow,
      sampleRecent,
    ] = await Promise.all([
      db
        .select({
          total: sql<number>`cast(count(*) as int)`,
          historicalComplete: sql<number>`cast(count(*) filter (where historical_complete = true) as int)`,
          pendingValidation: sql<number>`cast(count(*) filter (where historical_complete = false) as int)`,
        })
        .from(loads),

      db
        .select({
          source: loads.source,
          total: sql<number>`cast(count(*) as int)`,
          complete: sql<number>`cast(count(*) filter (where historical_complete = true) as int)`,
        })
        .from(loads)
        .groupBy(loads.source),

      db
        .select({
          reason: loads.historicalCompleteReason,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(loads)
        .where(isNotNull(loads.historicalCompleteReason))
        .groupBy(loads.historicalCompleteReason),

      db
        .select({
          hasBol: sql<number>`cast(count(*) filter (where coalesce(nullif(trim(bol_no), ''), '') <> '') as int)`,
          hasTicket: sql<number>`cast(count(*) filter (where coalesce(nullif(trim(ticket_no), ''), '') <> '') as int)`,
          hasDriver: sql<number>`cast(count(*) filter (where coalesce(nullif(trim(driver_name), ''), '') <> '') as int)`,
          hasWeight: sql<number>`cast(count(*) filter (where weight_tons is not null or weight_lbs is not null) as int)`,
          hasDeliveredOn: sql<number>`cast(count(*) filter (where delivered_on is not null) as int)`,
        })
        .from(loads),

      db
        .select({
          earliest: sql<string | null>`min(delivered_on)::text`,
          latest: sql<string | null>`max(delivered_on)::text`,
        })
        .from(loads),

      db
        .select({
          id: loads.id,
          source: loads.source,
          loadNo: loads.loadNo,
          bolNo: loads.bolNo,
          ticketNo: loads.ticketNo,
          driverName: loads.driverName,
          destinationName: loads.destinationName,
          weightTons: loads.weightTons,
          deliveredOn: loads.deliveredOn,
          historicalComplete: loads.historicalComplete,
          historicalCompleteReason: loads.historicalCompleteReason,
        })
        .from(loads)
        .where(eq(loads.historicalComplete, true))
        .orderBy(desc(loads.deliveredOn))
        .limit(10),
    ]);

    const totals = totalsRow[0] ?? {
      total: 0,
      historicalComplete: 0,
      pendingValidation: 0,
    };
    const completeness = completenessRow[0] ?? {
      hasBol: 0,
      hasTicket: 0,
      hasDriver: 0,
      hasWeight: 0,
      hasDeliveredOn: 0,
    };
    const dateRange = dateRangeRow[0] ?? { earliest: null, latest: null };

    return {
      success: true,
      data: {
        totals: {
          total: totals.total,
          historicalComplete: totals.historicalComplete,
          pendingValidation: totals.pendingValidation,
          historicalCompletePct:
            totals.total > 0
              ? Math.round((totals.historicalComplete / totals.total) * 100)
              : 0,
        },
        bySource: sourceBreakdown.reduce<
          Record<string, { total: number; complete: number }>
        >((acc, row) => {
          acc[row.source] = { total: row.total, complete: row.complete };
          return acc;
        }, {}),
        byReason: reasonBreakdown.reduce<Record<string, number>>((acc, row) => {
          if (row.reason) acc[row.reason] = row.count;
          return acc;
        }, {}),
        completeness: {
          hasBOL: completeness.hasBol,
          hasTicket: completeness.hasTicket,
          hasDriver: completeness.hasDriver,
          hasWeight: completeness.hasWeight,
          hasDeliveredOn: completeness.hasDeliveredOn,
        },
        dateRange: {
          earliest: dateRange.earliest,
          latest: dateRange.latest,
        },
        sampleRecent,
      },
    };
  });
};

export default diagRoutes;
