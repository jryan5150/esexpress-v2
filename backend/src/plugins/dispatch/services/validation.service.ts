import { eq, and, sql, desc, isNull, gte, lte } from "drizzle-orm";
import { assignments, loads, wells } from "../../../db/schema.js";

/**
 * Build a date-bounded SQL clause for `loads.deliveredOn` based on
 * dateFrom/dateTo strings (YYYY-MM-DD). Anchors to America/Chicago so
 * "today" means today in Jessica's local time, not UTC midnight. Per
 * her Apr 15 ask: "if you actually put in like the 13th to the 15th,
 * which would be more like what we're working on."
 */
function buildDateClause(opts: { dateFrom?: string; dateTo?: string }) {
  const conditions: ReturnType<typeof gte>[] = [];
  if (opts.dateFrom) {
    conditions.push(
      gte(
        loads.deliveredOn,
        sql`${`${opts.dateFrom}T00:00:00-05:00`}::timestamptz`,
      ),
    );
  }
  if (opts.dateTo) {
    conditions.push(
      lte(
        loads.deliveredOn,
        sql`${`${opts.dateTo}T23:59:59.999-05:00`}::timestamptz`,
      ),
    );
  }
  return conditions;
}
import { transitionStatus, createAssignment } from "./assignments.service.js";
import { createLocationMapping } from "./mappings.service.js";
import { NotFoundError } from "../../../lib/errors.js";
import type { Database } from "../../../db/client.js";

// ─── Summary ─────────────────────────────────────────────────────────────────

export interface ValidationSummary {
  tier1: number;
  tier2: number;
  tier3: number;
  total: number;
}

