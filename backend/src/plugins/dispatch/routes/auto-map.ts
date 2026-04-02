import { type FastifyPluginAsync } from "fastify";
import { eq, sql, isNull, gte, and } from "drizzle-orm";
import { loads, assignments } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";

// ─── In-process job state (single-instance deployment) ──────────────────────

interface AutoMapJob {
  id: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  totalLoads: number;
  processed: number;
  tier1: number;
  tier2: number;
  tier3: number;
  errors: number;
  assignmentsCreated: number;
  error?: string;
}

let currentJob: AutoMapJob | null = null;

const autoMapRoutes: FastifyPluginAsync = async (fastify) => {
  // POST / — trigger auto-map on all unmapped loads
  fastify.post(
    "/",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
      schema: {
        body: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 50000,
              default: 20000,
            },
            batchSize: {
              type: "integer",
              minimum: 50,
              maximum: 2000,
              default: 500,
            },
            fromDate: {
              type: "string",
              format: "date",
              description:
                "Only map loads delivered on or after this date (YYYY-MM-DD). Defaults to 30 days ago.",
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

      if (currentJob?.status === "running") {
        return reply.status(409).send({
          success: false,
          error: { code: "CONFLICT", message: "Auto-map job already running" },
          data: currentJob,
        });
      }

      const {
        limit = 20000,
        batchSize = 500,
        fromDate: fromDateStr,
      } = (request.body as any) ?? {};
      const user = request.user as { id: number; name: string };

      // Default to 30 days ago if no fromDate provided
      const fromDate = fromDateStr
        ? new Date(fromDateStr)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Count unmapped loads within date range
      const [{ count }] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(loads)
        .leftJoin(assignments, eq(loads.id, assignments.loadId))
        .where(and(isNull(assignments.id), gte(loads.createdAt, fromDate)));

      const totalToProcess = Math.min(count, limit);

      if (totalToProcess === 0) {
        return {
          success: true,
          data: { message: "No unmapped loads found", totalLoads: 0 },
        };
      }

      // Create job
      const jobId = `automap-${Date.now()}`;
      currentJob = {
        id: jobId,
        status: "running",
        startedAt: new Date().toISOString(),
        totalLoads: totalToProcess,
        processed: 0,
        tier1: 0,
        tier2: 0,
        tier3: 0,
        errors: 0,
        assignmentsCreated: 0,
      };

      // Fire-and-forget: start processing in background
      runAutoMapJob(
        db,
        jobId,
        totalToProcess,
        batchSize,
        user.id,
        fromDate,
      ).catch((err) => {
        if (currentJob?.id === jobId) {
          currentJob.status = "failed";
          currentJob.error = err.message;
          currentJob.completedAt = new Date().toISOString();
        }
      });

      return {
        success: true,
        data: {
          jobId,
          totalLoads: totalToProcess,
          fromDate: fromDate.toISOString().slice(0, 10),
          message: `Auto-map started for ${totalToProcess} unmapped loads (from ${fromDate.toISOString().slice(0, 10)})`,
        },
      };
    },
  );

  // GET /status — poll job progress
  fastify.get(
    "/status",
    {
      preHandler: [fastify.authenticate],
    },
    async () => {
      if (!currentJob) {
        return {
          success: true,
          data: { status: "idle", message: "No auto-map job has been run" },
        };
      }
      return { success: true, data: currentJob };
    },
  );
};

// ─── Background job runner ──────────────────────────────────────────────────

async function runAutoMapJob(
  db: Database,
  jobId: string,
  totalLimit: number,
  batchSize: number,
  systemUserId: number,
  fromDate: Date,
) {
  const { processLoadBatch } =
    await import("../services/auto-mapper.service.js");

  let processed = 0;
  let lastBatchFirstId = -1;

  while (processed < totalLimit) {
    // Fetch unmapped loads. offset(0) works when loads get assignments.
    // Safety: if the first ID repeats (stuck on Tier 3 loads), use increasing offset.
    const batch = await db
      .select({ id: loads.id })
      .from(loads)
      .leftJoin(assignments, eq(loads.id, assignments.loadId))
      .where(and(isNull(assignments.id), gte(loads.createdAt, fromDate)))
      .orderBy(loads.id)
      .limit(batchSize);

    if (batch.length === 0) break;

    // Infinite loop guard: if we see the same first ID twice, these are all
    // Tier 3 (no assignment created) — skip forward with real offset
    if (batch[0].id === lastBatchFirstId) {
      // Fetch with offset to skip past the stuck batch
      const skipped = await db
        .select({ id: loads.id })
        .from(loads)
        .leftJoin(assignments, eq(loads.id, assignments.loadId))
        .where(and(isNull(assignments.id), gte(loads.createdAt, fromDate)))
        .orderBy(loads.id)
        .limit(batchSize)
        .offset(batchSize);

      if (skipped.length === 0) break; // No more loads after the stuck batch

      const skipIds = skipped.map((r) => r.id);
      const skipResults = await processLoadBatch(db, skipIds, systemUserId);

      if (currentJob?.id === jobId) {
        for (const r of skipResults) {
          currentJob.processed++;
          if (r.tier === 1) currentJob.tier1++;
          else if (r.tier === 2) currentJob.tier2++;
          else currentJob.tier3++;
          if (r.assignmentId) currentJob.assignmentsCreated++;
          if (r.error) currentJob.errors++;
        }
      }
      processed += batchSize + skipped.length; // Count both stuck + skipped batches
      lastBatchFirstId = -1; // Reset guard
      continue;
    }

    lastBatchFirstId = batch[0].id;
    const loadIds = batch.map((r) => r.id);
    const results = await processLoadBatch(db, loadIds, systemUserId);

    if (currentJob?.id === jobId) {
      for (const r of results) {
        currentJob.processed++;
        if (r.tier === 1) currentJob.tier1++;
        else if (r.tier === 2) currentJob.tier2++;
        else currentJob.tier3++;
        if (r.assignmentId) currentJob.assignmentsCreated++;
        if (r.error) currentJob.errors++;
      }
    }

    // If zero assignments were created from this batch, all were Tier 3 — advance
    const assignmentsCreatedThisBatch = results.filter(
      (r) => r.assignmentId,
    ).length;
    if (assignmentsCreatedThisBatch === 0) {
      processed += batch.length;
      // Reset guard since we're counting these as processed
      lastBatchFirstId = -1;
    }

    processed += batch.length;
  }

  if (currentJob?.id === jobId) {
    currentJob.status = "completed";
    currentJob.completedAt = new Date().toISOString();
  }
}

export { autoMapRoutes };
