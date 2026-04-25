/**
 * Scheduled Jobs — PropX sync, Logistiq sync, Auto-map
 *
 * Runs inside the Fastify process using node-cron.
 * Schedule (all times US Central / America/Chicago):
 *   - 4:00 AM: PropX sync (last 7 days)
 *   - 4:15 AM: Logistiq sync (last 7 days)
 *   - 4:30 AM: Auto-map unmapped loads
 *   - Every 4 hours (8am, 12pm, 4pm, 8pm): PropX + Logistiq refresh (last 2 days)
 */

import cron from "node-cron";
import type { Database } from "./db/client.js";
import { syncRuns } from "./db/schema.js";
import { reportError } from "./lib/sentry.js";

const TZ = "America/Chicago";

let db: Database | null = null;

export async function recordSyncRun(
  source: "propx" | "logistiq" | "automap" | "jotform" | "pcs",
  startedAt: Date,
  result: {
    status: "success" | "failed" | "skipped";
    recordsProcessed?: number;
    error?: string;
    metadata?: Record<string, unknown>;
  },
) {
  if (!db) return;
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();
  await db.insert(syncRuns).values({
    source,
    startedAt,
    completedAt,
    status: result.status,
    recordsProcessed: result.recordsProcessed || 0,
    durationMs,
    error: result.error || null,
    metadata: result.metadata || null,
  });
}

