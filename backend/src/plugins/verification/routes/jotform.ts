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
import { validateTicketNumber } from "../lib/field-validators.js";

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

  // ─── POST /jotform/manual-match — link an unmatched submission to a load ───
  // Used in the BOL Reconciliation queue when auto-match couldn't find a load.
  fastify.post(
    "/jotform/manual-match",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          required: ["importId", "loadId"],
          properties: {
            importId: { type: "integer" },
            loadId: { type: "integer" },
          },
        },
      },
    },
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

      const { importId, loadId } = request.body as {
        importId: number;
        loadId: number;
      };

      const [imp] = await db
        .select({
          id: jotformImports.id,
          photoUrl: jotformImports.photoUrl,
          imageUrls: jotformImports.imageUrls,
        })
        .from(jotformImports)
        .where(eq(jotformImports.id, importId))
        .limit(1);
      if (!imp)
        return reply.status(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `JotForm import ${importId} not found`,
          },
        });

      const [load] = await db
        .select({ id: loads.id })
        .from(loads)
        .where(eq(loads.id, loadId))
        .limit(1);
      if (!load)
        return reply.status(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `Load ${loadId} not found`,
          },
        });

      await db
        .update(jotformImports)
        .set({
          matchedLoadId: loadId,
          matchMethod: "manual",
          matchedAt: new Date(),
          status: "matched",
        })
        .where(eq(jotformImports.id, importId));

      const hasPhoto =
        !!imp.photoUrl ||
        (Array.isArray(imp.imageUrls) && imp.imageUrls.length > 0);
      if (hasPhoto) {
        await db
          .update(assignments)
          .set({ photoStatus: "attached", updatedAt: new Date() })
          .where(eq(assignments.loadId, loadId));
      }

      // Feedback loop (2026-04-14): every manual match is training signal.
      // Record driver-name ↔ well on wells.matchFeedback so the next JotForm
      // auto-match can prefer that well when the same driver's next photo
      // has multiple candidate loads (Tier 3 fuzzy tie-break).
      const { importDriverName } = await db
        .select({ importDriverName: jotformImports.driverName })
        .from(jotformImports)
        .where(eq(jotformImports.id, importId))
        .limit(1)
        .then((r) => ({
          importDriverName: r[0]?.driverName ?? null,
        }));
      if (importDriverName?.trim()) {
        const { wells } = await import("../../../db/schema.js");
        const userId = (request.user as { id: number }).id;
        const [assignedWell] = await db
          .select({ wellId: assignments.wellId })
          .from(assignments)
          .where(eq(assignments.loadId, loadId))
          .limit(1);
        if (assignedWell?.wellId) {
          const [well] = await db
            .select({ matchFeedback: wells.matchFeedback })
            .from(wells)
            .where(eq(wells.id, assignedWell.wellId))
            .limit(1);
          const current = Array.isArray(well?.matchFeedback)
            ? well!.matchFeedback
            : [];
          await db
            .update(wells)
            .set({
              matchFeedback: [
                ...current,
                {
                  sourceName: importDriverName.trim(),
                  action: "manual_assign" as const,
                  by: userId,
                  at: new Date().toISOString(),
                },
              ],
              updatedAt: new Date(),
            })
            .where(eq(wells.id, assignedWell.wellId));
        }
      }

      return {
        success: true,
        data: {
          importId,
          loadId,
          matchMethod: "manual",
          photoAttached: hasPhoto,
        },
      };
    },
  );

  // ─── GET /jotform/load-search — fast load lookup for the manual-match modal ─
  fastify.get(
    "/jotform/load-search",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            q: { type: "string", minLength: 1 },
            limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
          },
          required: ["q"],
        },
      },
    },
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

      const { q, limit = 10 } = request.query as {
        q: string;
        limit?: number;
      };
      const { sql, or, ilike, desc } = await import("drizzle-orm");
      const pattern = `%${q.replace(/[%_\\]/g, "\\$&")}%`;

      const rows = await db
        .select({
          id: loads.id,
          loadNo: loads.loadNo,
          source: loads.source,
          driverName: loads.driverName,
          bolNo: loads.bolNo,
          ticketNo: loads.ticketNo,
          deliveredOn: loads.deliveredOn,
          destinationName: loads.destinationName,
          weightTons: loads.weightTons,
        })
        .from(loads)
        .where(
          or(
            ilike(loads.loadNo, pattern),
            ilike(loads.bolNo, pattern),
            ilike(loads.ticketNo, pattern),
            ilike(loads.driverName, pattern),
          ),
        )
        .orderBy(desc(loads.deliveredOn))
        .limit(limit);

      return { success: true, data: rows };
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
          loadBolNo: loads.bolNo,
          loadWeightTons: loads.weightTons,
          loadWeightLbs: loads.weightLbs,
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
        discrepancies: r.matchedLoadId
          ? deriveJotformDiscrepancies({
              jotformBol: r.bolNo,
              jotformDriver: r.driverName,
              jotformWeight: r.weight,
              loadBol: r.loadBolNo,
              loadTicket: r.loadTicketNo,
              loadDriver: r.loadDriverName,
              loadWeightTons: r.loadWeightTons,
              loadWeightLbs: r.loadWeightLbs,
            })
          : [],
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