export async function getValidationSummary(
  db: Database,
  opts: { dateFrom?: string; dateTo?: string } = {},
): Promise<ValidationSummary> {
  // Count pending assignments tier-by-tier, but only where the load is NOT
  // historical_complete. Pre-cutoff loads were already dispatched via PCS
  // during v2 build — their stale pending assignments must not pollute the
  // validation queue. Date bounds (when supplied) scope to loads.deliveredOn
  // so the counts at the top match what the operator sees in each tier.
  const dateConds = buildDateClause(opts);
  const rows = await db
    .select({
      tier: assignments.autoMapTier,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(assignments)
    .innerJoin(loads, eq(assignments.loadId, loads.id))
    .where(
      and(
        eq(assignments.status, "pending"),
        eq(loads.historicalComplete, false),
        ...dateConds,
      ),
    )
    .groupBy(assignments.autoMapTier);

  let tier1 = 0;
  let tier2 = 0;
  let tier3 = 0;

  for (const row of rows) {
    if (row.tier === 1) tier1 = row.count;
    else if (row.tier === 2) tier2 = row.count;
    else if (row.tier === 3) tier3 = row.count;
  }

  // Count unresolved loads (no assignment at all) as Tier 3
  // Exclude historical_complete loads — they're pre-cutoff already-dispatched
  // records that live in the archive, not in the validation queue.
  const [unmapped] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(loads)
    .leftJoin(assignments, eq(loads.id, assignments.loadId))
    .where(
      and(
        isNull(assignments.id),
        eq(loads.historicalComplete, false),
        ...dateConds,
      ),
    );

  tier3 += unmapped?.count ?? 0;

  return { tier1, tier2, tier3, total: tier1 + tier2 + tier3 };
}

// ─── By Tier (with joined load + well data) ──────────────────────────────────

export async function getAssignmentsByTier(
  db: Database,
  tier: number,
  opts: {
    page?: number;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
  } = {},
) {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 50;
  const offset = (page - 1) * limit;
  const dateConds = buildDateClause(opts);

  // Tier 3: return unmapped loads (no assignment) for manual resolution
  // Exclude historical_complete — those go to archive, not validation queue
  if (tier === 3) {
    const [countResult] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(loads)
      .leftJoin(assignments, eq(loads.id, assignments.loadId))
      .where(
        and(
          isNull(assignments.id),
          eq(loads.historicalComplete, false),
          ...dateConds,
        ),
      );

    const total = countResult?.count ?? 0;

    const data = await db
      .select({
        id: loads.id,
        wellId: sql<number>`0`.as("well_id"),
        loadId: loads.id,
        status: sql<string>`'unresolved'`.as("status"),
        autoMapTier: sql<number>`3`.as("auto_map_tier"),
        autoMapScore: sql<string | null>`null`.as("auto_map_score"),
        photoStatus: sql<string>`'missing'`.as("photo_status"),
        createdAt: loads.createdAt,
        loadNo: loads.loadNo,
        driverName: loads.driverName,
        destinationName: loads.destinationName,
        carrierName: loads.carrierName,
        weightTons: loads.weightTons,
        ticketNo: loads.ticketNo,
        bolNo: loads.bolNo,
        wellName: sql<string>`'-- Unresolved --'`.as("well_name"),
      })
      .from(loads)
      .leftJoin(assignments, eq(loads.id, assignments.loadId))
      .where(
        and(
          isNull(assignments.id),
          eq(loads.historicalComplete, false),
          ...dateConds,
        ),
      )
      .orderBy(desc(loads.createdAt))
      .limit(limit)
      .offset(offset);

    return { data, total };
  }

  // Tier 1/2: pending assignments where the load is NOT historical_complete.
  // Historical loads live in the archive, not in the validation queue.
  const whereClause = and(
    eq(assignments.status, "pending"),
    eq(assignments.autoMapTier, tier),
    eq(loads.historicalComplete, false),
    ...dateConds,
  );

  const [countResult] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(assignments)
    .innerJoin(loads, eq(assignments.loadId, loads.id))
    .where(whereClause);

  const total = countResult?.count ?? 0;

  const { jotformImports } = await import("../../../db/schema.js");
  const { resolveJotformPhotoUrls } =
    await import("../../verification/lib/photo-urls.js");
  const rows = await db
    .select({
      id: assignments.id,
      wellId: assignments.wellId,
      loadId: assignments.loadId,
      status: assignments.status,
      autoMapTier: assignments.autoMapTier,
      autoMapScore: assignments.autoMapScore,
      photoStatus: assignments.photoStatus,
      createdAt: assignments.createdAt,
      loadNo: loads.loadNo,
      driverName: loads.driverName,
      destinationName: loads.destinationName,
      carrierName: loads.carrierName,
      weightTons: loads.weightTons,
      ticketNo: loads.ticketNo,
      bolNo: loads.bolNo,
      truckNo: loads.truckNo,
      trailerNo: loads.trailerNo,
      deliveredOn: loads.deliveredOn,
      wellName: wells.name,
      // Post-2026-04-15: expose JotForm photo URLs + the photo's extracted
      // BOL so the merged Validation Desk can render thumbnails and show
      // photo-vs-load discrepancies inline without a second fetch.
      jotformPhotoUrl: jotformImports.photoUrl,
      jotformImageUrls: jotformImports.imageUrls,
      jotformBolNo: jotformImports.bolNo,
      jotformDriverName: jotformImports.driverName,
      jotformTruckNo: jotformImports.truckNo,
      jotformWeight: jotformImports.weight,
    })
    .from(assignments)
    .innerJoin(loads, eq(assignments.loadId, loads.id))
    .innerJoin(wells, eq(assignments.wellId, wells.id))
    .leftJoin(jotformImports, eq(jotformImports.matchedLoadId, loads.id))
    .where(whereClause)
    .orderBy(desc(assignments.createdAt))
    .limit(limit)
    .offset(offset);

  const data = rows.map((r) => ({
    ...r,
    photoUrls: resolveJotformPhotoUrls(r.jotformPhotoUrl, r.jotformImageUrls),
  }));

  return { data, total };
}

// ─── Alias Learning Helpers ───────────────────────────────────────────────────

async function addWellAlias(
  db: Database,
  wellId: number,
  sourceName: string,
  userId: number,
  action: "confirmed" | "rejected" | "manual_assign",
): Promise<void> {
  const [well] = await db
    .select()
    .from(wells)
    .where(eq(wells.id, wellId))
    .limit(1);
  if (!well) return;

  const normalized = sourceName.toLowerCase().trim();
  const existing = (well.aliases ?? []) as string[];

  const updates: Record<string, unknown> = {
    matchFeedback: [
      ...(well.matchFeedback ?? []),
      { sourceName, action, by: userId, at: new Date().toISOString() },
    ],
    updatedAt: new Date(),
  };

  // Only add alias for confirmed/manual_assign — rejected doesn't earn an alias
  if (action !== "rejected" && !existing.includes(normalized)) {
    updates.aliases = [...existing, normalized];
  }

  await db.update(wells).set(updates).where(eq(wells.id, wellId));
}

// ─── Confirm ──────────────────────────────────────────────────────────────────

export async function confirmMatch(
  db: Database,
  assignmentId: number,
  userId: number,
  userName: string,
): Promise<
  ReturnType<typeof transitionStatus> extends Promise<infer T> ? T : never
> {
  const [assignment] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!assignment) throw new NotFoundError("Assignment", assignmentId);

  // Load destination_name for alias learning
  const [load] = await db
    .select({ destinationName: loads.destinationName })
    .from(loads)
    .where(eq(loads.id, assignment.loadId))
    .limit(1);

  const updated = await transitionStatus(
    db,
    assignmentId,
    "assigned",
    userId,
    userName,
    "Confirmed via validation review",
  );

  // Alias learning loop
  if (load?.destinationName) {
    await addWellAlias(
      db,
      assignment.wellId,
      load.destinationName,
      userId,
      "confirmed",
    );
    await createLocationMapping(db, {
      sourceName: load.destinationName,
      wellId: assignment.wellId,
      confidence: "1.000",
      confirmed: true,
    });
  }

  return updated as any;
}

// ─── Reject ───────────────────────────────────────────────────────────────────

export async function rejectMatch(
  db: Database,
  assignmentId: number,
  userId: number,
  userName: string,
  reason?: string,
): Promise<
  ReturnType<typeof transitionStatus> extends Promise<infer T> ? T : never
> {
  const [assignment] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!assignment) throw new NotFoundError("Assignment", assignmentId);

  // Load destination_name for negative feedback recording
  const [load] = await db
    .select({ destinationName: loads.destinationName })
    .from(loads)
    .where(eq(loads.id, assignment.loadId))
    .limit(1);

  const updated = await transitionStatus(
    db,
    assignmentId,
    "cancelled",
    userId,
    userName,
    reason ? `Rejected: ${reason}` : "Rejected via validation review",
  );

  // Record negative feedback — does NOT add alias
  if (load?.destinationName) {
    await addWellAlias(
      db,
      assignment.wellId,
      load.destinationName,
      userId,
      "rejected",
    );
  }

  return updated as any;
}

