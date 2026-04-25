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

  // GET /cron-health — public endpoint usable by external uptime monitors.
  // Returns 200 when ALL configured cron sources have a recent successful
  // run within their expected cadence. Returns 503 (with detail) when
  // any source is stale or last run was a failure. Designed for polling
  // every 5–15 min by UptimeRobot / Better Stack so cron failures
  // surface even if Sentry isn't wired.
  fastify.get("/cron-health", async (_request, reply) => {
    const db = fastify.db;
    if (!db) {
      return reply.status(503).send({
        success: false,
        data: { healthy: false, reason: "db not connected" },
      });
    }
    const { syncRuns } = await import("../../../db/schema.js");
    const { desc, eq } = await import("drizzle-orm");

    // Per-source max-staleness in minutes. PCS = 15 min cron + 5 min grace.
    // JotForm = 30 min cron + 10 min grace. PropX/Logistiq run every 4 hr
    // during business hours so we use 5 hr to absorb the gap.
    const STALENESS_BUDGET_MIN: Record<string, number> = {
      pcs: 20,
      jotform: 40,
      propx: 300,
      logistiq: 300,
      automap: 300,
    };

    const checks: Array<{
      source: string;
      ok: boolean;
      reason?: string;
      lastRun?: { status: string; minutesAgo: number };
    }> = [];

    for (const [source, budgetMin] of Object.entries(STALENESS_BUDGET_MIN)) {
      const [latest] = await db
        .select({
          status: syncRuns.status,
          startedAt: syncRuns.startedAt,
        })
        .from(syncRuns)
        .where(
          eq(
            syncRuns.source,
            source as "propx" | "logistiq" | "automap" | "jotform" | "pcs",
          ),
        )
        .orderBy(desc(syncRuns.startedAt))
        .limit(1);

      if (!latest) {
        checks.push({
          source,
          ok: false,
          reason: "no runs recorded yet",
        });
        continue;
      }
      const minutesAgo = Math.floor(
        (Date.now() - latest.startedAt.getTime()) / 60_000,
      );
      const tooOld = minutesAgo > budgetMin;
      const failed = latest.status === "failed";
      checks.push({
        source,
        ok: !tooOld && !failed,
        reason: failed
          ? `last run failed`
          : tooOld
            ? `${minutesAgo}m old (budget ${budgetMin}m)`
            : undefined,
        lastRun: { status: latest.status, minutesAgo },
      });
    }

    const allOk = checks.every((c) => c.ok);
    return reply.status(allOk ? 200 : 503).send({
      success: allOk,
      data: {
        healthy: allOk,
        checks,
        checkedAt: new Date().toISOString(),
      },
    });
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

      const sources = [
        "propx",
        "logistiq",
        "automap",
        "jotform",
        "pcs",
      ] as const;
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

  // GET /match-accuracy — visible matcher-learning signal for dispatchers
  // ----------------------------------------------------------------------
  // Every human action on an assignment writes a row to `match_decisions`
  // with a canonical `action` label. The tuner reads those rows to re-weight
  // the scorer, but dispatchers deserve a visible version too — a 7-day
  // accept-rate pill on the Home page so they can see the matcher getting
  // smarter (or not).
  //
  // Action-label mapping:
  //   accept   = bulk_confirm | advance:* | route:confirm
  //              (human agreed with the matcher and moved the load forward)
  //   override = route:* (except route:confirm) | flag_back
  //              (human disagreed and re-routed / demoted)
  //
  // Auto-promotion stats come from `assignments.auto_map_tier` (1/2/3) and
  // `photo_status` so the UI can show "X of Y Tier 1 have photos (Z%)",
  // which is the photo-gate rule made visible.
  fastify.get(
    "/match-accuracy",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
    },
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

      const { matchDecisions, assignments } =
        await import("../../../db/schema.js");
      const { sql, gte } = await import("drizzle-orm");

      const windowDays = 7;
      const windowStart = new Date(
        Date.now() - windowDays * 24 * 60 * 60 * 1000,
      );

      // Shared SQL fragments so "accept" / "override" are defined in one
      // place. Kept in a constant so if the decision vocabulary grows we
      // update it once.
      const isAccept = sql`(
        ${matchDecisions.action} = 'bulk_confirm'
        OR ${matchDecisions.action} LIKE 'advance:%'
        OR ${matchDecisions.action} = 'route:confirm'
      )`;
      const isOverride = sql`(
        ${matchDecisions.action} = 'flag_back'
        OR (
          ${matchDecisions.action} LIKE 'route:%'
          AND ${matchDecisions.action} <> 'route:confirm'
        )
      )`;

      const [overallRow, tierRows, assignmentTotalsRow, dailyRows] =
        await Promise.all([
          // Overall 7-day counts
          db
            .select({
              decisionsCount: sql<number>`cast(count(*) as int)`,
              acceptCount: sql<number>`cast(count(*) filter (where ${isAccept}) as int)`,
              overrideCount: sql<number>`cast(count(*) filter (where ${isOverride}) as int)`,
            })
            .from(matchDecisions)
            .where(gte(matchDecisions.createdAt, windowStart)),

          // Per-tier breakdown via tier_before (what the scorer said when
          // the human decided)
          db
            .select({
              tierBefore: matchDecisions.tierBefore,
              decisionsCount: sql<number>`cast(count(*) as int)`,
              acceptCount: sql<number>`cast(count(*) filter (where ${isAccept}) as int)`,
            })
            .from(matchDecisions)
            .where(gte(matchDecisions.createdAt, windowStart))
            .groupBy(matchDecisions.tierBefore),

          // Auto-promotion snapshot from the assignments table
          db
            .select({
              totalAssignments: sql<number>`cast(count(*) as int)`,
              tier1Count: sql<number>`cast(count(*) filter (where ${assignments.autoMapTier} = 1) as int)`,
              withPhotoCount: sql<number>`cast(count(*) filter (where ${assignments.autoMapTier} = 1 and ${assignments.photoStatus} = 'attached') as int)`,
            })
            .from(assignments),

          // Daily buckets, oldest-first — use to_char so timezone stays
          // stable (server-local is fine for an MSP tool)
          db
            .select({
              date: sql<string>`to_char(${matchDecisions.createdAt}, 'YYYY-MM-DD')`,
              decisionsCount: sql<number>`cast(count(*) as int)`,
              acceptCount: sql<number>`cast(count(*) filter (where ${isAccept}) as int)`,
            })
            .from(matchDecisions)
            .where(gte(matchDecisions.createdAt, windowStart))
            .groupBy(sql`to_char(${matchDecisions.createdAt}, 'YYYY-MM-DD')`)
            .orderBy(sql`to_char(${matchDecisions.createdAt}, 'YYYY-MM-DD')`),
        ]);

      const overall = overallRow[0] ?? {
        decisionsCount: 0,
        acceptCount: 0,
        overrideCount: 0,
      };

      const rateOrZero = (num: number, denom: number) =>
        denom > 0 ? num / denom : 0;

      // Tier buckets — make sure all 3 slots are present even when the
      // window has no decisions for a given tier. Scorer emits 'tier1'/
      // 'tier2'/'tier3' as lowercase strings in match-scorer.service.ts.
      const tierBuckets: Record<
        "tier1" | "tier2" | "tier3",
        { count: number; acceptRate: number }
      > = {
        tier1: { count: 0, acceptRate: 0 },
        tier2: { count: 0, acceptRate: 0 },
        tier3: { count: 0, acceptRate: 0 },
      };
      for (const row of tierRows) {
        const key = row.tierBefore as "tier1" | "tier2" | "tier3";
        if (key === "tier1" || key === "tier2" || key === "tier3") {
          tierBuckets[key] = {
            count: row.decisionsCount,
            acceptRate: rateOrZero(row.acceptCount, row.decisionsCount),
          };
        }
      }

      // Build a full 7-day array oldest→newest so the UI can render a
      // fixed-width sparkline without having to pad client-side. Missing
      // days get acceptRate: null so the UI can show a muted/empty slot.
      const dailyByDate = new Map<
        string,
        { acceptCount: number; decisionsCount: number }
      >();
      for (const row of dailyRows) {
        dailyByDate.set(row.date, {
          acceptCount: row.acceptCount,
          decisionsCount: row.decisionsCount,
        });
      }
      const daily: Array<{
        date: string;
        acceptRate: number | null;
        decisionsCount: number;
      }> = [];
      const today = new Date();
      for (let i = windowDays - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const key = `${yyyy}-${mm}-${dd}`;
        const found = dailyByDate.get(key);
        daily.push({
          date: key,
          decisionsCount: found?.decisionsCount ?? 0,
          acceptRate:
            found && found.decisionsCount > 0
              ? found.acceptCount / found.decisionsCount
              : null,
        });
      }

      const autoPromotion = assignmentTotalsRow[0] ?? {
        totalAssignments: 0,
        tier1Count: 0,
        withPhotoCount: 0,
      };

      return {
        success: true,
        data: {
          windowDays,
          overall: {
            decisionsCount: overall.decisionsCount,
            acceptRate: rateOrZero(overall.acceptCount, overall.decisionsCount),
            overrideRate: rateOrZero(
              overall.overrideCount,
              overall.decisionsCount,
            ),
          },
          byTier: tierBuckets,
          autoPromotion: {
            totalAssignments: autoPromotion.totalAssignments,
            tier1Count: autoPromotion.tier1Count,
            tier1PctOfTotal: rateOrZero(
              autoPromotion.tier1Count,
              autoPromotion.totalAssignments,
            ),
            withPhotoCount: autoPromotion.withPhotoCount,
            withPhotoPctOfTier1: rateOrZero(
              autoPromotion.withPhotoCount,
              autoPromotion.tier1Count,
            ),
          },
          daily,
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

  // GET /week-counts — count loads delivered in a given Sun-Sat week, in
  // America/Chicago. Used to compare v2 against the Load Count Sheet's
  // "Total Built" cell. Defaults to last completed week if from/to omitted.
  fastify.get("/week-counts", async (request, reply) => {
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
    const { sql } = await import("drizzle-orm");

    const q = (request.query ?? {}) as { from?: string; to?: string };
    const fromDate = q.from ?? "2026-04-12"; // Sun
    const toDate = q.to ?? "2026-04-18"; // Sat

    const fromTs = `${fromDate}T00:00:00-05:00`;
    const toTs = `${toDate}T23:59:59.999-05:00`;

    // Count strategy A: loads delivered in the window (truth-source aligned).
    // Strategy B: loads with assignment status past 'assigned' that were
    // touched in the window (work-completed aligned).
    const [byDeliveredOn, byBuiltStatus, byBuiltStatusAndDelivered] =
      await Promise.all([
        db
          .select({
            source: loads.source,
            total: sql<number>`cast(count(*) as int)`,
          })
          .from(loads)
          .where(
            sql`${loads.deliveredOn} >= ${fromTs}::timestamptz AND ${loads.deliveredOn} <= ${toTs}::timestamptz`,
          )
          .groupBy(loads.source),

        db
          .select({
            assignmentStatus: assignments.status,
            total: sql<number>`cast(count(*) as int)`,
          })
          .from(assignments)
          .innerJoin(loads, sql`${loads.id} = ${assignments.loadId}`)
          .where(
            sql`${loads.deliveredOn} >= ${fromTs}::timestamptz
                AND ${loads.deliveredOn} <= ${toTs}::timestamptz
                AND ${assignments.status} NOT IN ('pending','cancelled','failed')`,
          )
          .groupBy(assignments.status),

        db
          .select({
            total: sql<number>`cast(count(distinct ${loads.id}) as int)`,
          })
          .from(loads)
          .innerJoin(assignments, sql`${loads.id} = ${assignments.loadId}`)
          .where(
            sql`${loads.deliveredOn} >= ${fromTs}::timestamptz
                AND ${loads.deliveredOn} <= ${toTs}::timestamptz
                AND ${assignments.status} NOT IN ('pending','cancelled','failed')`,
          ),
      ]);

    const sumLoads = byDeliveredOn.reduce((a, r) => a + r.total, 0);
    const sumAssignments = byBuiltStatus.reduce((a, r) => a + r.total, 0);
    const distinctLoadsBuilt = byBuiltStatusAndDelivered[0]?.total ?? 0;

    return {
      success: true,
      data: {
        window: { from: fromDate, to: toDate, tz: "America/Chicago" },
        loadsByDeliveredOn: {
          total: sumLoads,
          bySource: byDeliveredOn.reduce<Record<string, number>>((acc, r) => {
            acc[r.source] = r.total;
            return acc;
          }, {}),
        },
        assignmentsBuilt: {
          total: sumAssignments,
          distinctLoads: distinctLoadsBuilt,
          byStatus: byBuiltStatus.reduce<Record<string, number>>((acc, r) => {
            acc[r.assignmentStatus] = r.total;
            return acc;
          }, {}),
        },
        compareTo: {
          sheetTotalBuilt: 1509,
          sheetExpected: 1426,
          sheetDiscrepancy: 83,
          note: "Compare loadsByDeliveredOn.total OR assignmentsBuilt.distinctLoads to sheetTotalBuilt for parity check.",
        },
      },
    };
  });

  // GET /week-classify — for every load delivered in the window, walk back
  // through every signal we have (PropX status, PCS bridge, assignment state,
  // duplicate cluster, attribution) and bucket the load into one cause class.
  // Mutually-exclusive buckets, sum equals total ingested. The "truly missed"
  // bucket is the demo-actionable residual.
  fastify.get("/week-classify", async (request, reply) => {
    const db = fastify.db;
    if (!db)
      return reply.status(503).send({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Database not connected",
        },
      });

    const { loads, assignments, pcsKnownTickets } =
      await import("../../../db/schema.js");
    const { sql, eq, and, inArray } = await import("drizzle-orm");

    const q = (request.query ?? {}) as { from?: string; to?: string };
    const fromDate = q.from ?? "2026-04-12";
    const toDate = q.to ?? "2026-04-18";
    const fromTs = `${fromDate}T00:00:00-05:00`;
    const toTs = `${toDate}T23:59:59.999-05:00`;

    // Pull every load in the window (full row, we need raw_data for status check)
    const rows = await db
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
        rawData: loads.rawData,
      })
      .from(loads)
      .where(
        sql`${loads.deliveredOn} >= ${fromTs}::timestamptz AND ${loads.deliveredOn} <= ${toTs}::timestamptz`,
      );

    const total = rows.length;
    const ids = rows.map((r) => r.id);

    // Pull assignment status for all loads in window
    const asgRows = ids.length
      ? await db
          .select({
            loadId: assignments.loadId,
            status: assignments.status,
          })
          .from(assignments)
          .where(inArray(assignments.loadId, ids))
      : [];
    const asgByLoad = new Map<number, string[]>();
    for (const a of asgRows) {
      const arr = asgByLoad.get(a.loadId) ?? [];
      arr.push(a.status);
      asgByLoad.set(a.loadId, arr);
    }

    // Pull PCS known tickets — match by bolNo or ticketNo
    const pcsRows = await db
      .select({
        shipperTicket: pcsKnownTickets.shipperTicket,
      })
      .from(pcsKnownTickets);
    const pcsTickets = new Set(
      pcsRows.map((r) => r.shipperTicket?.trim().toLowerCase()).filter(Boolean),
    );

    // Build duplicate-cluster signature: lowercased driver + delivered_on date + rounded weight
    const sigCount = new Map<string, number>();
    const sigFor = (r: (typeof rows)[number]): string | null => {
      const d = (r.driverName ?? "").trim().toLowerCase();
      const day = r.deliveredOn ? r.deliveredOn.toISOString().slice(0, 10) : "";
      const w = r.weightTons ? Math.round(Number(r.weightTons) * 2) / 2 : 0;
      if (!d || !day) return null;
      return `${d}|${day}|${w}`;
    };
    for (const r of rows) {
      const s = sigFor(r);
      if (s) sigCount.set(s, (sigCount.get(s) ?? 0) + 1);
    }

    // Bucketize hierarchically: first-match wins
    const buckets = {
      cancelled_in_source: { count: 0, sample: [] as number[] },
      built_in_pcs: { count: 0, sample: [] as number[] },
      built_in_v2_workflow: { count: 0, sample: [] as number[] },
      likely_duplicate_ingest: { count: 0, sample: [] as number[] },
      unattributed_orphan: { count: 0, sample: [] as number[] },
      truly_missed: { count: 0, sample: [] as number[] },
    };

    for (const r of rows) {
      const status = (
        (r.rawData as Record<string, unknown> | null)?.status ??
        (r.rawData as Record<string, unknown> | null)?.load_status ??
        ""
      )
        .toString()
        .toLowerCase();

      if (
        status === "cancelled" ||
        status === "canceled" ||
        status === "transfered" ||
        status === "transferred"
      ) {
        if (buckets.cancelled_in_source.sample.length < 5)
          buckets.cancelled_in_source.sample.push(r.id);
        buckets.cancelled_in_source.count++;
        continue;
      }

      const ticketKey = (r.bolNo ?? r.ticketNo ?? "").trim().toLowerCase();
      if (ticketKey && pcsTickets.has(ticketKey)) {
        if (buckets.built_in_pcs.sample.length < 5)
          buckets.built_in_pcs.sample.push(r.id);
        buckets.built_in_pcs.count++;
        continue;
      }

      const asgs = asgByLoad.get(r.id) ?? [];
      const advanced = asgs.some(
        (s) => s !== "pending" && s !== "cancelled" && s !== "failed",
      );
      if (advanced) {
        if (buckets.built_in_v2_workflow.sample.length < 5)
          buckets.built_in_v2_workflow.sample.push(r.id);
        buckets.built_in_v2_workflow.count++;
        continue;
      }

      const sig = sigFor(r);
      if (sig && (sigCount.get(sig) ?? 0) > 1) {
        if (buckets.likely_duplicate_ingest.sample.length < 5)
          buckets.likely_duplicate_ingest.sample.push(r.id);
        buckets.likely_duplicate_ingest.count++;
        continue;
      }

      if (
        !r.driverName ||
        r.driverName.trim() === "" ||
        !r.destinationName ||
        r.destinationName.trim() === ""
      ) {
        if (buckets.unattributed_orphan.sample.length < 5)
          buckets.unattributed_orphan.sample.push(r.id);
        buckets.unattributed_orphan.count++;
        continue;
      }

      if (buckets.truly_missed.sample.length < 10)
        buckets.truly_missed.sample.push(r.id);
      buckets.truly_missed.count++;
    }

    const sumBuckets = Object.values(buckets).reduce((a, b) => a + b.count, 0);

    // Forward-walk diagnostics: rebuild full per-bucket ID lists so we can
    // characterize the unexplained populations by source + give walkable samples.
    const allBucketIds: Record<string, number[]> = {
      cancelled_in_source: [],
      built_in_pcs: [],
      built_in_v2_workflow: [],
      likely_duplicate_ingest: [],
      unattributed_orphan: [],
      truly_missed: [],
    };
    for (const r of rows) {
      const status = (
        (r.rawData as Record<string, unknown> | null)?.status ??
        (r.rawData as Record<string, unknown> | null)?.load_status ??
        ""
      )
        .toString()
        .toLowerCase();
      if (
        status === "cancelled" ||
        status === "canceled" ||
        status === "transfered" ||
        status === "transferred"
      ) {
        allBucketIds.cancelled_in_source.push(r.id);
        continue;
      }
      const ticketKey = (r.bolNo ?? r.ticketNo ?? "").trim().toLowerCase();
      if (ticketKey && pcsTickets.has(ticketKey)) {
        allBucketIds.built_in_pcs.push(r.id);
        continue;
      }
      const asgs = asgByLoad.get(r.id) ?? [];
      const advanced = asgs.some(
        (s) => s !== "pending" && s !== "cancelled" && s !== "failed",
      );
      if (advanced) {
        allBucketIds.built_in_v2_workflow.push(r.id);
        continue;
      }
      const sig = sigFor(r);
      if (sig && (sigCount.get(sig) ?? 0) > 1) {
        allBucketIds.likely_duplicate_ingest.push(r.id);
        continue;
      }
      if (
        !r.driverName ||
        r.driverName.trim() === "" ||
        !r.destinationName ||
        r.destinationName.trim() === ""
      ) {
        allBucketIds.unattributed_orphan.push(r.id);
        continue;
      }
      allBucketIds.truly_missed.push(r.id);
    }

    const sourceBreakdown = (loadIds: number[]) => {
      const breakdown: Record<string, number> = {};
      for (const id of loadIds) {
        const row = rows.find((r) => r.id === id);
        if (!row) continue;
        breakdown[row.source] = (breakdown[row.source] ?? 0) + 1;
      }
      return breakdown;
    };

    // PCS bridge sanity — does the PCS sync actually cover this window?
    const pcsStatsRow = await db
      .select({
        total: sql<number>`cast(count(*) as int)`,
        earliest: sql<string | null>`min(pickup_date)::text`,
        latest: sql<string | null>`max(pickup_date)::text`,
      })
      .from(pcsKnownTickets);
    const pcsStats = pcsStatsRow[0] ?? {
      total: 0,
      earliest: null,
      latest: null,
    };

    // Cluster size distribution for duplicates — confirms PropX↔Logistiq pair pattern
    const clusterSizes: Record<string, number> = {};
    for (const sz of sigCount.values()) {
      if (sz >= 2)
        clusterSizes[String(sz)] = (clusterSizes[String(sz)] ?? 0) + 1;
    }

    // Three example duplicate clusters with full member detail
    const dupClusters: Array<{
      signature: string;
      members: Array<{
        id: number;
        source: string;
        bolNo: string | null;
        ticketNo: string | null;
        loadNo: string | null;
      }>;
    }> = [];
    const seenSigs = new Set<string>();
    for (const r of rows) {
      const s = sigFor(r);
      if (s && (sigCount.get(s) ?? 0) > 1 && !seenSigs.has(s)) {
        seenSigs.add(s);
        const members = rows
          .filter((x) => sigFor(x) === s)
          .map((x) => ({
            id: x.id,
            source: x.source,
            bolNo: x.bolNo,
            ticketNo: x.ticketNo,
            loadNo: x.loadNo,
          }));
        dupClusters.push({ signature: s, members });
        if (dupClusters.length >= 3) break;
      }
    }

    // Five truly_missed rows with full identity for walk-through
    const trulyMissedSample = allBucketIds.truly_missed
      .slice(0, 5)
      .map((id) => {
        const r = rows.find((x) => x.id === id)!;
        return {
          id: r.id,
          source: r.source,
          loadNo: r.loadNo,
          bolNo: r.bolNo,
          ticketNo: r.ticketNo,
          driverName: r.driverName,
          destinationName: r.destinationName,
          deliveredOn: r.deliveredOn,
        };
      });

    return {
      success: true,
      data: {
        window: { from: fromDate, to: toDate, tz: "America/Chicago" },
        total,
        bucketSum: sumBuckets,
        bucketSumMatchesTotal: sumBuckets === total,
        buckets,
        bucketBySource: {
          cancelled_in_source: sourceBreakdown(
            allBucketIds.cancelled_in_source,
          ),
          built_in_pcs: sourceBreakdown(allBucketIds.built_in_pcs),
          built_in_v2_workflow: sourceBreakdown(
            allBucketIds.built_in_v2_workflow,
          ),
          likely_duplicate_ingest: sourceBreakdown(
            allBucketIds.likely_duplicate_ingest,
          ),
          unattributed_orphan: sourceBreakdown(
            allBucketIds.unattributed_orphan,
          ),
          truly_missed: sourceBreakdown(allBucketIds.truly_missed),
        },
        duplicateAnalysis: {
          clusterSizeDistribution: clusterSizes,
          sampleClusters: dupClusters,
        },
        trulyMissedSample,
        pcsBridge: {
          knownTicketsTotal: pcsStats.total,
          earliestPickupDate: pcsStats.earliest,
          latestPickupDate: pcsStats.latest,
          windowCovered: !!(
            pcsStats.earliest &&
            pcsStats.latest &&
            pcsStats.earliest <= toDate &&
            pcsStats.latest >= fromDate
          ),
        },
        compareTo: {
          sheetTotalBuilt: 1509,
          v2Ingested: total,
          v2EstimatedUniqueAfterDedup: Math.round(
            total - allBucketIds.likely_duplicate_ingest.length / 2,
          ),
          gap: total - 1509,
          note: "Bucket counts hierarchical — first-match wins. truly_missed is the actionable residual to walk through with Jessica.",
        },
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

  // GET /scope-discovery — surfaces the two scope-expansion signals
  // together: (1) flywheel historical discovery — wells seen in 3 years
  // of dispatch that v2 doesn't know about; (2) PCS-sync missed-by-v2
  // — active PCS loads that don't resolve to a v2 assignment. The
  // admin review queue renders both as tabs.
  //
  // Pull-style: reads the flywheel JSON artifact from the repo docs
  // folder (written by the 2026-04-23 discovery run) and the latest
  // PCS sync response. No DB writes here — this endpoint is for the
  // review queue UI, which dispatches any "add well / onboard" action
  // through the existing wells admin routes.
  fastify.get(
    "/scope-discovery",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] },
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

      const { readFile } = await import("node:fs/promises");
      const { join, dirname } = await import("node:path");
      const { fileURLToPath } = await import("node:url");

      // Resolve the JSON at runtime. Production (Railway) ships the
      // artifact in backend/resources/ (copied by the Dockerfile's final
      // stage). Local dev can also fall back to the repo-root docs/
      // folder. Check both shapes so the endpoint works in either env.
      const hereDir = dirname(fileURLToPath(import.meta.url));
      const candidates = [
        // Production: /app/resources/flywheel-discovery-2026-04-23.json
        join(process.cwd(), "resources/flywheel-discovery-2026-04-23.json"),
        // Dev (backend/): ../resources/flywheel-discovery-2026-04-23.json
        join(
          hereDir,
          "../../../../resources/flywheel-discovery-2026-04-23.json",
        ),
        // Repo-root fallback (original artifact location)
        join(hereDir, "../../../../../docs/2026-04-23-flywheel-discovery.json"),
        join(hereDir, "../../../../docs/2026-04-23-flywheel-discovery.json"),
        join(process.cwd(), "docs/2026-04-23-flywheel-discovery.json"),
        join(process.cwd(), "../docs/2026-04-23-flywheel-discovery.json"),
      ];

      interface FlywheelWell {
        name: string;
        loads: number;
        earliest: string;
        latest: string;
        top_city: string;
        divisions: number;
        in_v2: boolean;
        classification: string;
      }
      interface FlywheelArtifact {
        stats: Record<string, unknown>;
        buckets: {
          well: FlywheelWell[];
          sandplant?: FlywheelWell[];
          other?: FlywheelWell[];
        };
      }

      let flywheel: FlywheelArtifact | null = null;
      for (const path of candidates) {
        try {
          const raw = await readFile(path, "utf8");
          flywheel = JSON.parse(raw) as FlywheelArtifact;
          break;
        } catch {
          // try the next candidate path
        }
      }

      // Latest PCS sync response — runs every 15 min, so reading the
      // last completed run gives us the current missedByV2 snapshot
      // without re-hitting PCS on every queue render. If no prior run
      // exists, fall back to an empty list (UI shows "awaiting first
      // sync" state).
      const { eq, desc, and } = await import("drizzle-orm");
      const { dataIntegrityRuns } = await import("../../../db/schema.js");
      const [latestPcsSync] = await db
        .select({
          ranAt: dataIntegrityRuns.ranAt,
          completedAt: dataIntegrityRuns.completedAt,
          status: dataIntegrityRuns.status,
          metadata: dataIntegrityRuns.metadata,
        })
        .from(dataIntegrityRuns)
        .where(
          and(
            eq(dataIntegrityRuns.scriptName, "pcs-sync-loads"),
            eq(dataIntegrityRuns.status, "completed"),
          ),
        )
        .orderBy(desc(dataIntegrityRuns.ranAt))
        .limit(1);

      const wells = flywheel?.buckets.well ?? [];
      // Sort by historical volume — highest-impact wells surface first
      // in the review queue. Matches how Jessica's team prioritizes.
      wells.sort((a, b) => b.loads - a.loads);

      return {
        success: true,
        data: {
          generatedAt: new Date().toISOString(),
          flywheel: {
            stats: flywheel?.stats ?? null,
            wells,
            sandplants: flywheel?.buckets.sandplant ?? [],
            otherCount: flywheel?.buckets.other?.length ?? 0,
          },
          latestPcsSync: latestPcsSync
            ? {
                ranAt: latestPcsSync.ranAt,
                completedAt: latestPcsSync.completedAt,
                metadata: latestPcsSync.metadata,
              }
            : null,
        },
      };
    },
  );
  // GET /discrepancies — open cross-check discrepancies (auth required)
  // Optional filters: ?type=status_drift|weight_drift|... &severity=warning
  // &assignmentId=123  &includeResolved=true
  fastify.get<{
    Querystring: {
      type?: string;
      severity?: string;
      assignmentId?: string;
      includeResolved?: string;
      limit?: string;
    };
  }>(
    "/discrepancies",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const db = fastify.db;
      if (!db)
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });

      const { discrepancies, assignments, loads, wells } =
        await import("../../../db/schema.js");
      const { and, desc, eq, isNull, sql } = await import("drizzle-orm");

      const limit = Math.min(
        Number.parseInt(request.query.limit ?? "200", 10) || 200,
        500,
      );

      const conditions = [];
      if (!request.query.includeResolved) {
        conditions.push(isNull(discrepancies.resolvedAt));
      }
      if (request.query.type) {
        conditions.push(
          eq(
            discrepancies.discrepancyType,
            request.query.type as "status_drift",
          ),
        );
      }
      if (request.query.severity) {
        conditions.push(
          eq(discrepancies.severity, request.query.severity as "info"),
        );
      }
      if (request.query.assignmentId) {
        const aid = Number.parseInt(request.query.assignmentId, 10);
        if (Number.isFinite(aid)) {
          conditions.push(eq(discrepancies.assignmentId, aid));
        }
      }

      const rows = await db
        .select({
          id: discrepancies.id,
          subjectKey: discrepancies.subjectKey,
          assignmentId: discrepancies.assignmentId,
          loadId: discrepancies.loadId,
          discrepancyType: discrepancies.discrepancyType,
          severity: discrepancies.severity,
          v2Value: discrepancies.v2Value,
          pcsValue: discrepancies.pcsValue,
          message: discrepancies.message,
          metadata: discrepancies.metadata,
          detectedAt: discrepancies.detectedAt,
          lastSeenAt: discrepancies.lastSeenAt,
          resolvedAt: discrepancies.resolvedAt,
          resolutionNotes: discrepancies.resolutionNotes,
          ticketNo: loads.ticketNo,
          loadNo: loads.loadNo,
          wellName: wells.name,
        })
        .from(discrepancies)
        .leftJoin(assignments, eq(discrepancies.assignmentId, assignments.id))
        .leftJoin(loads, eq(discrepancies.loadId, loads.id))
        .leftJoin(wells, eq(assignments.wellId, wells.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(discrepancies.detectedAt))
        .limit(limit);

      const [summary] = await db
        .select({
          openTotal: sql<number>`COUNT(*) FILTER (WHERE ${discrepancies.resolvedAt} IS NULL)::int`,
        })
        .from(discrepancies);

      const byTypeRows = await db
        .select({
          discrepancyType: discrepancies.discrepancyType,
          n: sql<number>`COUNT(*)::int`,
        })
        .from(discrepancies)
        .where(isNull(discrepancies.resolvedAt))
        .groupBy(discrepancies.discrepancyType);

      const byType: Record<string, number> = {};
      for (const r of byTypeRows) byType[r.discrepancyType] = r.n;

      return {
        success: true,
        data: {
          generatedAt: new Date().toISOString(),
          summary: {
            openTotal: summary?.openTotal ?? 0,
            byType,
          },
          discrepancies: rows,
        },
      };
    },
  );

  // POST /discrepancies/:id/resolve — manually mark a discrepancy resolved
  // (admin action; auto-resolve still happens via sweep when the underlying
  // condition heals).
  fastify.post<{
    Params: { id: string };
    Body: { notes?: string };
  }>(
    "/discrepancies/:id/resolve",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const db = fastify.db;
      if (!db)
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });

      const id = Number.parseInt(request.params.id, 10);
      if (!Number.isFinite(id)) {
        return reply.status(400).send({
          success: false,
          error: { code: "BAD_REQUEST", message: "Invalid id" },
        });
      }

      const { discrepancies } = await import("../../../db/schema.js");
      const { eq } = await import("drizzle-orm");
      const userId = (request.user as { id?: number } | undefined)?.id ?? null;

      const [updated] = await db
        .update(discrepancies)
        .set({
          resolvedAt: new Date(),
          resolvedBy: userId,
          resolutionNotes: request.body?.notes ?? "manually resolved",
        })
        .where(eq(discrepancies.id, id))
        .returning({
          id: discrepancies.id,
          resolvedAt: discrepancies.resolvedAt,
        });

      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Discrepancy not found" },
        });
      }

      return { success: true, data: updated };
    },
  );
};

export default diagRoutes;
