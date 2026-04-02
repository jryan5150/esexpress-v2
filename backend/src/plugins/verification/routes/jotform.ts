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

            // Create photo record and update assignment photo status
            if (matchResult.loadId && sub.photoUrl) {
              // Find active assignment (not cancelled) for this load
              const [assignment] = await db
                .select({ id: assignments.id, status: assignments.status })
                .from(assignments)
                .where(eq(assignments.loadId, matchResult.loadId))
                .orderBy(assignments.createdAt)
                .limit(1);

              if (assignment && assignment.status !== "cancelled") {
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

                // Update photo status to pending (not attached — one photo doesn't
                // mean all required photos are present). Use 'pending' to indicate
                // at least one photo exists but completeness is not verified.
                await db
                  .update(assignments)
                  .set({ photoStatus: "pending", updatedAt: new Date() })
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

  // NOTE: /jotform/sync and /jotform/stats are registered in photos.ts

  // GET /jotform/queue — JotForm imports as BOL queue items with photo URLs
  fastify.get(
    "/jotform/queue",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: { type: "string" },
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
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

      const {
        status,
        page = 1,
        limit = 50,
      } = request.query as {
        status?: string;
        page?: number;
        limit?: number;
      };
      const offset = (page - 1) * limit;

      const { sql, desc } = await import("drizzle-orm");

      // Count total for pagination meta
      let countQuery = db
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(jotformImports);

      if (status) {
        countQuery = countQuery.where(
          sql`${jotformImports.status} = ${status}`,
        ) as typeof countQuery;
      }

      const [countResult] = await countQuery;
      const total = countResult?.total ?? 0;

      let query = db
        .select({
          id: jotformImports.id,
          jotformSubmissionId: jotformImports.jotformSubmissionId,
          driverName: jotformImports.driverName,
          truckNo: jotformImports.truckNo,
          bolNo: jotformImports.bolNo,
          weight: jotformImports.weight,
          photoUrl: jotformImports.photoUrl,
          imageUrls: jotformImports.imageUrls,
          submittedAt: jotformImports.submittedAt,
          status: jotformImports.status,
          matchedLoadId: jotformImports.matchedLoadId,
          matchMethod: jotformImports.matchMethod,
          matchedAt: jotformImports.matchedAt,
          createdAt: jotformImports.createdAt,
          // Joined load fields when matched
          loadNo: loads.loadNo,
          loadDriverName: loads.driverName,
          destinationName: loads.destinationName,
          loadTicketNo: loads.ticketNo,
        })
        .from(jotformImports)
        .leftJoin(loads, eq(jotformImports.matchedLoadId, loads.id))
        .orderBy(desc(jotformImports.createdAt))
        .limit(limit)
        .offset(offset);

      if (status) {
        query = query.where(
          sql`${jotformImports.status} = ${status}`,
        ) as typeof query;
      }

      const rows = await query;

      // Map to queue item format the frontend expects
      const data = rows.map((r) => ({
        submission: {
          id: r.id,
          bolNumber: r.bolNo,
          driverName: r.driverName,
          truckNo: r.truckNo,
          weight: r.weight,
          photoUrls: r.jotformSubmissionId
            ? [`/api/v1/verification/photos/gcs/${r.jotformSubmissionId}`]
            : [],
          status: r.status,
          submittedAt: r.submittedAt,
          createdAt: r.createdAt,
        },
        matchedLoad: r.matchedLoadId
          ? {
              id: r.matchedLoadId,
              loadNo: r.loadNo,
              driverName: r.loadDriverName,
              destinationName: r.destinationName,
              ticketNo: r.loadTicketNo,
            }
          : null,
        discrepancies: [],
      }));

      return {
        success: true,
        data,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    },
  );
};

export default jotformRoutes;