export function startScheduler(database: Database) {
  db = database;

  // ─── Early Morning Full Sync (4:00 AM CT) ─────────────────────────────
  cron.schedule(
    "0 4 * * *",
    () => runWithLog("PropX Sync (morning)", syncPropx(7), "propx"),
    { timezone: TZ },
  );
  cron.schedule(
    "15 4 * * *",
    () => runWithLog("Logistiq Sync (morning)", syncLogistiq(7), "logistiq"),
    { timezone: TZ },
  );
  cron.schedule(
    "30 4 * * *",
    () => runWithLog("Auto-Map (morning)", runAutoMap(), "automap"),
    { timezone: TZ },
  );

  // ─── Periodic Refresh (every 4 hours during business: 8am, 12pm, 4pm, 8pm CT) ─
  cron.schedule(
    "0 8,12,16,20 * * *",
    async () => {
      await runWithLog("PropX Sync (refresh)", syncPropx(2), "propx");
      await runWithLog("Logistiq Sync (refresh)", syncLogistiq(2), "logistiq");
      await runWithLog("Auto-Map (refresh)", runAutoMap(), "automap");
    },
    { timezone: TZ },
  );

  // ─── JotForm photo sync (every 30 min) — pulls driver-submitted weight
  // tickets + photos, attaches them to matching loads. Was previously
  // manual-only; sync stalled for 12 days as a result. (2026-04-14)
  cron.schedule(
    "*/30 * * * *",
    () => runWithLog("JotForm Sync (30m)", runJotformSync(200), "jotform"),
    { timezone: TZ },
  );

  // ─── PCS load sync (every 15 min) — pulls PCS's load list for the
  // configured division and reconciles onto v2's assignments, populating
  // pcsSequence + pcsDispatch.pcs_status so the Workbench's PcsPill
  // stays warm without anyone triggering it. Surfaces missed-by-v2 gaps
  // as a byproduct (Jenny's manual reconciliation, automated).
  cron.schedule(
    "*/15 * * * *",
    () =>
      runWithLog(
        "PCS Sync (15m)",
        (async () => {
          if (!db) return { status: "skipped" };
          const { syncPcsLoads } =
            await import("./plugins/pcs/services/pcs-sync.service.js");
          const result = await syncPcsLoads(db, {
            // 3-day window — covers any load that might not have been in
            // the previous tick's view without hammering PCS for history.
            fromDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          });
          return {
            status: "success",
            recordsProcessed: result.pcsLoadCount,
            matched: result.matched,
            missedByV2: result.missedByV2.length,
            latencyMs: result.latencyMs,
            bridgeable: result.bridgeable,
            scopeGap: result.scopeGap,
          };
        })(),
        "pcs",
      ),
    { timezone: TZ },
  );

  // ─── Sheet Load Count Sync (every 30 min during business hours) — reads
  // ES Express's "Load Count Sheet - Daily (Billing)" Current+Previous tabs
  // and snapshots per-week-per-well counts, then computes parity vs v2's
  // unique load count. Writes sheet_vs_v2_week_count discrepancy when delta
  // exceeds threshold. The sheet IS the team's truth — this is the
  // automated version of Jenny's manual reconciliation.
  cron.schedule(
    "*/30 6-22 * * *",
    () =>
      runWithLog(
        "Sheet Load Count Sync (30m)",
        (async () => {
          if (!db) return { status: "skipped" };
          const { syncLoadCountSheet, computeWeekParity } =
            await import("./plugins/sheets/services/loadcount-sync.service.js");
          const syncResult = await syncLoadCountSheet(db);
          const parity = await computeWeekParity(db);
          const outOfThreshold = parity.filter((p) => !p.withinThreshold);
          return {
            status: "success",
            recordsProcessed: syncResult.rowsUpserted,
            tabsScanned: syncResult.tabsScanned,
            weeksReported: parity.length,
            weeksOutOfThreshold: outOfThreshold.length,
            latestDelta: parity[0]?.delta ?? null,
          };
        })(),
        "sheet-loadcount",
      ),
    { timezone: TZ },
  );

  // ─── Master Dispatch Sync (daily 04:45) — pulls Driver Codes + Sand
  // Tracking tabs for the matcher Tier 3 fallback. Runs once a day; the
  // roster doesn't change minute-to-minute.
  cron.schedule(
    "45 4 * * *",
    () =>
      runWithLog(
        "Master Dispatch Sync (daily 04:45)",
        (async () => {
          if (!db) return { status: "skipped" };
          const { syncMasterDispatch } =
            await import("./plugins/sheets/services/master-dispatch-sync.service.js");
          const result = await syncMasterDispatch(db);
          return {
            status: "success",
            recordsProcessed:
              result.driverRoster.rowsUpserted + result.sandJobs.rowsUpserted,
            driverRosterRows: result.driverRoster.rowsUpserted,
            sandJobRows: result.sandJobs.rowsUpserted,
          };
        })(),
        "master-dispatch-sync",
      ),
    { timezone: TZ },
  );

  console.log("[scheduler] Cron jobs registered (TZ: America/Chicago)");
  console.log("[scheduler]   04:00 — PropX sync (7d)");
  console.log("[scheduler]   04:15 — Logistiq sync (7d)");
  console.log("[scheduler]   04:30 — Auto-map");
  console.log(
    "[scheduler]   08:00, 12:00, 16:00, 20:00 — PropX + Logistiq (2d) + Auto-map",
  );
  console.log("[scheduler]   every 30m — JotForm photo sync");
  console.log("[scheduler]   every 15m — PCS sync");
  console.log("[scheduler]   every 30m (06:00-22:00) — Sheet load count sync");

  // ─── Startup catch-up ─────────────────────────────────────────────────
  // Each deploy resets node-cron's in-memory schedule, so any cron slot
  // that should have fired between the last deploy and now gets silently
  // skipped (caught us 2026-04-24 — PropX showed 15h stale because every
  // morning's deploys drifted past the 8am/12pm/4pm slots). Fire once on
  // startup for any source whose last successful run is older than its
  // expected interval, so /diag/cron-health self-heals.
  void runStartupCatchup();
}

/**
 * For each scheduled source, check the most recent syncRuns row. If the
 * last run is older than the source's expected interval, kick a manual
 * run NOW. Runs in background; errors are logged + Sentry-reported but
 * don't block scheduler startup.
 */
