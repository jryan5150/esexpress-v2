import { type FastifyPluginAsync } from "fastify";
import { perfBuffer } from "../../../lib/perf-buffer.js";

/** Paths whose latency is bottlenecked by upstream third parties, not our
 *  code. Excluded from p95 health signal so a slow PropX / JotForm API
 *  doesn't trip our status red when the app itself is fine. The proxied
 *  photo endpoints fetch server-side from `publicapis.propx.com` (6-7s
 *  response times are routine) and JotForm's CDN. Their slowness is real
 *  user-visible latency but it's an external signal, not ours. */
const EXTERNAL_LATENCY_PATHS = ["/api/v1/verification/photos/proxy"];

const diagRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /health — overall system status (public)
  // Only 5xx counts as a server error — 4xx (esp. 401/403) is client-side
  // (bad token, missing auth) and shouldn't trip the banner. Minimum sample
  // size of 20 prevents a single error from flipping status after restart
  // while the perf buffer is still filling. External-proxy latency is
  // excluded from the p95 calc per EXTERNAL_LATENCY_PATHS above.
  fastify.get("/health", async () => {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const raw = perfBuffer.getEntries(since);
    const entries = raw.filter(
      (e) => !EXTERNAL_LATENCY_PATHS.some((p) => e.path.startsWith(p)),
    );

    const count = entries.length;
    const sampleTooSmall = count < 20;

    let serverErrors = 0;
    for (const e of entries) if (e.statusCode >= 500) serverErrors++;
    const errorRate = count > 0 ? serverErrors / count : 0;

    const sortedRt = entries.map((e) => e.responseTimeMs).sort((a, b) => a - b);
    const p95 =
      sortedRt.length > 0
        ? sortedRt[
            Math.min(sortedRt.length - 1, Math.ceil(sortedRt.length * 0.95) - 1)
          ]
        : 0;

    let status: "green" | "yellow" | "red" = "green";
    if (!sampleTooSmall) {
      if (errorRate > 0.1 || p95 > 5000) status = "red";
      else if (errorRate > 0.02 || p95 > 2000) status = "yellow";
    }

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

  // GET /missed-loads — pull-style report Jessica runs when she suspects
  // something was missed in sync. Surfaces:
  //   • duplicate BOLs (same BOL appearing in 2+ source rows)
  //   • recent sync errors (last 7 days)
  //   • loads missing all critical identifiers (no driver, BOL, or ticket)
  //   • stale-sync loads (delivered_on > 2 days before created_at)
  // Pull, not push — no notifications/webhooks. Jessica navigates here
  // when she wants to check.
  fastify.get(
    "/missed-loads",
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

      const { sql, desc, gte } = await import("drizzle-orm");
      const { loads, syncRuns } = await import("../../../db/schema.js");
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [duplicateBolRows, syncErrorRows, missingFieldRows, staleSyncRows] =
        await Promise.all([
          // Duplicate BOLs across sources (or within the same source if it
          // somehow re-inserted)
          db
            .select({
              bolNo: loads.bolNo,
              count: sql<number>`cast(count(*) as int)`,
              sources: sql<string>`string_agg(distinct ${loads.source}, ', ')`,
              loadIds: sql<string>`string_agg(${loads.id}::text, ', ' order by ${loads.id})`,
              latestDelivery: sql<
                string | null
              >`max(${loads.deliveredOn})::text`,
            })
            .from(loads)
            .where(
              sql`${loads.bolNo} is not null and trim(${loads.bolNo}) <> ''`,
            )
            .groupBy(loads.bolNo)
            .having(sql`count(*) > 1`)
            .orderBy(sql`count(*) desc`)
            .limit(50),

          // Recent sync runs that recorded errors
          db
            .select({
              id: syncRuns.id,
              source: syncRuns.source,
              status: syncRuns.status,
              startedAt: syncRuns.startedAt,
              durationMs: syncRuns.durationMs,
              recordsProcessed: syncRuns.recordsProcessed,
              error: syncRuns.error,
              metadata: syncRuns.metadata,
            })
            .from(syncRuns)
            .where(gte(syncRuns.startedAt, sevenDaysAgo))
            .orderBy(desc(syncRuns.startedAt))
            .limit(25),

          // Loads with no driver, no BOL, and no ticket — likely incomplete
          db
            .select({
              id: loads.id,
              source: loads.source,
              loadNo: loads.loadNo,
              destinationName: loads.destinationName,
              deliveredOn: loads.deliveredOn,
              createdAt: loads.createdAt,
            })
            .from(loads)
            .where(
              sql`(${loads.driverName} is null or trim(${loads.driverName}) = '') and (${loads.bolNo} is null or trim(${loads.bolNo}) = '') and (${loads.ticketNo} is null or trim(${loads.ticketNo}) = '')`,
            )
            .orderBy(desc(loads.createdAt))
            .limit(50),

          // Stale sync — load arrived more than 2 days after delivery
          db
            .select({
              id: loads.id,
              source: loads.source,
              loadNo: loads.loadNo,
              driverName: loads.driverName,
              deliveredOn: loads.deliveredOn,
              createdAt: loads.createdAt,
              lagDays: sql<number>`cast(extract(day from (${loads.createdAt} - ${loads.deliveredOn})) as int)`,
            })
            .from(loads)
            .where(
              sql`${loads.deliveredOn} is not null and ${loads.createdAt} > ${loads.deliveredOn} + interval '2 days'`,
            )
            .orderBy(desc(sql`${loads.createdAt} - ${loads.deliveredOn}`))
            .limit(50),
        ]);

      return {
        success: true,
        data: {
          generatedAt: new Date().toISOString(),
          summary: {
            duplicateBolGroups: duplicateBolRows.length,
            syncErrorRuns: syncErrorRows.filter(
              (r) => r.status === "failed" || !!r.error,
            ).length,
            missingCriticalFields: missingFieldRows.length,
            staleSyncLoads: staleSyncRows.length,
          },
          duplicateBols: duplicateBolRows,
          syncErrors: syncErrorRows,
          missingCriticalFields: missingFieldRows,
          staleSyncLoads: staleSyncRows,
        },
      };
    },
  );
};

export default diagRoutes;
