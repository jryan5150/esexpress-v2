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

const TZ = "America/Chicago";

let db: Database | null = null;

export function startScheduler(database: Database) {
  db = database;

  // ─── Early Morning Full Sync (4:00 AM CT) ─────────────────────────────
  cron.schedule(
    "0 4 * * *",
    () => runWithLog("PropX Sync (morning)", syncPropx(7)),
    { timezone: TZ },
  );
  cron.schedule(
    "15 4 * * *",
    () => runWithLog("Logistiq Sync (morning)", syncLogistiq(7)),
    { timezone: TZ },
  );
  cron.schedule(
    "30 4 * * *",
    () => runWithLog("Auto-Map (morning)", runAutoMap()),
    { timezone: TZ },
  );

  // ─── Periodic Refresh (every 4 hours during business: 8am, 12pm, 4pm, 8pm CT) ─
  cron.schedule(
    "0 8,12,16,20 * * *",
    async () => {
      await runWithLog("PropX Sync (refresh)", syncPropx(2));
      await runWithLog("Logistiq Sync (refresh)", syncLogistiq(2));
      await runWithLog("Auto-Map (refresh)", runAutoMap());
    },
    { timezone: TZ },
  );

  console.log("[scheduler] Cron jobs registered (TZ: America/Chicago)");
  console.log("[scheduler]   04:00 — PropX sync (7d)");
  console.log("[scheduler]   04:15 — Logistiq sync (7d)");
  console.log("[scheduler]   04:30 — Auto-map");
  console.log(
    "[scheduler]   08:00, 12:00, 16:00, 20:00 — PropX + Logistiq (2d) + Auto-map",
  );
}

async function runWithLog(name: string, promise: Promise<unknown>) {
  const start = Date.now();
  try {
    const result = await promise;
    const ms = Date.now() - start;
    console.log(
      `[scheduler] ${name} completed in ${ms}ms`,
      JSON.stringify(result),
    );
  } catch (err) {
    const ms = Date.now() - start;
    console.error(`[scheduler] ${name} FAILED after ${ms}ms:`, err);
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

  const email = process.env.LOGISTIQ_EMAIL;
  const password = process.env.LOGISTIQ_PASSWORD;
  if (!email || !password) {
    console.warn(
      "[scheduler] LOGISTIQ_EMAIL/PASSWORD not set, skipping Logistiq sync",
    );
    return { skipped: true, reason: "no credentials" };
  }

  const client = new LogistiqClient({ email, password });

  const to = new Date();
  const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  return syncLogistiqLoads(db, client, { from, to });
}

async function runAutoMap() {
  if (!db) throw new Error("Database not initialized");

  const { processLoadBatch } =
    await import("./plugins/dispatch/services/auto-mapper.service.js");
  const { loads, assignments } = await import("./db/schema.js");
  const { isNull, gte, sql } = await import("drizzle-orm");
  const { eq } = await import("drizzle-orm");

  // Find unmapped loads from last 30 days
  const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const unmapped = await db
    .select({ id: loads.id })
    .from(loads)
    .leftJoin(assignments, eq(loads.id, assignments.loadId))
    .where(isNull(assignments.id))
    .limit(5000);

  if (unmapped.length === 0) {
    return { mapped: 0, message: "No unmapped loads" };
  }

  const loadIds = unmapped.map((r) => r.id);

  // System user ID = 0 for automated operations
  const results = await processLoadBatch(db, loadIds, 0);
  const mapped = results.filter((r) => r.assignmentId !== null).length;

  return { total: loadIds.length, mapped, skipped: loadIds.length - mapped };
}
