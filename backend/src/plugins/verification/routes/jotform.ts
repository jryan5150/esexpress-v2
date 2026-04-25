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
import { resolveJotformPhotoUrls } from "../lib/photo-urls.js";

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
          importDriverName: r[0]?.importDriverName ?? null,
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

  // ─── POST /jotform/:id/correct-bol — operator overrides OCR'd BOL ──
  // Used in the BOL Reconciliation queue when the OCR pulled the wrong text
  // from the photo (or grabbed the date, address, etc). Saves the original
  // OCR value to original_ocr_bol_no on first edit only (preserves OG ground
  // truth for OCR retraining), updates bol_no to the corrected value, then
  // re-runs the matcher with the new BOL — auto-promoting the row to "matched"
  // when the corrected value resolves a load.
  fastify.post(
    "/jotform/:id/correct-bol",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "integer" } },
        },
        body: {
          type: "object",
          required: ["bolNo"],
          properties: {
            bolNo: { type: "string", minLength: 1, maxLength: 64 },
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

      const { id } = request.params as { id: number };
      const { bolNo } = request.body as { bolNo: string };
      const userId = (request.user as { id: number }).id;
      const trimmed = bolNo.trim();

      const [imp] = await db
        .select({
          id: jotformImports.id,
          bolNo: jotformImports.bolNo,
          driverName: jotformImports.driverName,
          truckNo: jotformImports.truckNo,
          weight: jotformImports.weight,
          submittedAt: jotformImports.submittedAt,
          photoUrl: jotformImports.photoUrl,
          imageUrls: jotformImports.imageUrls,
          originalOcrBolNo: jotformImports.originalOcrBolNo,
        })
        .from(jotformImports)
        .where(eq(jotformImports.id, id))
        .limit(1);

      if (!imp)
        return reply.status(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `JotForm import ${id} not found`,
          },
        });

      // Re-run matcher with corrected BOL. Reuse the matcher rather than
      // duplicating the cascade — same Tier 1/2/3 logic, photo gate, etc.
      const match = await matchSubmissionToLoad(db, {
        driverName: imp.driverName,
        truckNo: imp.truckNo,
        bolNo: trimmed,
        weight: imp.weight ? Number(imp.weight) : null,
        loadNo: null,
        photoUrl: imp.photoUrl,
        imageUrls: (imp.imageUrls as string[]) ?? [],
        submittedAt: imp.submittedAt,
      });

      const updates: Record<string, unknown> = {
        bolNo: trimmed,
        bolCorrectedBy: userId,
        bolCorrectedAt: new Date(),
      };
      // First correction wins for original_ocr_bol_no — keep the OG OCR value
      // so OCR retraining sees photo→correct-BOL pairs, not photo→latest-edit.
      if (!imp.originalOcrBolNo) {
        updates.originalOcrBolNo = imp.bolNo;
      }
      if (match.matched && match.loadId) {
        updates.matchedLoadId = match.loadId;
        updates.matchMethod = match.matchMethod ?? "manual_bol_correction";
        updates.matchedAt = new Date();
        updates.status = "matched";
        updates.manuallyMatched = true;
        updates.manuallyMatchedBy = userId;
      }

      await db
        .update(jotformImports)
        .set(updates)
        .where(eq(jotformImports.id, id));

      // Bridge to assignment.photo_status the same way auto-match does, so
      // the matched load shows up as photo-attached on Dispatch Desk.
      const hasPhoto =
        !!imp.photoUrl ||
        (Array.isArray(imp.imageUrls) && imp.imageUrls.length > 0);
      if (match.matched && match.loadId && hasPhoto) {
        await db
          .update(assignments)
          .set({ photoStatus: "attached", updatedAt: new Date() })
          .where(eq(assignments.loadId, match.loadId));
      }

      return {
        success: true,
        data: {
          id,
          bolNo: trimmed,
          originalOcrBolNo: imp.originalOcrBolNo ?? imp.bolNo,
          matched: match.matched,
          matchedLoadId: match.loadId,
          matchMethod: match.matchMethod,
          photoAttached: match.matched && hasPhoto,
        },
      };
    },
  );

  // NOTE: /jotform/sync and /jotform/stats are registered in photos.ts

  // GET /jotform/queue — JotForm imports as BOL queue items with photo URLs
  // Supports status / search / date-range filters mirroring the PropX queue.
  fastify.get(
    "/jotform/queue",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: { type: "string" },
            search: { type: "string", maxLength: 80 },
            dateFrom: { type: "string", format: "date" },
            dateTo: { type: "string", format: "date" },
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
        search,
        dateFrom,
        dateTo,
        page = 1,
        limit = 50,
      } = request.query as {
        status?: string;
        search?: string;
        dateFrom?: string;
        dateTo?: string;
        page?: number;
        limit?: number;
      };
      const offset = (page - 1) * limit;

      const { and, sql, desc } = await import("drizzle-orm");

      // Normalize UI terminology — frontend uses "unmatched" mirroring PropX,
      // but the jotform_imports.status enum value is "pending".
      const normalizedStatus =
        status === "unmatched"
          ? "pending"
          : status === "all"
            ? undefined
            : status;

      const conditions: Array<ReturnType<typeof sql>> = [];
      if (normalizedStatus) {
        conditions.push(sql`${jotformImports.status} = ${normalizedStatus}`);
      }
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          sql`(${jotformImports.bolNo} ILIKE ${pattern} OR ${jotformImports.driverName} ILIKE ${pattern} OR ${jotformImports.truckNo} ILIKE ${pattern} OR ${loads.loadNo} ILIKE ${pattern} OR ${loads.ticketNo} ILIKE ${pattern} OR ${loads.bolNo} ILIKE ${pattern})`,
        );
      }
      if (dateFrom) {
        conditions.push(
          sql`${jotformImports.submittedAt} >= ${`${dateFrom}T00:00:00-05:00`}::timestamptz`,
        );
      }
      if (dateTo) {
        conditions.push(
          sql`${jotformImports.submittedAt} <= ${`${dateTo}T23:59:59.999-05:00`}::timestamptz`,
        );
      }
      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      // Count total for pagination meta (same joins as the list query so
      // search hits on load fields count correctly).
      const countQueryBase = db
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(jotformImports)
        .leftJoin(loads, eq(jotformImports.matchedLoadId, loads.id));
      const [countResult] = whereClause
        ? await countQueryBase.where(whereClause)
        : await countQueryBase;
      const total = countResult?.total ?? 0;

      const listQueryBase = db
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
      const rows = whereClause
        ? await listQueryBase.where(whereClause)
        : await listQueryBase;

      // Map to queue item format the frontend expects
      const data = rows.map((r) => ({
        submission: {
          id: r.id,
          bolNumber: r.bolNo,
          driverName: r.driverName,
          truckNo: r.truckNo,
          weight: r.weight,
          photoUrls: resolveJotformPhotoUrls(r.photoUrl, r.imageUrls),
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
              // Surface the load's BOL on the matched object so the UI can
              // show a vocabulary-disambiguation chip when it differs from
              // the submission's OCR-extracted BOL (Logistiq AU... code vs
              // the ticket number the driver wrote on the JotForm).
              bolNo: r.loadBolNo,
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

  // ─── POST /jotform/rematch-pending — retry stuck submissions ──────
  // For each pending jotform_imports row, re-run matchSubmissionToLoad
  // with the stored fields. Picks up matches that work NOW because:
  //   - New aliases on wells (today's orphan absorb workflow)
  //   - Loads ingested AFTER the original sync ran
  //   - Matcher rule changes / Tier 0 BOL validator added 2026-04-14
  // Doesn't re-run OCR (that would re-call Anthropic Vision per row, 2-3
  // hr + cost). Instead just re-applies the matcher to extracted fields
  // already in jotform_imports.
  //
  // Idempotent: a row already matched stays matched; only pending rows are
  // touched. When a match lands:
  //   - jotform_imports.matchedLoadId / matchMethod / matchedAt / status
  //   - assignment.photo_status flipped to 'attached' if the load has one
  //
  // Bounded batch — pass limit (1-2000) to chunk. Returns remaining count
  // for incremental drain.
  fastify.post(
    "/jotform/rematch-pending",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
      schema: {
        body: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 2000, default: 500 },
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
      const { limit = 500 } = (request.body ?? {}) as { limit?: number };
      const { matchSubmissionToLoad } =
        await import("../services/jotform.service.js");

      // ORDER BY id ASC so the OLDEST pending get processed first.
      // Without this, postgres returns unordered + LIMIT, which means
      // when total pending > limit, the oldest never get reached.
      // Discovered 2026-04-25: row 4844 sat unmatched for days because
      // every rematch pass picked the same recent 500 and ignored the
      // older 134.
      const { asc } = await import("drizzle-orm");
      const pending = await db
        .select({
          id: jotformImports.id,
          driverName: jotformImports.driverName,
          truckNo: jotformImports.truckNo,
          bolNo: jotformImports.bolNo,
          weight: jotformImports.weight,
          photoUrl: jotformImports.photoUrl,
          imageUrls: jotformImports.imageUrls,
          submittedAt: jotformImports.submittedAt,
        })
        .from(jotformImports)
        .where(eq(jotformImports.status, "pending"))
        .orderBy(asc(jotformImports.id))
        .limit(limit);

      let newlyMatched = 0;
      let bridged = 0;
      const methodCounts: Record<string, number> = {};
      for (const row of pending) {
        const fields = {
          driverName: row.driverName,
          truckNo: row.truckNo,
          bolNo: row.bolNo,
          weight: row.weight != null ? Number(row.weight) : null,
          loadNo: row.bolNo, // Tier 2 fallback uses bolNo if loadNo absent
          photoUrl: row.photoUrl,
          imageUrls: Array.isArray(row.imageUrls) ? row.imageUrls : [],
          submittedAt: row.submittedAt,
        };
        try {
          const match = await matchSubmissionToLoad(db, fields);
          if (match.matched && match.loadId) {
            await db
              .update(jotformImports)
              .set({
                matchedLoadId: match.loadId,
                matchMethod: match.matchMethod,
                matchedAt: new Date(),
                status: "matched",
              })
              .where(eq(jotformImports.id, row.id));
            newlyMatched += 1;
            methodCounts[match.matchMethod ?? "unknown"] =
              (methodCounts[match.matchMethod ?? "unknown"] ?? 0) + 1;
            // Bridge to assignment.photo_status if there's a photo URL
            const hasPhoto =
              !!row.photoUrl ||
              (Array.isArray(row.imageUrls) && row.imageUrls.length > 0);
            if (hasPhoto) {
              const r = await db
                .update(assignments)
                .set({ photoStatus: "attached", updatedAt: new Date() })
                .where(eq(assignments.loadId, match.loadId))
                .returning({ id: assignments.id });
              if (r.length > 0) bridged += 1;
            }
          }
        } catch {
          // skip per-row failures so a single bad row doesn't kill the batch
        }
      }

      // Remaining count for incremental drain
      const { sql: sqlOp } = await import("drizzle-orm");
      const [{ remaining }] = await db
        .select({ remaining: sqlOp<number>`COUNT(*)::int` })
        .from(jotformImports)
        .where(eq(jotformImports.status, "pending"));

      return {
        success: true,
        data: {
          processed: pending.length,
          newlyMatched,
          bridged,
          methodCounts,
          remaining,
        },
      };
    },
  );

  // ─── GET /jotform/health — pipeline health surface ─────────────────
  // Quantifies every flavor of "data populated but no photo" — the failure
  // mode Jessica specifically called out. Returns counts so the dashboard
  // can pin them; returns sample IDs so dispatch can drill into specific
  // bad rows without table-scanning.
  //
  // Categories returned:
  //   total                — every jotform_imports row
  //   withPhoto            — has photoUrl OR imageUrls.length > 0
  //   noPhotoEverSubmitted — driver submitted form fields but never attached
  //                          a photo (typical: form-only fallback)
  //   matchedNoPhoto       — matched a load BUT no photo URL (most concerning
  //                          — the load shows attached fields with no image
  //                          to verify against)
  //   stuckPending         — pending status > 24hr (matcher couldn't bind)
  //   visionFailed         — Vision OCR errored (lastError set on bol_submissions)
  //
  // Bridge audit:
  //   matchedAndBridged    — matched_load_id set + assignment.photo_status=
  //                          'attached' for that load
  //   matchedNotBridged    — matched_load_id set + assignment.photo_status
  //                          still 'missing' (the bug Phase 3 fixed; should
  //                          stay at 0)
  fastify.get(
    "/jotform/health",
    { preHandler: [fastify.authenticate] },
    async (_request, reply) => {
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
      const { sql, and, isNull, isNotNull, eq, ne } =
        await import("drizzle-orm");

      const [{ total }] = await db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(jotformImports);

      const [{ withPhoto }] = await db
        .select({ withPhoto: sql<number>`COUNT(*)::int` })
        .from(jotformImports)
        .where(
          sql`${jotformImports.photoUrl} IS NOT NULL OR jsonb_array_length(${jotformImports.imageUrls}) > 0`,
        );

      const [{ noPhoto }] = await db
        .select({ noPhoto: sql<number>`COUNT(*)::int` })
        .from(jotformImports)
        .where(
          sql`${jotformImports.photoUrl} IS NULL AND (${jotformImports.imageUrls} IS NULL OR jsonb_array_length(${jotformImports.imageUrls}) = 0)`,
        );

      const [{ matchedNoPhoto }] = await db
        .select({ matchedNoPhoto: sql<number>`COUNT(*)::int` })
        .from(jotformImports)
        .where(
          and(
            isNotNull(jotformImports.matchedLoadId),
            sql`${jotformImports.photoUrl} IS NULL AND (${jotformImports.imageUrls} IS NULL OR jsonb_array_length(${jotformImports.imageUrls}) = 0)`,
          ),
        );

      // Sample 5 most recent matched-no-photo rows for drilling
      const matchedNoPhotoSamples = await db
        .select({
          id: jotformImports.id,
          driverName: jotformImports.driverName,
          bolNo: jotformImports.bolNo,
          matchedLoadId: jotformImports.matchedLoadId,
          submittedAt: jotformImports.submittedAt,
        })
        .from(jotformImports)
        .where(
          and(
            isNotNull(jotformImports.matchedLoadId),
            sql`${jotformImports.photoUrl} IS NULL AND (${jotformImports.imageUrls} IS NULL OR jsonb_array_length(${jotformImports.imageUrls}) = 0)`,
          ),
        )
        .orderBy(sql`${jotformImports.submittedAt} DESC NULLS LAST`)
        .limit(5);

      // Stuck pending: created > 24h ago, status=pending. Pass an ISO
      // string here, not a Date — postgres.js (prepare:false) crashes when
      // a JS Date lands as a parameterized value. See project memory
      // `feedback_postgres_date_gotcha.md`.
      const since24hIso = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString();
      const [{ stuckPending }] = await db
        .select({ stuckPending: sql<number>`COUNT(*)::int` })
        .from(jotformImports)
        .where(
          and(
            eq(jotformImports.status, "pending"),
            sql`${jotformImports.submittedAt} < ${since24hIso}`,
          ),
        );

      // Bridge audit — matched imports whose load assignment is still 'missing'.
      // Should be 0 after Phase 3 ran. If non-zero, Phase 3 needs re-run OR
      // the JotForm sync's bridge step has regressed.
      const [{ matchedNotBridged }] = await db
        .select({ matchedNotBridged: sql<number>`COUNT(*)::int` })
        .from(jotformImports)
        .innerJoin(
          assignments,
          eq(assignments.loadId, jotformImports.matchedLoadId),
        )
        .where(
          and(
            isNotNull(jotformImports.matchedLoadId),
            ne(assignments.photoStatus, "attached"),
            sql`(${jotformImports.photoUrl} IS NOT NULL OR jsonb_array_length(${jotformImports.imageUrls}) > 0)`,
          ),
        );

      // Sample of unreachable photo URLs would require a probe step — too
      // expensive to do here on every request. Surface count of NULL photoUrl
      // imports separately so the dashboard can flag.

      return {
        success: true,
        data: {
          total,
          withPhoto,
          noPhoto,
          noPhotoPct:
            total > 0 ? Math.round((noPhoto / total) * 100 * 100) / 100 : 0,
          matchedNoPhoto,
          stuckPending,
          matchedNotBridged,
          samples: {
            matchedNoPhoto: matchedNoPhotoSamples,
          },
          generatedAt: new Date().toISOString(),
        },
      };
    },
  );

  // ─── GET /jotform/pending-investigation — driver-grouped pending overview
  // Discovered 2026-04-25: ~600 pending JotForm submissions are for
  // loads dispatched outside PropX/Logistiq. Drivers like Fernando
  // Herrera have 108 pending while having matched ZERO recently. This
  // endpoint groups pending submissions by driver and surfaces the
  // pattern: who's the driver, when was their last matched load, when
  // was their last pending submission, and recommended action.
  fastify.get(
    "/jotform/pending-investigation",
    { preHandler: [fastify.authenticate] },
    async (_request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: { code: "SERVICE_UNAVAILABLE" },
        });
      }
      const { sql } = await import("drizzle-orm");

      const rows = await db.execute<{
        driver_name: string | null;
        pending_count: number;
        matched_count: number;
        last_pending: string | null;
        last_matched: string | null;
        last_load_in_system: string | null;
        loads_in_system: number;
      }>(sql`
        WITH driver_stats AS (
          SELECT
            ji.driver_name,
            COUNT(*) FILTER (WHERE ji.status = 'pending')::int AS pending_count,
            COUNT(*) FILTER (WHERE ji.status = 'matched')::int AS matched_count,
            MAX(CASE WHEN ji.status='pending' THEN ji.submitted_at END)::text AS last_pending,
            MAX(CASE WHEN ji.status='matched' THEN ji.submitted_at END)::text AS last_matched
          FROM jotform_imports ji
          WHERE ji.driver_name IS NOT NULL
          GROUP BY ji.driver_name
        ),
        load_stats AS (
          SELECT
            l.driver_name,
            COUNT(*)::int AS loads_in_system,
            MAX(l.delivered_on)::text AS last_load_in_system
          FROM loads l
          WHERE l.driver_name IS NOT NULL
          GROUP BY l.driver_name
        )
        SELECT
          ds.driver_name,
          ds.pending_count,
          ds.matched_count,
          ds.last_pending,
          ds.last_matched,
          ls.last_load_in_system,
          COALESCE(ls.loads_in_system, 0) AS loads_in_system
        FROM driver_stats ds
        LEFT JOIN load_stats ls ON ls.driver_name = ds.driver_name
        WHERE ds.pending_count > 0
        ORDER BY ds.pending_count DESC, ds.driver_name ASC
      `);

      const driverRows =
        (rows as unknown as { rows?: Array<Record<string, unknown>> }).rows ??
        (rows as unknown as Array<Record<string, unknown>>);

      const drivers = driverRows.map((r) => {
        const lastPending = r.last_pending
          ? new Date(r.last_pending as string)
          : null;
        const lastLoad = r.last_load_in_system
          ? new Date(r.last_load_in_system as string)
          : null;
        const daysGap =
          lastPending && lastLoad
            ? Math.round(
                (lastPending.getTime() - lastLoad.getTime()) /
                  (1000 * 60 * 60 * 24),
              )
            : null;

        // Suggestion logic
        let suggestion: string;
        let category: string;
        if (Number(r.loads_in_system) === 0) {
          suggestion =
            "Driver has NO loads in v2 — likely third-source dispatch. Manual create or investigate.";
          category = "third_source";
        } else if (daysGap != null && daysGap > 30) {
          suggestion = `Driver has loads in v2 but last one was ${daysGap} days ago — possibly moved to manual dispatch since then.`;
          category = "moved_to_manual";
        } else if (Number(r.matched_count) > 0) {
          suggestion =
            "Driver matches sometimes — likely typo or carrier-export lag. Try rematch first.";
          category = "intermittent";
        } else {
          suggestion =
            "Driver has loads in v2 but never matches — investigate name normalization.";
          category = "name_mismatch";
        }

        return {
          driverName: r.driver_name,
          pendingCount: Number(r.pending_count),
          matchedCount: Number(r.matched_count),
          loadsInSystem: Number(r.loads_in_system),
          lastPending: r.last_pending,
          lastMatched: r.last_matched,
          lastLoadInSystem: r.last_load_in_system,
          daysGapPendingVsLastLoad: daysGap,
          suggestion,
          category,
        };
      });

      // Aggregate by category
      const byCategory: Record<
        string,
        { drivers: number; pendingTotal: number }
      > = {};
      for (const d of drivers) {
        if (!byCategory[d.category]) {
          byCategory[d.category] = { drivers: 0, pendingTotal: 0 };
        }
        byCategory[d.category].drivers += 1;
        byCategory[d.category].pendingTotal += d.pendingCount;
      }

      return {
        success: true,
        data: {
          totalPending: drivers.reduce((s, d) => s + d.pendingCount, 0),
          totalDrivers: drivers.length,
          byCategory,
          drivers,
        },
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
