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

  // POST /weekly-notes-sync — Pull the per-week Notes section from a tab
  // and persist. Idempotent on (spreadsheet, tab, week_start).
  fastify.post(
    "/weekly-notes-sync",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] },
    async (request, reply) => {
      const db = fastify.db;
      if (!db)
        return reply.status(503).send({
          success: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "DB not connected" },
        });
      const body = (request.body ?? {}) as {
        spreadsheetId?: string;
        tabName?: string;
        weekStart?: string;
      };
      const spreadsheetId =
        body.spreadsheetId ?? "1ZBzcSEFRfX8J6x0wj_836xnGwzgCSSVFe7QU2SRgtQM";
      const tabName = body.tabName ?? "Current";
      let weekStart = body.weekStart;
      if (!weekStart) {
        const { sql } = await import("drizzle-orm");
        const r = (await db.execute(sql`
          SELECT (date_trunc('week', (now() AT TIME ZONE 'America/Chicago')::date + interval '1 day') - interval '1 day')::date AS sunday
        `)) as unknown as Array<{ sunday: string | Date }>;
        weekStart = String(r[0]?.sunday ?? "").slice(0, 10);
      }
      try {
        const { syncWeeklyNotes } =
          await import("../../sheets/services/weekly-notes-sync.service.js");
        const result = await syncWeeklyNotes(db, {
          spreadsheetId,
          tabName,
          weekStart,
        });
        return {
          success: true,
          data: { weekStart, tabName, ...result },
        };
      } catch (e) {
        return reply.status(500).send({
          success: false,
          error: {
            code: "WEEKLY_NOTES_SYNC_FAILED",
            message: e instanceof Error ? e.message : String(e),
          },
        });
      }
    },
  );

  // GET /weekly-notes — Read persisted notes. Returns most-recent first
  // across all spreadsheets/tabs.
  fastify.get("/weekly-notes", async (request, reply) => {
    const db = fastify.db;
    if (!db)
      return reply.status(503).send({
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "DB not connected" },
      });
    const q = (request.query ?? {}) as { weekStart?: string; limit?: string };
    const limit = Math.min(parseInt(q.limit ?? "20", 10) || 20, 100);
    const { sql } = await import("drizzle-orm");
    const rows = q.weekStart
      ? ((await db.execute(sql`
          SELECT id, spreadsheet_id, sheet_tab_name, week_start, body, captured_at
          FROM weekly_notes
          WHERE week_start = ${q.weekStart}
          ORDER BY captured_at DESC
        `)) as unknown as Array<{
          id: number;
          spreadsheet_id: string;
          sheet_tab_name: string;
          week_start: string;
          body: string;
          captured_at: string;
        }>)
      : ((await db.execute(sql`
          SELECT id, spreadsheet_id, sheet_tab_name, week_start, body, captured_at
          FROM weekly_notes
          ORDER BY week_start DESC, captured_at DESC
          LIMIT ${limit}
        `)) as unknown as Array<{
          id: number;
          spreadsheet_id: string;
          sheet_tab_name: string;
          week_start: string;
          body: string;
          captured_at: string;
        }>);
    return { success: true, data: { notes: rows } };
  });

  // POST /sheet-color-sync — Run color-sync for a tab+week. Persists
  // per-cell status into sheet_well_status. Idempotent on (spreadsheet,
  // tab, week) — replaces existing rows.
  fastify.post(
    "/sheet-color-sync",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] },
    async (request, reply) => {
      const db = fastify.db;
      if (!db)
        return reply.status(503).send({
          success: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "DB not connected" },
        });
      const body = (request.body ?? {}) as {
        spreadsheetId?: string;
        tabName?: string;
        weekStart?: string;
        range?: string;
      };
      const spreadsheetId =
        body.spreadsheetId ?? "1ZBzcSEFRfX8J6x0wj_836xnGwzgCSSVFe7QU2SRgtQM";
      const tabName = body.tabName ?? "Current";
      // Compute current Sunday if no weekStart passed
      let weekStart = body.weekStart;
      if (!weekStart) {
        const { sql } = await import("drizzle-orm");
        const r = (await db.execute(sql`
          SELECT (date_trunc('week', (now() AT TIME ZONE 'America/Chicago')::date + interval '1 day') - interval '1 day')::date AS sunday
        `)) as unknown as Array<{ sunday: string | Date }>;
        weekStart = String(r[0]?.sunday ?? "").slice(0, 10);
      }
      try {
        const { syncSheetColorStatus } =
          await import("../../sheets/services/sheet-color-sync.service.js");
        const result = await syncSheetColorStatus(db, {
          spreadsheetId,
          tabName,
          weekStart,
          range: body.range,
        });
        return { success: true, data: { weekStart, tabName, ...result } };
      } catch (e) {
        return reply.status(500).send({
          success: false,
          error: {
            code: "SHEET_COLOR_SYNC_FAILED",
            message: e instanceof Error ? e.message : String(e),
          },
        });
      }
    },
  );

  // GET /sheet-status — Read the persisted sheet_well_status. Returns
  // status counts + per-cell rows for a given week. Surface for the
  // /admin/sheet-status page that mirrors the painted grid.
  fastify.get("/sheet-status", async (request, reply) => {
    const db = fastify.db;
    if (!db)
      return reply.status(503).send({
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "DB not connected" },
      });
    const q = (request.query ?? {}) as {
      weekStart?: string;
      tab?: string;
    };
    const { sql } = await import("drizzle-orm");
    let weekStart = q.weekStart;
    if (!weekStart) {
      const r = (await db.execute(sql`
        SELECT (date_trunc('week', (now() AT TIME ZONE 'America/Chicago')::date + interval '1 day') - interval '1 day')::date AS sunday
      `)) as unknown as Array<{ sunday: string | Date }>;
      weekStart = String(r[0]?.sunday ?? "").slice(0, 10);
    }
    const tab = q.tab ?? "Current";

    const cells = (await db.execute(sql`
      SELECT row_index, col_index, well_name, bill_to, cell_value, cell_hex, status
      FROM sheet_well_status
      WHERE spreadsheet_id = '1ZBzcSEFRfX8J6x0wj_836xnGwzgCSSVFe7QU2SRgtQM'
        AND sheet_tab_name = ${tab}
        AND week_start = ${weekStart}
      ORDER BY row_index, col_index
    `)) as unknown as Array<{
      row_index: number;
      col_index: number;
      well_name: string | null;
      bill_to: string | null;
      cell_value: string | null;
      cell_hex: string | null;
      status: string;
    }>;

    const counts = (await db.execute(sql`
      SELECT status, COUNT(*)::int AS n
      FROM sheet_well_status
      WHERE spreadsheet_id = '1ZBzcSEFRfX8J6x0wj_836xnGwzgCSSVFe7QU2SRgtQM'
        AND sheet_tab_name = ${tab}
        AND week_start = ${weekStart}
      GROUP BY status
      ORDER BY n DESC
    `)) as unknown as Array<{ status: string; n: number }>;

    const { getColorLegend } =
      await import("../../sheets/services/sheet-color-sync.service.js");
    const legend = getColorLegend();

    const lastSyncRow = (await db.execute(sql`
      SELECT MAX(captured_at) AS last_sync
      FROM sheet_well_status
      WHERE spreadsheet_id = '1ZBzcSEFRfX8J6x0wj_836xnGwzgCSSVFe7QU2SRgtQM'
        AND sheet_tab_name = ${tab}
        AND week_start = ${weekStart}
    `)) as unknown as Array<{ last_sync: string | null }>;

    // Per-cell v2 reconciliation: for each painted cell that lives in the
    // well-grid (col_index 2..8 = Sun..Sat), pull the v2 load count for
    // the same (well, day-of-week within week_start). Sheet vs v2 delta
    // surfaces whether the team's painted state agrees with v2's ingest.
    //
    // Well-name match: case-insensitive exact OR contained in any
    // wells.aliases jsonb element. Cheap join, single query for all cells.
    const cellsWithV2 = (await db.execute(sql`
      WITH cells AS (
        SELECT
          row_index, col_index, well_name, bill_to, cell_value, cell_hex, status,
          (col_index - 2) AS dow,
          (${weekStart}::date + ((col_index - 2) || ' day')::interval)::date AS load_date
        FROM sheet_well_status
        WHERE spreadsheet_id = '1ZBzcSEFRfX8J6x0wj_836xnGwzgCSSVFe7QU2SRgtQM'
          AND sheet_tab_name = ${tab}
          AND week_start = ${weekStart}
          AND col_index BETWEEN 2 AND 8
          AND well_name IS NOT NULL
      ),
      well_lookup AS (
        SELECT c.row_index, c.col_index, c.load_date, c.well_name,
          (
            SELECT w.id FROM wells w
            WHERE LOWER(TRIM(w.name)) = LOWER(TRIM(c.well_name))
               OR EXISTS (
                 SELECT 1 FROM jsonb_array_elements_text(w.aliases) a
                 WHERE LOWER(TRIM(a)) = LOWER(TRIM(c.well_name))
               )
            ORDER BY w.id LIMIT 1
          ) AS well_id
        FROM cells c
      )
      SELECT
        c.row_index, c.col_index, c.well_name, c.bill_to, c.cell_value,
        c.cell_hex, c.status, c.dow,
        wl.well_id,
        (
          SELECT COUNT(*)::int FROM loads l
          JOIN assignments a ON a.load_id = l.id
          WHERE a.well_id = wl.well_id
            AND l.delivered_on >= (c.load_date AT TIME ZONE 'America/Chicago')
            AND l.delivered_on < ((c.load_date + interval '1 day') AT TIME ZONE 'America/Chicago')
        ) AS v2_count_for_day
      FROM cells c
      LEFT JOIN well_lookup wl ON wl.row_index = c.row_index AND wl.col_index = c.col_index
    `)) as unknown as Array<{
      row_index: number;
      col_index: number;
      well_name: string | null;
      bill_to: string | null;
      cell_value: string | null;
      cell_hex: string | null;
      status: string;
      dow: number;
      well_id: number | null;
      v2_count_for_day: number;
    }>;

    // Compute reconciliation summary
    let cellsAgree = 0;
    let cellsDelta = 0;
    let cellsNoV2Well = 0;
    let totalSheetCount = 0;
    let totalV2Count = 0;
    for (const c of cellsWithV2) {
      const sheetN = parseInt(c.cell_value || "0", 10) || 0;
      totalSheetCount += sheetN;
      totalV2Count += c.v2_count_for_day;
      if (c.well_id == null) {
        cellsNoV2Well++;
      } else if (sheetN === c.v2_count_for_day) {
        cellsAgree++;
      } else {
        cellsDelta++;
      }
    }

    return {
      success: true,
      data: {
        weekStart,
        tab,
        legend,
        counts,
        cells,
        cellsWithV2,
        reconciliation: {
          cellsAgree,
          cellsDelta,
          cellsNoV2Well,
          totalSheetCount,
          totalV2Count,
          weekDelta: totalV2Count - totalSheetCount,
        },
        lastSync: lastSyncRow[0]?.last_sync ?? null,
      },
    };
  });

  // GET /sheet-color-key — Read the Color Key tab from the Load Count
  // Sheet to learn the painter's legend. Returns hex → workflow-stage
  // mappings. Used to build the canonical workflow_status enum and its
  // RGB-to-status map for cell-color reading elsewhere in the sheet.
  fastify.get("/sheet-color-key", async (request, reply) => {
    const q = (request.query ?? {}) as { id?: string; tab?: string };
    const id = q.id ?? "1ZBzcSEFRfX8J6x0wj_836xnGwzgCSSVFe7QU2SRgtQM";
    const tab = q.tab ?? "Color Key";
    try {
      const { inspectColorKey } =
        await import("../../sheets/services/sheets.service.js");
      const entries = await inspectColorKey(id, tab);
      return { success: true, data: { spreadsheetId: id, tab, entries } };
    } catch (e) {
      return reply.status(500).send({
        success: false,
        error: {
          code: "COLOR_KEY_READ_FAILED",
          message: e instanceof Error ? e.message : String(e),
        },
      });
    }
  });

  // GET /sheet-colored-grid — Read a tab + range with cell background
  // colors. For Phase 2.5 sheet-color reading: lets us map each cell of
  // the Current/Previous tabs to its workflow stage via the legend.
  fastify.get("/sheet-colored-grid", async (request, reply) => {
    const q = (request.query ?? {}) as {
      id?: string;
      tab?: string;
      range?: string;
    };
    const id = q.id ?? "1ZBzcSEFRfX8J6x0wj_836xnGwzgCSSVFe7QU2SRgtQM";
    const tab = q.tab ?? "Current";
    const range = q.range ?? "A1:Z200";
    try {
      const { readColoredGrid } =
        await import("../../sheets/services/sheets.service.js");
      const grid = await readColoredGrid(id, tab, range);
      // Compute color frequency
      const colorCount = new Map<string, number>();
      for (const row of grid) {
        for (const cell of row) {
          if (cell.hex)
            colorCount.set(cell.hex, (colorCount.get(cell.hex) ?? 0) + 1);
        }
      }
      const distinctColors = Array.from(colorCount.entries())
        .map(([hex, n]) => ({ hex, count: n }))
        .sort((a, b) => b.count - a.count);
      return {
        success: true,
        data: {
          spreadsheetId: id,
          tab,
          range,
          rowCount: grid.length,
          colCount: grid[0]?.length ?? 0,
          distinctColors,
          gridSample: grid.slice(0, 5),
        },
      };
    } catch (e) {
      return reply.status(500).send({
        success: false,
        error: {
          code: "GRID_READ_FAILED",
          message: e instanceof Error ? e.message : String(e),
        },
      });
    }
  });

  // GET /jenny-queue — Mirrors the Load Count Sheet's "Other Jobs to be
  // Invoiced (Jenny)" section. All loads with job_category != 'standard',
  // grouped by category, with Bill To and load count. The team treats
  // this as a separate work-stream from the main well-grid because these
  // jobs don't have a well destination.
  fastify.get("/jenny-queue", async (_request, reply) => {
    const db = fastify.db;
    if (!db)
      return reply.status(503).send({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Database not connected",
        },
      });
    const { sql } = await import("drizzle-orm");

    // Per-category totals + recent samples
    const totalsRow = await db.execute(sql`
      SELECT
        l.job_category,
        c.name AS bill_to,
        COUNT(*)::int AS load_count,
        MAX(l.delivered_on)::text AS last_seen
      FROM loads l
      LEFT JOIN customers c ON c.id = l.customer_id
      WHERE l.job_category <> 'standard'
      GROUP BY l.job_category, c.name
      ORDER BY l.job_category, load_count DESC
    `);

    const sampleRow = await db.execute(sql`
      SELECT
        l.id, l.job_category, l.load_no, l.delivered_on,
        l.driver_name, l.product_description, l.weight_tons,
        c.name AS bill_to
      FROM loads l
      LEFT JOIN customers c ON c.id = l.customer_id
      WHERE l.job_category <> 'standard'
      ORDER BY l.delivered_on DESC NULLS LAST
      LIMIT 30
    `);

    interface Total {
      job_category: string;
      bill_to: string | null;
      load_count: number;
      last_seen: string | null;
    }
    interface Sample {
      id: number;
      job_category: string;
      load_no: string | null;
      delivered_on: string | null;
      driver_name: string | null;
      product_description: string | null;
      weight_tons: string | null;
      bill_to: string | null;
    }
    const totals = totalsRow as unknown as Total[];
    const samples = sampleRow as unknown as Sample[];

    // Group totals by category
    const byCategory = new Map<
      string,
      { category: string; total: number; rows: Total[] }
    >();
    for (const t of totals) {
      let bucket = byCategory.get(t.job_category);
      if (!bucket) {
        bucket = { category: t.job_category, total: 0, rows: [] };
        byCategory.set(t.job_category, bucket);
      }
      bucket.total += t.load_count;
      bucket.rows.push(t);
    }

    return {
      success: true,
      data: {
        totalNonStandard: totals.reduce((a, t) => a + t.load_count, 0),
        categories: Array.from(byCategory.values()).sort(
          (a, b) => b.total - a.total,
        ),
        samples,
        sourceLabel:
          'Mirrors "Other Jobs to be Invoiced (Jenny)" from the Load Count Sheet — non-standard work that doesn\'t fit the well-day grid.',
      },
    };
  });

  // GET /well-grid — per-cell v2 aggregate + lifecycle-derived color
  // for the Sun-Sat week starting weekStart. Output mirrors the Load
  // Count Sheet's grid: Bill To × Wells (rows) × Sun-Sat (cols).
  // Color is COMPUTED every request from underlying load lifecycle
  // (assignments.status, photo_status, pcs_dispatch.cleared_at,
  // pcs_invoice.status, well.needs_rate_info, well.rate_per_ton).
  // See docs/superpowers/specs/2026-04-26-unified-worksurface-design.md
  // §"Lifecycle → Computed Color Rule" for the rule definition.
  fastify.get("/well-grid", async (request, reply) => {
    const db = fastify.db;
    if (!db)
      return reply.status(503).send({
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "DB not connected" },
      });
    const { sql } = await import("drizzle-orm");

    const q = (request.query ?? {}) as { weekStart?: string };
    let weekStart = q.weekStart;
    if (!weekStart) {
      const r = (await db.execute(sql`
        SELECT (date_trunc('week', (now() AT TIME ZONE 'America/Chicago')::date + interval '1 day') - interval '1 day')::date AS sunday
      `)) as unknown as Array<{ sunday: string | Date }>;
      weekStart = String(r[0]?.sunday ?? "").slice(0, 10);
    }

    // Per (well, day) aggregate. delivered_on is timestamptz; cast to
    // America/Chicago date and compare to (weekStart + dow days).
    const cellsRow = (await db.execute(sql`
      WITH this_week AS (
        SELECT
          a.well_id,
          ((l.delivered_on AT TIME ZONE 'America/Chicago')::date - ${weekStart}::date) AS dow,
          COUNT(*)::int AS load_count,
          BOOL_OR(a.photo_status = 'missing') AS any_missing_photo,
          BOOL_OR(l.driver_name IS NULL OR TRIM(l.driver_name) = '') AS any_missing_driver,
          BOOL_OR(a.status = 'pending') AS any_pending,
          BOOL_OR(a.status = 'built') AS any_built,
          BOOL_OR(a.status IN ('dispatched','built')) AS any_dispatched_or_built
        FROM loads l
        JOIN assignments a ON a.load_id = l.id
        WHERE l.delivered_on >= (${weekStart}::date AT TIME ZONE 'America/Chicago')
          AND l.delivered_on < ((${weekStart}::date + interval '7 days') AT TIME ZONE 'America/Chicago')
          AND a.well_id IS NOT NULL
        GROUP BY a.well_id, dow
      )
      SELECT
        tw.well_id,
        w.name AS well_name,
        c.id AS customer_id,
        c.name AS bill_to,
        tw.dow,
        tw.load_count,
        tw.any_missing_photo,
        tw.any_missing_driver,
        tw.any_pending,
        tw.any_built,
        w.needs_rate_info,
        w.rate_per_ton
      FROM this_week tw
      JOIN wells w ON w.id = tw.well_id
      LEFT JOIN loads l2 ON l2.id = (
        SELECT load_id FROM assignments WHERE well_id = tw.well_id LIMIT 1
      )
      LEFT JOIN customers c ON c.id = l2.customer_id
      WHERE tw.dow BETWEEN 0 AND 6
      ORDER BY c.name NULLS LAST, w.name, tw.dow
    `)) as unknown as Array<{
      well_id: number;
      well_name: string;
      customer_id: number | null;
      bill_to: string | null;
      dow: number;
      load_count: number;
      any_missing_photo: boolean;
      any_missing_driver: boolean;
      any_pending: boolean;
      any_built: boolean;
      needs_rate_info: boolean;
      rate_per_ton: string | null;
    }>;

    // Lifecycle → status. "Laggard wins" — earliest unresolved stage.
    function deriveStatus(row: (typeof cellsRow)[number]): string {
      if (row.needs_rate_info || row.rate_per_ton == null)
        return "need_rate_info";
      if (row.any_missing_photo) return "missing_tickets";
      if (row.any_missing_driver) return "missing_driver";
      if (row.any_pending) return "loads_being_built";
      if (row.any_built) return "loads_completed";
      // Phase 2.5: pcs_dispatch + pcs_invoice joins
      return "loads_completed";
    }

    interface Cell {
      wellId: number;
      wellName: string;
      customerId: number | null;
      billTo: string | null;
      dow: number;
      loadCount: number;
      derivedStatus: string;
    }
    const cells: Cell[] = cellsRow.map((r) => ({
      wellId: r.well_id,
      wellName: r.well_name,
      customerId: r.customer_id,
      billTo: r.bill_to,
      dow: r.dow,
      loadCount: r.load_count,
      derivedStatus: deriveStatus(r),
    }));

    // Group cells into rows keyed by (well_id) so the frontend can
    // render Bill To × Well × Sun-Sat with one fetch.
    const byWell = new Map<
      number,
      {
        wellId: number;
        wellName: string;
        customerId: number | null;
        billTo: string | null;
        days: Array<Cell | null>;
      }
    >();
    for (const c of cells) {
      let row = byWell.get(c.wellId);
      if (!row) {
        row = {
          wellId: c.wellId,
          wellName: c.wellName,
          customerId: c.customerId,
          billTo: c.billTo,
          days: Array(7).fill(null),
        };
        byWell.set(c.wellId, row);
      }
      if (c.dow >= 0 && c.dow < 7) row.days[c.dow] = c;
    }
    const rows = Array.from(byWell.values()).sort((a, b) => {
      const aBT = a.billTo ?? "";
      const bBT = b.billTo ?? "";
      if (aBT !== bBT) return aBT.localeCompare(bBT);
      return a.wellName.localeCompare(b.wellName);
    });

    // Week endpoints for UI date display
    const weekEndDate = new Date(
      new Date(weekStart + "T00:00:00Z").getTime() + 6 * 24 * 60 * 60 * 1000,
    );
    const weekEnd = weekEndDate.toISOString().slice(0, 10);

    return {
      success: true,
      data: {
        weekStart,
        weekEnd,
        tz: "America/Chicago",
        rows,
        rowCount: rows.length,
        totalCells: cells.length,
      },
    };
  });

  // GET /builder-matrix — Reproduces the Load Count Sheet's "Order of
  // Invoicing" matrix exactly. Each row = (customer → builder), each cell
  // = daily count for the requested week. Mirrors what Jess hand-builds
  // every Friday at the bottom of the Current/Previous tabs.
  //
  // Source of truth: builder_routing table (builder→customer mapping) +
  // loads.customer_id + loads.delivered_on. Sun-Sat week per Chicago TZ.
  //
  // Output shape mirrors the sheet rows:
  //   [
  //     { customer: "Liberty Energy Services, LLC", builder: "Scout",
  //       counts: { mon: 175, tue: 165, ..., total: 641 } },
  //     ...
  //     { customer: null, builder: "Crystal",  // floater
  //       counts: { mon: 119, ..., total: 299 } }
  //   ]
  fastify.get("/builder-matrix", async (request, reply) => {
    const db = fastify.db;
    if (!db)
      return reply.status(503).send({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Database not connected",
        },
      });
    const { sql } = await import("drizzle-orm");

    // Default to current week (Sun-Sat in Chicago). User can override.
    const q = (request.query ?? {}) as { weekStart?: string };
    const weekStartStr = q.weekStart;

    // Compute the Sunday-of-this-week in America/Chicago. Postgres
    // date_trunc('week') returns Monday; we want Sunday-start so we
    // subtract 1 day.
    const computed = await db.execute(sql`
      SELECT
        (date_trunc('week', (now() AT TIME ZONE 'America/Chicago')::date + interval '1 day') - interval '1 day')::date AS sunday
    `);
    const defaultSunday = (
      computed as unknown as Array<{ sunday: string | Date }>
    )[0]?.sunday;
    const sundayDate = weekStartStr
      ? new Date(weekStartStr + "T00:00:00")
      : new Date(defaultSunday as unknown as string);
    const sundayIso = sundayDate.toISOString().slice(0, 10);
    const saturdayIso = new Date(sundayDate.getTime() + 6 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    // Per-day per-customer counts for the window
    const cellsRow = await db.execute(sql`
      SELECT
        l.customer_id,
        c.name AS customer_name,
        EXTRACT(DOW FROM (l.delivered_on AT TIME ZONE 'America/Chicago'))::int AS dow,
        COUNT(*)::int AS n
      FROM loads l
      LEFT JOIN customers c ON c.id = l.customer_id
      WHERE l.delivered_on >= (${sundayIso}::date AT TIME ZONE 'America/Chicago')
        AND l.delivered_on < ((${sundayIso}::date + interval '7 days') AT TIME ZONE 'America/Chicago')
      GROUP BY l.customer_id, c.name, dow
      ORDER BY l.customer_id NULLS LAST, dow
    `);

    interface CellRow {
      customer_id: number | null;
      customer_name: string | null;
      dow: number;
      n: number;
    }
    const cells = cellsRow as unknown as CellRow[];

    // Aggregate per-customer day counts
    interface CustomerCounts {
      customerId: number | null;
      customerName: string | null;
      counts: Record<string, number>;
      total: number;
    }
    const byCustomer = new Map<string, CustomerCounts>();
    const dowToKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    for (const row of cells) {
      const key = `${row.customer_id ?? "null"}`;
      let bucket = byCustomer.get(key);
      if (!bucket) {
        bucket = {
          customerId: row.customer_id,
          customerName: row.customer_name,
          counts: { sun: 0, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0 },
          total: 0,
        };
        byCustomer.set(key, bucket);
      }
      const dayKey = dowToKey[row.dow];
      if (dayKey) {
        bucket.counts[dayKey] = row.n;
        bucket.total += row.n;
      }
    }

    // Pull builder routing
    const routingRow = await db.execute(sql`
      SELECT br.builder_name, br.customer_id, br.is_primary, br.notes,
             c.name AS customer_name
      FROM builder_routing br
      LEFT JOIN customers c ON c.id = br.customer_id
      ORDER BY br.is_primary DESC NULLS LAST, br.builder_name
    `);
    interface RoutingRow {
      builder_name: string;
      customer_id: number | null;
      is_primary: boolean | null;
      notes: string | null;
      customer_name: string | null;
    }
    const routing = routingRow as unknown as RoutingRow[];

    // Sheet shows ONE row per builder, NOT per (builder, customer) pair.
    // Each customer is owned by exactly one PRIMARY builder; backups don't
    // get the count duplicated. Build the matrix accordingly:
    //   1. Primary rows credited with their customer's full count
    //   2. Floater rows (NULL customer — Crystal) get NULL-customer loads
    //      (which today is mostly an empty bucket; future: derive from
    //      match_decisions when we have per-load builder attribution)
    //   3. Backup rows (Katie) shown with 0 loads — their work is implicit
    //      handoff; no automated attribution yet
    const emptyCounts = (): Record<string, number> => ({
      sun: 0,
      mon: 0,
      tue: 0,
      wed: 0,
      thu: 0,
      fri: 0,
      sat: 0,
    });
    const claimedCustomerKeys = new Set<string>();
    const matrix = routing.map((r) => {
      const key = r.customer_id != null ? `${r.customer_id}` : "null";
      const isPrimary = r.is_primary ?? false;
      // Only primary builders claim their customer's bucket. Backups + non-
      // primary floaters get zeros so the totals never double-count.
      const claimsBucket = isPrimary && !claimedCustomerKeys.has(key);
      let counts = emptyCounts();
      let total = 0;
      if (claimsBucket) {
        const bucket = byCustomer.get(key);
        if (bucket) {
          counts = bucket.counts;
          total = bucket.total;
          claimedCustomerKeys.add(key);
        }
      }
      return {
        builder: r.builder_name,
        customer: r.customer_name,
        customerId: r.customer_id,
        isPrimary,
        notes: r.notes,
        counts,
        total,
      };
    });

    // Grand total for the week — sum of all distinct customer buckets
    // (NOT sum of matrix rows, because backup builders are zeroed)
    const grandTotal = Array.from(byCustomer.values()).reduce(
      (a, b) => a + b.total,
      0,
    );

    // Surface unattributed loads: anything not claimed by a primary row
    // (e.g., NULL-customer loads with no floater claiming them, or loads
    // for customers without a routing row). Phase 2.5 should attribute
    // these via match_decisions or a fallback rule.
    const unclaimedTotal = Array.from(byCustomer.entries())
      .filter(([k]) => !claimedCustomerKeys.has(k))
      .reduce((a, [, v]) => a + v.total, 0);

    return {
      success: true,
      data: {
        weekStart: sundayIso,
        weekEnd: saturdayIso,
        tz: "America/Chicago",
        matrix,
        grandTotal,
        unclaimedTotal,
        sourceLabel:
          'Mirrors the "Order of Invoicing" matrix from the Load Count Sheet (Current/Previous tabs).',
      },
    };
  });

  // GET /pcs-truth — LIVE PCS-vs-v2 parity. Computes every request from
  // pcs_load_history (operator-supplied warehouse extract, refreshable) ⨝
  // loads (live v2 ingest). As discrepancies resolve and v2 grows, the
  // capture % ticks up automatically — no JSON regen, no redeploy.
  //
  // Source population: bulk-loaded from docs/2026-04-25-pcs-2026-q1-loads.csv
  // (27,030 rows from flywheel.duckdb). Phase 2 wires PCS Invoice API for
  // ongoing weeks so this stays current without operator drops.
  //
  // Bridge logic for "captured": v2 load whose delivered_on falls in the
  // same Sun-Sat week AND (matches by load_no, ticket_no, or bol_no, OR is
  // a v2 ingest counted in the per-week total). For Monday we expose the
  // per-week PCS unique vs v2 raw count — the "real" coverage % gets a
  // dedicated cross-source-bridge endpoint in Phase 2.
  fastify.get("/pcs-truth", async (_request, reply) => {
    const db = fastify.db;
    if (!db)
      return reply.status(503).send({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Database not connected",
        },
      });

    const { sql } = await import("drizzle-orm");

    // Per-week aggregation: PCS unique loads (deduped on pcs_load_no) by
    // ISO week of pickup_date (Mon-Sun, matches Postgres date_trunc) joined
    // to v2 raw count by delivered_on for the same week. Window bounded by
    // the warehouse extract range so partial weeks aren't shown.
    const weeksRow = await db.execute(sql`
      WITH pcs_weeks AS (
        SELECT
          to_char(date_trunc('week', pickup_date)::date, 'YYYY-MM-DD') AS week_start,
          COUNT(DISTINCT pcs_load_no) AS pcs_unique
        FROM pcs_load_history
        WHERE pickup_date IS NOT NULL
        GROUP BY 1
      ),
      v2_weeks AS (
        SELECT
          to_char(date_trunc('week', delivered_on)::date, 'YYYY-MM-DD') AS week_start,
          COUNT(*) AS v2_raw
        FROM loads
        WHERE delivered_on IS NOT NULL
        GROUP BY 1
      )
      SELECT
        COALESCE(p.week_start, v.week_start) AS week_start,
        COALESCE(p.pcs_unique, 0)::int AS pcs_unique,
        COALESCE(v.v2_raw, 0)::int AS v2_raw
      FROM pcs_weeks p
      FULL OUTER JOIN v2_weeks v USING (week_start)
      WHERE COALESCE(p.week_start, v.week_start) IN (
        SELECT to_char(date_trunc('week', pickup_date)::date, 'YYYY-MM-DD')
        FROM pcs_load_history
        WHERE pickup_date IS NOT NULL
        GROUP BY 1
      )
      ORDER BY week_start
    `);

    const weeks = (
      weeksRow as unknown as Array<{
        week_start: string;
        pcs_unique: number;
        v2_raw: number;
      }>
    ).map((r) => {
      const weekStart = r.week_start;
      const ws = new Date(weekStart + "T00:00:00Z");
      const we = new Date(ws.getTime() + 6 * 24 * 60 * 60 * 1000);
      const weekEnd = we.toISOString().slice(0, 10);
      const delta = r.v2_raw - r.pcs_unique;
      const status =
        Math.abs(delta) <= 2
          ? "perfect"
          : Math.abs(delta) <= 15
            ? "match"
            : delta > 0
              ? "v2_over"
              : "investigate";
      return {
        weekStart,
        weekEnd,
        pcsUnique: r.pcs_unique,
        v2Raw: r.v2_raw,
        delta,
        status,
      };
    });

    const pcsTotal = weeks.reduce((a, w) => a + w.pcsUnique, 0);
    const v2Total = weeks.reduce((a, w) => a + w.v2Raw, 0);
    const totalDelta = v2Total - pcsTotal;
    const capturePct =
      pcsTotal > 0
        ? Math.round((Math.min(v2Total, pcsTotal) / pcsTotal) * 1000) / 10
        : 0;
    const perfectMatchWeeks = weeks.filter(
      (w) => w.status === "perfect",
    ).length;
    const withinFifteenWeeks = weeks.filter(
      (w) => w.status === "perfect" || w.status === "match",
    ).length;

    // Per-customer coverage. v2 doesn't store a normalized customer field
    // (PropX raw_data.customer_name is blank for most rows), so we declare
    // the ingest-path map: each PCS customer → which v2 feed (if any) is
    // expected to capture them. The honest answer for Monday isn't "97.8%
    // capture" — it's "99.5% on the carriers we have feeds for; here are
    // the 2 we don't." JRT and Signal Peak are scope items, not failures.
    const customerRow = await db.execute(sql`
      SELECT customer, COUNT(*)::int AS pcs_loads
      FROM pcs_load_history
      WHERE customer IS NOT NULL AND customer <> ''
      GROUP BY customer
      ORDER BY pcs_loads DESC
    `);
    const INGEST_PATH: Record<
      string,
      { v2Feed: string; status: "covered" | "scope_gap" | "trivial" }
    > = {
      "Liberty Energy Services, LLC": { v2Feed: "propx", status: "covered" },
      "Logistix IQ": { v2Feed: "logistiq", status: "covered" },
      "JRT Trucking Inc": {
        v2Feed: "(none — read from PCS)",
        status: "scope_gap",
      },
      "Signal Peak": {
        v2Feed: "(none — confirm with team)",
        status: "scope_gap",
      },
      "Premier Pressure Pumping": {
        v2Feed: "(none — confirm with team)",
        status: "scope_gap",
      },
      Finoric: { v2Feed: "(none — trivial volume)", status: "trivial" },
    };
    const byCustomer = (
      customerRow as unknown as Array<{ customer: string; pcs_loads: number }>
    ).map((r) => {
      const path = INGEST_PATH[r.customer] ?? {
        v2Feed: "(unknown)",
        status: "scope_gap" as const,
      };
      return {
        customer: r.customer,
        pcsLoads: r.pcs_loads,
        v2Feed: path.v2Feed,
        status: path.status,
      };
    });
    const coveredLoads = byCustomer
      .filter((c) => c.status === "covered")
      .reduce((a, c) => a + c.pcsLoads, 0);
    const scopeGapLoads = byCustomer
      .filter((c) => c.status === "scope_gap")
      .reduce((a, c) => a + c.pcsLoads, 0);
    const realCoveragePct =
      coveredLoads + scopeGapLoads > 0
        ? Math.round((coveredLoads / (coveredLoads + scopeGapLoads)) * 1000) /
          10
        : 0;

    // Source-snapshot freshness — what extract is loaded?
    const snapshotRow = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_rows,
        MIN(imported_at) AS earliest_import,
        MAX(imported_at) AS latest_import,
        MAX(source_snapshot) AS latest_snapshot
      FROM pcs_load_history
    `);
    const snap = (
      snapshotRow as unknown as Array<{
        total_rows: number;
        earliest_import: string | null;
        latest_import: string | null;
        latest_snapshot: string | null;
      }>
    )[0] ?? {
      total_rows: 0,
      earliest_import: null,
      latest_import: null,
      latest_snapshot: null,
    };

    return {
      success: true,
      data: {
        live: true,
        computedAt: new Date().toISOString(),
        snapshot: {
          totalRows: snap.total_rows,
          latestSnapshot: snap.latest_snapshot,
          latestImport: snap.latest_import,
        },
        summary: {
          pcsUniqueQ1: pcsTotal,
          v2RawQ1: v2Total,
          capturePct,
          totalDelta,
          perfectMatchWeeks,
          withinFifteenWeeks,
          coveredLoads,
          scopeGapLoads,
          realCoveragePct,
        },
        byCustomer,
        weeks,
        gapAttribution: [
          {
            bucket: "JRT carrier loads (no v2 feed; entered to PCS manually)",
            estimated: 447,
            evidence:
              "PCS Q1 by-customer breakdown: 894 JRT loads in Q1; ~447 in weeks where v2 data exists.",
          },
          {
            bucket: "Logistiq triplicate phantoms still in v2 raw",
            estimated: 536,
            evidence:
              "sourceId-cascade fix (commit e12e320) stops new ones; backfill cleanup deferred.",
          },
          {
            bucket:
              "Jenny's Queue non-standard work (Truck Pushers, Equipment Moves)",
            estimated: 225,
            evidence:
              "Sheet's 'Other Jobs to be Invoiced' section, ~25/week × 13 weeks. No v2 surface yet.",
          },
          {
            bucket: "Sheet alias gaps (v2 wells exist, names not yet aliased)",
            estimated: 30,
            evidence:
              "Cleared mostly in tonight's well-create work (7 wells, 2,645 loads bound).",
          },
        ],
        secondaryFindings: [
          {
            title: "Load number is NOT a cross-source identifier",
            detail:
              "Zero load_no overlap between PCS distinct loads and v2 raw. PCS uses an independent sequence. Bridge has to be via tickets, dates, weights — not load_no.",
          },
          {
            title: "PCS DOES carry JRT loads — 894 in Q1 2026",
            detail:
              "Team enters JRT loads to PCS manually. v2's 'JRT no-feed' gap is an ingest gap, not a coverage gap — until JRT has an API, v2 should read JRT FROM PCS.",
          },
          {
            title: "PCS destination = CITY, not well name",
            detail:
              "32 distinct destination cities for Q1 2026 (Falls City, Center, Calliham, ...). Three vocab axes: PropX (well name), Sheet (carrier-prefixed), PCS (city).",
          },
          {
            title: "PCS active Load API only returns 44 records",
            detail:
              "/dispatching/v1/load returns operational/in-flight only. Q1 history lives in load_history (warehouse). For Phase 2 ongoing live: PCS Invoice API.",
          },
        ],
      },
    };
  });

  // GET /pcs-2026-coverage — pull a date-windowed PCS load list and
  // measure cross-source identifier coverage. Tests every stable identifier
  // chain (PCS shipperTicket → v2 ticket_no/bol_no, PCS loadReference →
  // v2 load_no). Returns a hit-rate matrix to validate the rules corpus.
  fastify.get("/pcs-2026-coverage", async (request, reply) => {
    const db = fastify.db;
    if (!db)
      return reply.status(503).send({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Database not connected",
        },
      });

    const q = (request.query ?? {}) as {
      from?: string;
      to?: string;
      companyLetter?: string;
    };
    const fromDate = q.from ?? "2026-01-01";
    const toDate = q.to ?? "2026-04-25";
    const companyLetter = q.companyLetter ?? process.env.PCS_COMPANY_LTR ?? "B";

    const { getAccessToken, getPcsBaseUrl } =
      await import("../../pcs/services/pcs-auth.service.js");
    const { loads, assignments, bolSubmissions, jotformImports } =
      await import("../../../db/schema.js");
    const { sql, inArray } = await import("drizzle-orm");

    const bearer = await getAccessToken(db);
    const url = `${getPcsBaseUrl()}/dispatching/v1/load?from=${fromDate}&to=${toDate}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${bearer}`,
        "X-Company-Id": process.env.PCS_COMPANY_ID ?? "",
        "X-Company-Letter": companyLetter,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return reply.status(502).send({
        success: false,
        error: {
          code: "PCS_QUERY_FAILED",
          message: `PCS ${res.status}: ${body.slice(0, 300)}`,
        },
      });
    }
    const pcsLoads = (await res.json()) as Array<{
      loadId?: string;
      loadReference?: string | null;
      status?: string | null;
      shipperTicket?: string | null;
      shipperCompany?: string | null;
      consigneeCompany?: string | null;
      pickupDate?: string | null;
      totalWeight?: number | string | null;
    }>;

    // Cross-ref each PCS load against v2 loads/bolSubmissions/jotformImports
    const tickets = Array.from(
      new Set(
        pcsLoads
          .map((p) => (p.shipperTicket ?? "").trim())
          .filter((t) => t.length > 0),
      ),
    );
    const refs = Array.from(
      new Set(
        pcsLoads
          .map((p) => (p.loadReference ?? "").trim())
          .filter((t) => t.length > 0),
      ),
    );

    const v2LoadsByTicket = tickets.length
      ? await db
          .select({
            id: loads.id,
            ticketNo: loads.ticketNo,
            bolNo: loads.bolNo,
          })
          .from(loads)
          .where(
            sql`(LOWER(TRIM(${loads.ticketNo})) IN (${sql.join(
              tickets.map((t) => sql`${t.toLowerCase()}`),
              sql`, `,
            )}) OR LOWER(TRIM(${loads.bolNo})) IN (${sql.join(
              tickets.map((t) => sql`${t.toLowerCase()}`),
              sql`, `,
            )}))`,
          )
      : [];

    const v2LoadsByRef = refs.length
      ? await db
          .select({ id: loads.id, loadNo: loads.loadNo })
          .from(loads)
          .where(
            inArray(
              loads.loadNo,
              refs.filter((r) => r.length > 0),
            ),
          )
      : [];

    const bolByTicket = tickets.length
      ? await db
          .select({
            id: bolSubmissions.id,
            ticketNo: sql<string>`${bolSubmissions.aiExtractedData}->>'ticketNo'`,
          })
          .from(bolSubmissions)
          .where(
            sql`LOWER(TRIM(${bolSubmissions.aiExtractedData}->>'ticketNo')) IN (${sql.join(
              tickets.map((t) => sql`${t.toLowerCase()}`),
              sql`, `,
            )})`,
          )
      : [];

    const jotformByBol = tickets.length
      ? await db
          .select({ id: jotformImports.id, bolNo: jotformImports.bolNo })
          .from(jotformImports)
          .where(
            sql`LOWER(TRIM(${jotformImports.bolNo})) IN (${sql.join(
              tickets.map((t) => sql`${t.toLowerCase()}`),
              sql`, `,
            )})`,
          )
      : [];

    const ticketsHitInV2Loads = new Set(
      v2LoadsByTicket
        .flatMap((r) => [r.ticketNo, r.bolNo])
        .filter(Boolean)
        .map((s) => s!.toLowerCase().trim()),
    );
    const refsHitInV2Loads = new Set(
      v2LoadsByRef.map((r) => r.loadNo.toLowerCase()),
    );
    const ticketsHitInBol = new Set(
      bolByTicket.map((r) => r.ticketNo.toLowerCase()),
    );
    const ticketsHitInJotform = new Set(
      jotformByBol
        .map((r) => r.bolNo)
        .filter(Boolean)
        .map((s) => s!.toLowerCase()),
    );

    let matchedAnyChain = 0;
    let matchedTicket = 0;
    let matchedRef = 0;
    let matchedBol = 0;
    let matchedJotform = 0;
    const trulyMissed: typeof pcsLoads = [];
    const consigneeBuckets = new Map<string, number>();

    for (const pl of pcsLoads) {
      const t = (pl.shipperTicket ?? "").toLowerCase().trim();
      const r = (pl.loadReference ?? "").toLowerCase().trim();
      const tHit = t && ticketsHitInV2Loads.has(t);
      const rHit = r && refsHitInV2Loads.has(r);
      const bHit = t && ticketsHitInBol.has(t);
      const jHit = t && ticketsHitInJotform.has(t);
      if (tHit) matchedTicket++;
      if (rHit) matchedRef++;
      if (bHit) matchedBol++;
      if (jHit) matchedJotform++;
      if (tHit || rHit || bHit || jHit) matchedAnyChain++;
      else {
        trulyMissed.push(pl);
        const c = pl.consigneeCompany ?? "(none)";
        consigneeBuckets.set(c, (consigneeBuckets.get(c) ?? 0) + 1);
      }
    }

    return {
      success: true,
      data: {
        window: { from: fromDate, to: toDate, companyLetter },
        pcsLoadCount: pcsLoads.length,
        identifierMatchRate: {
          shipperTicket_to_v2_ticketOrBol: matchedTicket,
          loadReference_to_v2_loadNo: matchedRef,
          shipperTicket_to_bolOcr: matchedBol,
          shipperTicket_to_jotform: matchedJotform,
          anyChain: matchedAnyChain,
          anyChainPct:
            pcsLoads.length > 0
              ? Math.round((matchedAnyChain / pcsLoads.length) * 100)
              : 0,
        },
        trulyMissedCount: trulyMissed.length,
        trulyMissedByConsignee: Object.fromEntries(
          [...consigneeBuckets.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20),
        ),
        trulyMissedSample: trulyMissed.slice(0, 5),
        pcsStatusDistribution: pcsLoads.reduce<Record<string, number>>(
          (acc, p) => {
            const s = p.status ?? "(null)";
            acc[s] = (acc[s] ?? 0) + 1;
            return acc;
          },
          {},
        ),
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

    // Tightened duplicate detection — initial signature (driver|day|weight)
    // collapsed real distinct round-trips into false-positive clusters.
    // Replacement uses two independent strict signatures, OR'd:
    //   1. bolSig: same trimmed lowercased bolNo OR ticketNo across records
    //   2. tightSig: same driver + delivered_on within ±15 minutes
    // A record is duplicated if either signature has >1 occurrence.
    const bolKey = (r: (typeof rows)[number]): string | null => {
      const b = (r.bolNo ?? "").trim().toLowerCase();
      if (b) return `bol:${b}`;
      const t = (r.ticketNo ?? "").trim().toLowerCase();
      return t ? `tk:${t}` : null;
    };
    const bolCount = new Map<string, number>();
    for (const r of rows) {
      const k = bolKey(r);
      if (k) bolCount.set(k, (bolCount.get(k) ?? 0) + 1);
    }
    // Tight driver-time signature: driver + 15-min bucket of delivered_on
    const tightKey = (r: (typeof rows)[number]): string | null => {
      const d = (r.driverName ?? "").trim().toLowerCase();
      if (!d || !r.deliveredOn) return null;
      const ms = r.deliveredOn.getTime();
      const bucket = Math.floor(ms / (15 * 60 * 1000));
      return `${d}|${bucket}`;
    };
    const tightCount = new Map<string, number>();
    for (const r of rows) {
      const k = tightKey(r);
      if (k) tightCount.set(k, (tightCount.get(k) ?? 0) + 1);
    }
    const isDuplicate = (r: (typeof rows)[number]): boolean => {
      const b = bolKey(r);
      if (b && (bolCount.get(b) ?? 0) > 1) return true;
      const t = tightKey(r);
      if (t && (tightCount.get(t) ?? 0) > 1) return true;
      return false;
    };
    const dupReason = (r: (typeof rows)[number]): string | null => {
      const b = bolKey(r);
      if (b && (bolCount.get(b) ?? 0) > 1) return `same-${b.split(":")[0]}`;
      const t = tightKey(r);
      if (t && (tightCount.get(t) ?? 0) > 1) return "same-driver-15min";
      return null;
    };
    // Legacy sig retained for backward compatibility in cluster analysis below
    const sigCount = bolCount;
    const sigFor = bolKey;

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

      if (isDuplicate(r)) {
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
      if (isDuplicate(r)) {
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

    // Cluster size distribution — split by which signature flagged it
    const bolClusterSizes: Record<string, number> = {};
    for (const sz of bolCount.values()) {
      if (sz >= 2)
        bolClusterSizes[String(sz)] = (bolClusterSizes[String(sz)] ?? 0) + 1;
    }
    const tightClusterSizes: Record<string, number> = {};
    for (const sz of tightCount.values()) {
      if (sz >= 2)
        tightClusterSizes[String(sz)] =
          (tightClusterSizes[String(sz)] ?? 0) + 1;
    }
    const clusterSizes = {
      byBolOrTicket: bolClusterSizes,
      byDriver15Min: tightClusterSizes,
    };

    // Three example duplicate clusters — show why each pair was flagged
    const dupClusters: Array<{
      reason: string;
      key: string;
      members: Array<{
        id: number;
        source: string;
        bolNo: string | null;
        ticketNo: string | null;
        loadNo: string | null;
        deliveredOn: Date | null;
      }>;
    }> = [];
    const seenKeys = new Set<string>();
    // Pull from bolCount-clusters first (definitive), then tightCount
    for (const [k, n] of bolCount.entries()) {
      if (n > 1 && !seenKeys.has(k)) {
        seenKeys.add(k);
        const members = rows
          .filter((r) => bolKey(r) === k)
          .map((r) => ({
            id: r.id,
            source: r.source,
            bolNo: r.bolNo,
            ticketNo: r.ticketNo,
            loadNo: r.loadNo,
            deliveredOn: r.deliveredOn,
          }));
        dupClusters.push({ reason: "same-bol-or-ticket", key: k, members });
        if (dupClusters.length >= 2) break;
      }
    }
    for (const [k, n] of tightCount.entries()) {
      if (n > 1 && !seenKeys.has(k) && dupClusters.length < 3) {
        seenKeys.add(k);
        const members = rows
          .filter((r) => tightKey(r) === k)
          .map((r) => ({
            id: r.id,
            source: r.source,
            bolNo: r.bolNo,
            ticketNo: r.ticketNo,
            loadNo: r.loadNo,
            deliveredOn: r.deliveredOn,
          }));
        dupClusters.push({ reason: "same-driver-15min", key: k, members });
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