async function runStartupCatchup() {
  if (!db) return;

  // Source → max age in minutes before we consider it stale and kick.
  // Slightly larger than the cron interval so a freshly-fired job
  // doesn't trigger a duplicate.
  const SOURCES: Array<{
    source: "propx" | "logistiq" | "automap" | "jotform";
    maxAgeMin: number;
    kick: () => Promise<unknown>;
    label: string;
  }> = [
    {
      source: "propx",
      maxAgeMin: 300,
      kick: () => syncPropx(2),
      label: "PropX Sync (catchup)",
    },
    {
      source: "logistiq",
      maxAgeMin: 300,
      kick: () => syncLogistiq(2),
      label: "Logistiq Sync (catchup)",
    },
    {
      source: "automap",
      maxAgeMin: 300,
      kick: () => runAutoMap(),
      label: "Auto-Map (catchup)",
    },
    {
      source: "jotform",
      maxAgeMin: 60,
      kick: () => runJotformSync(200),
      label: "JotForm Sync (catchup)",
    },
  ];

  // Small delay so the rest of the app finishes booting before we start
  // hammering external APIs.
  await new Promise((r) => setTimeout(r, 5000));

  for (const { source, maxAgeMin, kick, label } of SOURCES) {
    try {
      const { syncRuns: srTable } = await import("./db/schema.js");
      const { eq, desc } = await import("drizzle-orm");
      const [last] = await db
        .select({ startedAt: srTable.startedAt })
        .from(srTable)
        .where(eq(srTable.source, source))
        .orderBy(desc(srTable.startedAt))
        .limit(1);

      const lastTime = last?.startedAt ? new Date(last.startedAt) : null;
      const ageMin = lastTime
        ? (Date.now() - lastTime.getTime()) / 60000
        : Infinity;

      if (ageMin > maxAgeMin) {
        console.log(
          `[scheduler] startup catchup: ${source} is ${Math.round(ageMin)}m stale (budget ${maxAgeMin}m) — kicking`,
        );
        // Fire-and-forget; runWithLog handles logging + recordSyncRun.
        void runWithLog(label, kick(), source);
      } else {
        console.log(
          `[scheduler] startup catchup: ${source} ok (${Math.round(ageMin)}m old)`,
        );
      }
    } catch (err) {
      console.error(`[scheduler] startup catchup ${source} check failed:`, err);
      reportError(err instanceof Error ? err : new Error(String(err)), {
        kind: "scheduler-catchup-check",
        source,
      });
    }
  }
}

