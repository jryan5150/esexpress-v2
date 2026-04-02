/**
 * JotForm Routes — CSV bulk import + API sync trigger
 */

import { type FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import {
  jotformImports,
  loads,
  assignments,
  photos,
} from "../../../db/schema.js";
import { matchSubmissionToLoad } from "../services/jotform.service.js";

const jotformRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /jotform/bulk-import — import JotForm CSV export rows
  fastify.post(
    "/jotform/bulk-import",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
      schema: {
        body: {
          type: "object",
          required: ["submissions"],
          properties: {
            submissions: {
              type: "array",
              items: {
                type: "object",
                required: ["jotformSubmissionId"],
                properties: {
                  jotformSubmissionId: { type: "string" },
                  driverName: { type: ["string", "null"] },
                  truckNo: { type: ["string", "null"] },
                  bolNo: { type: ["string", "null"] },
                  weight: { type: ["string", "null"] },
                  photoUrl: { type: ["string", "null"] },
                  imageUrls: { type: "array", items: { type: "string" } },
                  submittedAt: { type: ["string", "null"] },
                  status: { type: "string" },
                },
              },
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

      const { submissions } = request.body as {
        submissions: Array<{
          jotformSubmissionId: string;
          driverName: string | null;
          truckNo: string | null;
          bolNo: string | null;
          weight: string | null;
          photoUrl: string | null;
          imageUrls: string[];
          submittedAt: string | null;
          status: string;
        }>;
      };

      let imported = 0;
      let skipped = 0;
      let errors = 0;
      let matched = 0;

      for (const sub of submissions) {
        try {
          // Check duplicate
          const [existing] = await db
            .select({ id: jotformImports.id })
            .from(jotformImports)
            .where(
              eq(jotformImports.jotformSubmissionId, sub.jotformSubmissionId),
            )
            .limit(1);

          if (existing) {
            skipped++;
            continue;
          }

          // Try matching by BOL/ticket number
          const matchResult = await matchSubmissionToLoad(db, {
            driverName: sub.driverName,
            truckNo: sub.truckNo,
            bolNo: sub.bolNo,
            weight: sub.weight ? parseFloat(sub.weight) : null,
            loadNo: null,
            photoUrl: sub.photoUrl,
            imageUrls: sub.imageUrls,
            submittedAt: sub.submittedAt ? new Date(sub.submittedAt) : null,
          });

          await db.insert(jotformImports).values({
            jotformSubmissionId: sub.jotformSubmissionId,
            driverName: sub.driverName,
            truckNo: sub.truckNo,
            bolNo: sub.bolNo,
            weight: sub.weight,
            photoUrl: sub.photoUrl,
            imageUrls: sub.imageUrls ?? [],
            submittedAt: sub.submittedAt ? new Date(sub.submittedAt) : null,
            matchedLoadId: matchResult.loadId,
            matchMethod: matchResult.matchMethod,
            matchedAt: matchResult.matched ? new Date() : null,
            status: matchResult.matched ? "matched" : "pending",
          });

          imported++;
          if (matchResult.matched) {
            matched++;

            // Update photo status on the assignment for this load
            if (matchResult.loadId && sub.photoUrl) {
              const [assignment] = await db
                .select({ id: assignments.id })
                .from(assignments)
                .where(eq(assignments.loadId, matchResult.loadId))
                .limit(1);

              if (assignment) {
                // Create photo record
                await db
                  .insert(photos)
                  .values({
                    loadId: matchResult.loadId,
                    assignmentId: assignment.id,
                    source: "jotform",
                    sourceUrl: sub.photoUrl,
                    type: "weight_ticket",
                    ticketNo: sub.bolNo,
                    driverName: sub.driverName,
                  })
                  .onConflictDoNothing();

                // Update assignment photo status
                await db
                  .update(assignments)
                  .set({ photoStatus: "attached", updatedAt: new Date() })
                  .where(eq(assignments.id, assignment.id));
              }
            }
          }
        } catch (err: any) {
          if (err.message?.includes("duplicate") || err.code === "23505") {
            skipped++;
          } else {
            errors++;
          }
        }
      }

      return {
        success: true,
        data: { imported, skipped, errors, matched, total: submissions.length },
      };
    },
  );

  // POST /jotform/sync — trigger live JotForm API sync
  fastify.post(
    "/jotform/sync",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
            offset: { type: "integer", minimum: 0, default: 0 },
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

      const apiKey = process.env.JOTFORM_API_KEY;
      if (!apiKey) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "CONFIG_ERROR",
            message: "JOTFORM_API_KEY not configured",
          },
        });
      }

      const { limit = 100, offset = 0 } = (request.body as any) ?? {};
      const { syncWeightTickets } =
        await import("../services/jotform.service.js");

      const result = await syncWeightTickets(db, { apiKey }, { limit, offset });
      return { success: true, data: result };
    },
  );

  // GET /jotform/stats — JotForm import stats
  fastify.get(
    "/jotform/stats",
    {
      preHandler: [fastify.authenticate],
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

      const { sql } = await import("drizzle-orm");

      const [stats] = await db
        .select({
          total: sql<number>`cast(count(*) as int)`,
          matched: sql<number>`cast(count(case when ${jotformImports.status} = 'matched' then 1 end) as int)`,
          pending: sql<number>`cast(count(case when ${jotformImports.status} = 'pending' then 1 end) as int)`,
          withPhotos: sql<number>`cast(count(case when ${jotformImports.photoUrl} is not null then 1 end) as int)`,
        })
        .from(jotformImports);

      return { success: true, data: stats };
    },
  );
};

export default jotformRoutes;
