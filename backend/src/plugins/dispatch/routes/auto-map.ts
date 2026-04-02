import { type FastifyPluginAsync } from "fastify";
import { eq, sql, isNull } from "drizzle-orm";
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

      const { limit = 20000, batchSize = 500 } = (request.body as any) ?? {};
      const user = request.user as { id: number; name: string };

      // Count unmapped loads
      const [{ count }] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(loads)
        .leftJoin(assignments, eq(loads.id, assignments.loadId))
        .where(isNull(assignments.id));

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
      runAutoMapJob(db, jobId, totalToProcess, batchSize, user.id).catch(
        (err) => {
          if (currentJob?.id === jobId) {
            currentJob.status = "failed";
            currentJob.error = err.message;
            currentJob.completedAt = new Date().toISOString();
          }
        },
      );

      return {
        success: true,
        data: {
          jobId,
          totalLoads: totalToProcess,
          message: `Auto-map started for ${totalToProcess} unmapped loads`,
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
) {
  const { processLoadBatch } =
    await import("../services/auto-mapper.service.js");

  let offset = 0;

  while (offset < totalLimit) {
    // Fetch a batch of unmapped load IDs
    const batch = await db
      .select({ id: loads.id })
      .from(loads)
      .leftJoin(assignments, eq(loads.id, assignments.loadId))
      .where(isNull(assignments.id))
      .limit(batchSize)
      .offset(0); // Always offset 0 because processed loads now have assignments

    if (batch.length === 0) break;

    const loadIds = batch.map((r) => r.id);
    const results = await processLoadBatch(db, loadIds, systemUserId);

    // Update job progress
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

    offset += batch.length;
  }

  if (currentJob?.id === jobId) {
    currentJob.status = "completed";
    currentJob.completedAt = new Date().toISOString();
  }
}

export { autoMapRoutes };