async function runWithLog(
  name: string,
  promise: Promise<unknown>,
  source?: "propx" | "logistiq" | "automap" | "jotform" | "pcs",
) {
  const startedAt = new Date();
  try {
    const result = await promise;
    const ms = Date.now() - startedAt.getTime();
    console.log(
      `[scheduler] ${name} completed in ${ms}ms`,
      JSON.stringify(result),
    );
    if (source) {
      const rec = result as Record<string, unknown> | null;
      // Some return shapes use { skipped: true }, others { status: "skipped" }
      // (PCS sync returns the latter). Normalize both.
      const status: "success" | "failed" | "skipped" =
        rec?.skipped || rec?.status === "skipped"
          ? "skipped"
          : rec?.status === "failed"
            ? "failed"
            : "success";
      await recordSyncRun(source, startedAt, {
        status,
        recordsProcessed:
          (rec?.recordsProcessed as number) ||
          (rec?.mapped as number) ||
          (rec?.stored as number) ||
          (rec?.total as number) ||
          0,
        metadata: rec as Record<string, unknown>,
      });
    }
  } catch (err) {
    const ms = Date.now() - startedAt.getTime();
    console.error(`[scheduler] ${name} FAILED after ${ms}ms:`, err);
    // Surface to Sentry so cron failures don't sit silent (Railway pino
    // eats console.error). Tagged so we can filter scheduler-only alerts.
    reportError(err instanceof Error ? err : new Error(String(err)), {
      job: name,
      source: source ?? "unknown",
      durationMs: ms,
      kind: "scheduler-failure",
    });
    if (source) {
      await recordSyncRun(source, startedAt, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function syncPropx(daysBack: number) {
  if (!db) throw new Error("Database not initialized");

  const { PropxClient } =
    await import("./plugins/ingestion/services/propx.service.js");
  const { syncPropxLoads } =
    await import("./plugins/ingestion/services/propx-sync.service.js");

  const apiKey = process.env.PROPX_API_KEY;
  if (!apiKey) {
    console.warn("[scheduler] PROPX_API_KEY not set, skipping PropX sync");
    return { skipped: true, reason: "no API key" };
  }

  const client = new PropxClient({
    apiKey,
    baseUrl: process.env.PROPX_BASE_URL,
  });

  const to = new Date();
  const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  return syncPropxLoads(db, client, { from, to });
}

async function syncLogistiq(daysBack: number) {
  if (!db) throw new Error("Database not initialized");

  const { LogistiqClient } =
    await import("./plugins/ingestion/services/logistiq.service.js");
  const { syncLogistiqLoads } =
    await import("./plugins/ingestion/services/logistiq-sync.service.js");

  const apiKey = process.env.LOGISTIQ_API_KEY;
  const carrierId = process.env.LOGISTIQ_CARRIER_ID;
  if (!apiKey) {
    console.warn(
      "[scheduler] LOGISTIQ_API_KEY not set, skipping Logistiq sync",
    );
    return { skipped: true, reason: "no API key" };
  }

  // Carrier export: API-key auth only, no session credentials needed
  const client = new LogistiqClient({
    apiKey,
    carrierId: carrierId ? parseInt(carrierId, 10) : undefined,
  });

  const to = new Date();
  const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Fetch via carrier export API, pass pre-fetched records to sync pipeline
  const records = await client.getCarrierExport(from, to);
  return syncLogistiqLoads(db, client, { from, to }, records);
}

async function runJotformSync(limit: number) {
  if (!db) throw new Error("Database not initialized");
  const apiKey = process.env.JOTFORM_API_KEY;
  if (!apiKey) {
    console.warn("[scheduler] JOTFORM_API_KEY not set, skipping JotForm sync");
    return { skipped: true, reason: "no API key" };
  }
  const { syncWeightTickets } =
    await import("./plugins/verification/services/jotform.service.js");
  return syncWeightTickets(
    db,
    {
      apiKey,
      formId: process.env.JOTFORM_FORM_ID,
      baseUrl: process.env.JOTFORM_BASE_URL,
    },
    { limit, offset: 0 },
  );
}

async function runAutoMap() {
  if (!db) throw new Error("Database not initialized");

  const { processLoadBatch } =
    await import("./plugins/dispatch/services/auto-mapper.service.js");
  const { loads, assignments } = await import("./db/schema.js");
  const { isNull, gte, sql, and } = await import("drizzle-orm");
  const { eq } = await import("drizzle-orm");

  // Find unmapped loads from last 30 days.
  // Exclude historical_complete — those are pre-cutoff already-dispatched
  // loads that belong in the archive, NOT in the validation queue. Creating
  // assignments for them would flood the team with work that's already done.
  const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const unmapped = await db
    .select({ id: loads.id })
    .from(loads)
    .leftJoin(assignments, eq(loads.id, assignments.loadId))
    .where(
      and(
        isNull(assignments.id),
        gte(loads.createdAt, fromDate),
        eq(loads.historicalComplete, false),
      ),
    )
    .limit(5000);

  if (unmapped.length === 0) {
    return { mapped: 0, message: "No unmapped loads" };
  }

  const loadIds = unmapped.map((r) => r.id);

  // System user ID = 1 (jryan@esexpress.com) for automated operations.
  // No dedicated system user exists yet — user_id 0 has no matching row in
  // users(id) so createAssignment's FK (assigned_by → users.id) rejects it
  // and every scheduled auto-map silently skips every load. Post-MVP: create
  // a dedicated `system@esexpressllc.com` admin user and switch to that id.
  const results = await processLoadBatch(db, loadIds, 1);
  const mapped = results.filter((r) => r.assignmentId !== null).length;

  return { total: loadIds.length, mapped, skipped: loadIds.length - mapped };
}