/**
 * Surface field-level conflicts between a JotForm submission and the load
 * it auto-matched to. Returned in the BOL Reconciliation queue so a
 * dispatcher can confirm the match is right or relink it.
 *
 * Severity ladder:
 *   - critical: BOL/ticket numbers don't agree on last-4 digits
 *   - warning:  driver name doesn't substring-match either direction
 *   - info:     weight delta > 10% (after normalizing tons↔lbs)
 */
function deriveJotformDiscrepancies(input: {
  jotformBol: string | null;
  jotformDriver: string | null;
  jotformWeight: string | null;
  loadBol: string | null;
  loadTicket: string | null;
  loadDriver: string | null;
  loadWeightTons: string | null;
  loadWeightLbs: string | null;
}): Array<{
  field: string;
  severity: "critical" | "warning" | "info";
  jotformValue: string | null;
  loadValue: string | null;
  message: string;
}> {
  const out: Array<{
    field: string;
    severity: "critical" | "warning" | "info";
    jotformValue: string | null;
    loadValue: string | null;
    message: string;
  }> = [];

  // Gate 0: JotForm BOL format sanity check (ported from bol-ocr-pipeline).
  // Catches OCR noise like dates, addresses, or stray single digits before
  // we compare to the matched load. When it fails, we warn the dispatcher
  // that the photo's BOL is probably an OCR error, not a real mismatch.
  if (input.jotformBol && input.jotformBol.trim()) {
    const bolCheck = validateTicketNumber(input.jotformBol);
    if (!bolCheck.valid) {
      out.push({
        field: "BOL OCR",
        severity: "warning",
        jotformValue: input.jotformBol,
        loadValue: input.loadBol ?? input.loadTicket,
        message: `Photo BOL "${input.jotformBol}" failed format check (${bolCheck.reason}) — likely an OCR misread`,
      });
    }
  }

  // BOL / ticket — compare last-4 digits since OCR often gets the prefix wrong
  const jBol = input.jotformBol?.replace(/\D/g, "").slice(-4) ?? "";
  const candidates = [input.loadBol, input.loadTicket]
    .map((v) => v?.replace(/\D/g, "").slice(-4) ?? "")
    .filter((v) => v.length >= 4);
  if (jBol.length >= 4 && candidates.length > 0 && !candidates.includes(jBol)) {
    out.push({
      field: "BOL / Ticket",
      severity: "critical",
      jotformValue: input.jotformBol,
      loadValue: input.loadBol ?? input.loadTicket,
      message: `Photo BOL last-4 ${jBol} does not match load (${candidates.join(" or ")})`,
    });
  }

  // Driver name — case-insensitive substring either direction
  const jDriver = input.jotformDriver?.trim().toLowerCase() ?? "";
  const lDriver = input.loadDriver?.trim().toLowerCase() ?? "";
  if (
    jDriver.length > 2 &&
    lDriver.length > 2 &&
    !jDriver.includes(lDriver) &&
    !lDriver.includes(jDriver)
  ) {
    out.push({
      field: "Driver",
      severity: "warning",
      jotformValue: input.jotformDriver,
      loadValue: input.loadDriver,
      message: `Photo driver "${input.jotformDriver}" does not match load driver "${input.loadDriver}"`,
    });
  }

  // Weight — compare with rough lbs↔tons normalization (1 ton = 2000 lbs)
  const jWeightRaw = input.jotformWeight
    ? parseFloat(input.jotformWeight.replace(/[^\d.]/g, ""))
    : NaN;
  const loadLbs = input.loadWeightLbs
    ? parseFloat(input.loadWeightLbs)
    : input.loadWeightTons
      ? parseFloat(input.loadWeightTons) * 2000
      : NaN;
  if (!Number.isNaN(jWeightRaw) && !Number.isNaN(loadLbs) && loadLbs > 0) {
    // JotForm weight likely in lbs (drivers eyeball the scale ticket)
    const delta = Math.abs(jWeightRaw - loadLbs) / loadLbs;
    if (delta > 0.1) {
      out.push({
        field: "Weight",
        severity: "info",
        jotformValue: `${Math.round(jWeightRaw)} lbs`,
        loadValue: `${Math.round(loadLbs)} lbs`,
        message: `Weight differs by ${Math.round(delta * 100)}% — verify scale ticket vs load record`,
      });
    }
  }

  return out;
}