// ─── Manual Resolve ───────────────────────────────────────────────────────────

export async function manualResolve(
  db: Database,
  loadId: number,
  wellId: number,
  userId: number,
  userName: string,
) {
  // Verify load exists
  const [load] = await db
    .select()
    .from(loads)
    .where(eq(loads.id, loadId))
    .limit(1);
  if (!load) throw new NotFoundError("Load", loadId);

  // Verify well exists
  const [well] = await db
    .select()
    .from(wells)
    .where(eq(wells.id, wellId))
    .limit(1);
  if (!well) throw new NotFoundError("Well", wellId);

  // Create assignment
  const assignment = await createAssignment(db, {
    wellId,
    loadId,
    assignedBy: userId,
    assignedByName: userName,
    autoMapTier: 3, // Manual resolve is a Tier 3 override
  });

  // Transition immediately to assigned
  const updated = await transitionStatus(
    db,
    assignment.id,
    "assigned",
    userId,
    userName,
    "Manually resolved via validation review",
  );

  // Alias learning loop — manual assign is the strongest training signal
  if (load.destinationName) {
    await addWellAlias(
      db,
      wellId,
      load.destinationName,
      userId,
      "manual_assign",
    );
    await createLocationMapping(db, {
      sourceName: load.destinationName,
      wellId,
      confidence: "1.000",
      confirmed: true,
    });
  }

  return updated;
}

// ─── Trust Sheets (Bulk) ──────────────────────────────────────────────────────

export interface TrustSheetsResult {
  assignmentId: number;
  success: boolean;
  error?: string;
}

export async function trustSheets(
  db: Database,
  assignmentIds: number[],
  userId: number,
  userName: string,
): Promise<TrustSheetsResult[]> {
  const results: TrustSheetsResult[] = [];

  for (const id of assignmentIds) {
    try {
      await transitionStatus(
        db,
        id,
        "assigned",
        userId,
        userName,
        "Trusted via sheets bulk approval",
      );
      results.push({ assignmentId: id, success: true });
    } catch (err: any) {
      results.push({ assignmentId: id, success: false, error: err.message });
    }
  }

  return results;
}
