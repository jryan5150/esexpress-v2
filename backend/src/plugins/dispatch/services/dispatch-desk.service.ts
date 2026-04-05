import { eq, and, inArray, sql, or, count } from "drizzle-orm";
import {
  assignments,
  loads,
  wells,
  photos,
  jotformImports,
  users,
} from "../../../db/schema.js";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from "../../../lib/errors.js";
import { transitionStatus } from "./assignments.service.js";
import type { Database } from "../../../db/client.js";
import type { PhotoStatus } from "../../../db/schema.js";
import { eraFilter } from "../lib/era-filter.js";

// ─── PURE FUNCTIONS ───────────────────────────────────────────────

/**
 * Compute photo status from photo counts.
 * - 0 total photos → 'missing'
 * - all matched → 'attached'
 * - some matched → 'pending'
 */
export function computePhotoStatus(
  matched: number,
  total: number,
): PhotoStatus {
  if (total === 0) return "missing";
  if (matched >= total) return "attached";
  return "pending";
}

/**
 * Gate: can this assignment be marked as entered in PCS?
 * - 'missing' → blocked (red gate)
 * - 'pending' → allowed with amber warning
 * - 'attached' → allowed (green)
 */
export function canMarkEntered(photoStatus: PhotoStatus): boolean {
  return photoStatus !== "missing";
}

// ─── QUERY TYPES ──────────────────────────────────────────────────

export interface DispatchDeskFilters {
  wellId?: number;
  photoStatus?: PhotoStatus;
  date?: string;
  era?: string;
  page?: number;
  limit?: number;
}

export interface DispatchDeskRow {
  assignmentId: number;
  assignmentStatus: string;
  photoStatus: string | null;
  pcsSequence: number | null;
  autoMapTier: number | null;
  autoMapScore: string | null;
  loadId: number;
  loadNo: string;
  driverName: string | null;
  truckNo: string | null;
  carrierName: string | null;
  productDescription: string | null;
  weightTons: string | null;
  bolNo: string | null;
  ticketNo: string | null;
  deliveredOn: Date | null;
  wellId: number;
  wellName: string;
  canEnter: boolean;
}

export interface DispatchReadiness {
  total: number;
  dispatchReady: number;
  photosAttached: number;
  photosPending: number;
  photosMissing: number;
  readinessRate: number;
  photoAttachmentRate: number;
  fieldCompleteness: {
    driverName: number;
    loadNo: number;
    bolNo: number;
    ticketNo: number;
    weightTons: number;
  };
}

// ─── QUERY FUNCTIONS ─────────────────────────────────────────────

/**
 * Fetch dispatch desk loads with joined well + load data.
 * Applies filters for wellId, photoStatus, and date.
 * Returns paginated results sorted by pcsSequence asc, createdAt desc.
 */
export async function getDispatchDeskLoads(
  db: Database,
  filters: DispatchDeskFilters = {},
): Promise<{
  data: DispatchDeskRow[];
  meta: { page: number; limit: number; count: number };
}> {
  const { wellId, photoStatus, date, era, page = 1, limit = 100 } = filters;
  const offset = (page - 1) * limit;

  // Build where conditions — show pending + assigned + dispatch_ready
  const conditions = [
    or(
      eq(assignments.status, "pending"),
      eq(assignments.status, "assigned"),
      eq(assignments.status, "dispatch_ready"),
    )!,
  ];

  if (wellId != null) {
    conditions.push(eq(assignments.wellId, wellId));
  }

  if (photoStatus != null) {
    conditions.push(eq(assignments.photoStatus, photoStatus));
  }

  if (date) {
    // Filter on loads.deliveredOn (the actual delivery date), not assignments.createdAt.
    // Use America/Chicago (CDT) since dispatchers are in Texas.
    // Explicit ::timestamptz cast ensures PostgreSQL uses the deliveredOn index.
    const startOfDay = `${date}T00:00:00-05:00`;
    const endOfDay = `${date}T23:59:59.999-05:00`;
    conditions.push(sql`${loads.deliveredOn} >= ${startOfDay}::timestamptz`);
    conditions.push(sql`${loads.deliveredOn} <= ${endOfDay}::timestamptz`);
  }

  conditions.push(eraFilter(era));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      assignmentId: assignments.id,
      assignmentStatus: assignments.status,
      photoStatus: assignments.photoStatus,
      pcsSequence: assignments.pcsSequence,
      autoMapTier: assignments.autoMapTier,
      autoMapScore: assignments.autoMapScore,
      loadId: loads.id,
      loadNo: loads.loadNo,
      driverName: loads.driverName,
      truckNo: loads.truckNo,
      trailerNo: loads.trailerNo,
      carrierName: loads.carrierName,
      productDescription: loads.productDescription,
      weightTons: loads.weightTons,
      netWeightTons: loads.netWeightTons,
      bolNo: loads.bolNo,
      ticketNo: loads.ticketNo,
      rate: loads.rate,
      mileage: loads.mileage,
      deliveredOn: loads.deliveredOn,
      rawData: loads.rawData,
      assignedTo: assignments.assignedTo,
      assignedToName: users.name,
      assignedToColor: users.color,
      wellId: wells.id,
      wellName: wells.name,
      // JotForm photo data (left join — may be null)
      jotformSubmissionId: jotformImports.jotformSubmissionId,
      jotformPhotoUrl: jotformImports.photoUrl,
      jotformImageUrls: jotformImports.imageUrls,
      jotformDriverName: jotformImports.driverName,
      jotformBolNo: jotformImports.bolNo,
    })
    .from(assignments)
    .innerJoin(loads, eq(assignments.loadId, loads.id))
    .innerJoin(wells, eq(assignments.wellId, wells.id))
    .leftJoin(users, eq(assignments.assignedTo, users.id))
    .leftJoin(jotformImports, eq(jotformImports.matchedLoadId, loads.id))
    .where(whereClause)
    .orderBy(
      sql`${loads.deliveredOn} desc nulls last`,
      sql`${assignments.pcsSequence} asc nulls last`,
      sql`${loads.createdAt} desc`,
    )
    .limit(limit)
    .offset(offset);

  const data = rows.map((row) => {
    const raw = (row.rawData ?? {}) as Record<string, unknown>;
    return {
      assignmentId: row.assignmentId,
      assignmentStatus: row.assignmentStatus,
      photoStatus: row.photoStatus,
      pcsSequence: row.pcsSequence,
      autoMapTier: row.autoMapTier,
      autoMapScore: row.autoMapScore,
      loadId: row.loadId,
      loadNo: row.loadNo,
      driverName: row.driverName,
      truckNo: row.truckNo,
      trailerNo: row.trailerNo,
      carrierName: row.carrierName,
      productDescription: row.productDescription,
      weightTons: row.weightTons,
      netWeightTons: row.netWeightTons,
      bolNo: row.bolNo,
      ticketNo: row.ticketNo,
      deliveredOn: row.deliveredOn,
      wellId: row.wellId,
      wellName: row.wellName,
      rate: row.rate,
      mileage: row.mileage,
      assignedTo: row.assignedTo,
      assignedToName: row.assignedToName,
      assignedToColor: row.assignedToColor,
      canEnter: canMarkEntered((row.photoStatus ?? "missing") as PhotoStatus),
      // Times extracted from PropX rawData
      pickupTime: raw.terminal_on ?? null,
      arrivalTime: raw.destination_on ?? null,
      transitTime: raw.transit_on ?? null,
      assignedTime: raw.assigned_on ?? null,
      acceptedTime: raw.accepted_on ?? null,
      grossWeightLbs: raw.gross_weight ?? null,
      netWeightLbs: raw.weight ?? null,
      tareWeightLbs: raw.tare_weight ?? null,
      terminalName: raw.terminal_name ?? null,
      // Financial (from rawData)
      lineHaul: raw.total_hauling ?? raw.total_amount ?? null,
      fuelSurcharge: raw.fuel_surcharge ?? raw.fuelsurcharge ?? null,
      totalCharge: raw.total_charge ?? raw.total_revenue ?? null,
      customerRate: raw.customer_rate ?? null,
      // Identity (from rawData)
      orderNo: raw.order_no ?? raw.order_number ?? null,
      invoiceNo: raw.invoice_no ?? raw.invoice_number ?? null,
      poNo: raw.carrier_po ?? raw.po ?? raw.po_number ?? null,
      referenceNo: raw.reference_no ?? raw.reference_number ?? null,
      // Operations
      loaderName: raw.crew_name ?? null,
      jobName: raw.job_name ?? null,
      loadStatus: raw.load_status ?? raw.status ?? null,
      // Demurrage (from rawData)
      demurrageAtLoader: raw.demurrage_at_loader ?? null,
      demurrageAtLoaderHours: raw.demurrage_at_loader_hour ?? null,
      demurrageAtLoaderMinutes: raw.demurrage_at_loader_minutes ?? null,
      demurrageAtDestination: raw.demurrage_at_destination ?? null,
      demurrageAtDestHours: raw.demurrage_at_destination_hour ?? null,
      demurrageAtDestMinutes: raw.demurrage_at_destination_minutes ?? null,
      // Timeline gaps (from rawData)
      loadOutTime: raw.terminal_off ?? raw.terminal_off_time ?? null,
      loadTotalTime: raw.terminal_total_time ?? null,
      unloadTotalTime: raw.destination_total_time ?? null,
      appointmentTime: raw.appt_time ?? null,
      // Additional identity
      settlementDate: raw.settlement_date ?? null,
      shipperBol: raw.shipper_bol ?? raw.shipper_bol_no ?? null,
      dispatcherNotes: raw.dispatcher_notes ?? null,
      // JotForm cross-reference (for BOL verification)
      jotformBolNo: row.jotformBolNo ?? null,
      jotformDriverName: row.jotformDriverName ?? null,
      // Photo: use GCS proxy URL if submission ID available, else raw JotForm URL
      jotformSubmissionId: row.jotformSubmissionId ?? null,
      photoUrls: row.jotformSubmissionId
        ? [`/api/v1/verification/photos/gcs/${row.jotformSubmissionId}`]
        : [],
    };
  });

  // Parallel count query for accurate pagination
  const [countResult] = await db
    .select({ total: sql<number>`cast(count(*) as int)` })
    .from(assignments)
    .innerJoin(loads, eq(assignments.loadId, loads.id))
    .innerJoin(wells, eq(assignments.wellId, wells.id))
    .where(whereClause);

  return { items: data, total: countResult?.total ?? data.length, page, limit };
}

// ─── MUTATION FUNCTIONS ───────────────────────────────────────────

export interface MarkEnteredInput {
  assignmentIds: number[];
  pcsStartingNumber: number;
  userId: number;
  userName: string;
}

export interface MarkEnteredResult {
  assignmentId: number;
  success: boolean;
  pcsSequence?: number;
  blocked?: boolean;
  reason?: string;
  error?: string;
}

/**
 * Mark assignments as entered in PCS.
 * - Enforces photo gate: 'missing' photo status blocks entry.
 * - Assigns sequential PCS numbers starting from pcsStartingNumber.
 * - Transitions status to 'dispatch_ready'.
 * - Returns per-assignment results with blocked flag for 'missing' photos.
 */
export async function markEntered(
  db: Database,
  input: MarkEnteredInput,
): Promise<MarkEnteredResult[]> {
  const { assignmentIds, pcsStartingNumber, userId, userName } = input;

  // Fetch all assignments in one query
  const existing = await db
    .select()
    .from(assignments)
    .where(inArray(assignments.id, assignmentIds));

  const existingById = new Map(existing.map((a) => [a.id, a]));

  const results: MarkEnteredResult[] = [];
  let sequenceOffset = 0;

  for (const assignmentId of assignmentIds) {
    const assignment = existingById.get(assignmentId);

    if (!assignment) {
      results.push({
        assignmentId,
        success: false,
        error: `Assignment ${assignmentId} not found`,
      });
      continue;
    }

    const photoStatus = (assignment.photoStatus ?? "missing") as PhotoStatus;

    // Photo gate: block if missing
    if (!canMarkEntered(photoStatus)) {
      results.push({
        assignmentId,
        success: false,
        blocked: true,
        reason:
          "Photo status is missing — attach a photo before entering in PCS",
      });
      continue;
    }

    // Status gate: must be dispatch_ready to enter in PCS
    if (assignment.status !== "dispatch_ready") {
      results.push({
        assignmentId,
        success: false,
        blocked: true,
        reason: `Assignment must be in dispatch_ready status to enter in PCS (current: ${assignment.status})`,
      });
      continue;
    }

    const pcsSequence = pcsStartingNumber + sequenceOffset;
    sequenceOffset += 1;

    try {
      // Use transitionStatus to enforce state machine validation (dispatch_ready -> dispatching)
      await transitionStatus(
        db,
        assignmentId,
        "dispatching",
        userId,
        userName,
        "Marked entered via dispatch desk",
      );

      // Separately update pcsSequence — not part of the state machine, just a PCS tracking field
      await db
        .update(assignments)
        .set({ pcsSequence, updatedAt: new Date() })
        .where(eq(assignments.id, assignmentId));

      results.push({ assignmentId, success: true, pcsSequence });
    } catch (err: any) {
      results.push({ assignmentId, success: false, error: err.message });
    }
  }

  return results;
}

// ─── READINESS ANALYSIS ───────────────────────────────────────────

/**
 * Compute field completeness and dispatch readiness metrics.
 * Used by the dispatch-readiness endpoint.
 */
export async function getDispatchReadiness(
  db: Database,
): Promise<DispatchReadiness> {
  // Get total active assignments and their photo status breakdown
  const statusCounts = await db
    .select({
      photoStatus: assignments.photoStatus,
      count: sql<number>`count(*)`,
    })
    .from(assignments)
    .groupBy(assignments.photoStatus);

  const dispatchReadyCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(assignments)
    .where(eq(assignments.status, "dispatch_ready"));

  // Field completeness: count assignments where joined load field is non-null
  // Scoped to dispatch_ready only — readiness metrics are only meaningful for that status
  const fieldStats = await db
    .select({
      total: sql<number>`count(*)`,
      hasDriverName: sql<number>`count(${loads.driverName})`,
      hasLoadNo: sql<number>`count(${loads.loadNo})`,
      hasBolNo: sql<number>`count(${loads.bolNo})`,
      hasTicketNo: sql<number>`count(${loads.ticketNo})`,
      hasWeightTons: sql<number>`count(${loads.weightTons})`,
    })
    .from(assignments)
    .innerJoin(loads, eq(assignments.loadId, loads.id))
    .where(eq(assignments.status, "dispatch_ready"));

  const photoMap = new Map(
    statusCounts.map((r) => [r.photoStatus, Number(r.count)]),
  );
  const attached = photoMap.get("attached") ?? 0;
  const pending = photoMap.get("pending") ?? 0;
  const missing = photoMap.get("missing") ?? 0;
  const total = attached + pending + missing;

  const drCount = Number(dispatchReadyCount[0]?.count ?? 0);
  const fs = fieldStats[0] ?? {
    total: 0,
    hasDriverName: 0,
    hasLoadNo: 0,
    hasBolNo: 0,
    hasTicketNo: 0,
    hasWeightTons: 0,
  };

  const fsTotal = Number(fs.total) || 1; // avoid division by zero

  return {
    total,
    dispatchReady: drCount,
    photosAttached: attached,
    photosPending: pending,
    photosMissing: missing,
    readinessRate: total > 0 ? Math.round((drCount / total) * 100) / 100 : 0,
    photoAttachmentRate:
      total > 0 ? Math.round((attached / total) * 100) / 100 : 0,
    fieldCompleteness: {
      driverName: Math.round((Number(fs.hasDriverName) / fsTotal) * 100) / 100,
      loadNo: Math.round((Number(fs.hasLoadNo) / fsTotal) * 100) / 100,
      bolNo: Math.round((Number(fs.hasBolNo) / fsTotal) * 100) / 100,
      ticketNo: Math.round((Number(fs.hasTicketNo) / fsTotal) * 100) / 100,
      weightTons: Math.round((Number(fs.hasWeightTons) / fsTotal) * 100) / 100,
    },
  };
}

// ─── MISSING TICKETS ─────────────────────────────────────────────

/**
 * Loads with active assignments that have no ticketNo AND no matched JotForm submission.
 * These loads cannot be safely dispatched to PCS (POST-only, no corrections).
 */
export async function getMissingTicketLoads(
  db: Database,
  opts: { page?: number; limit?: number } = {},
) {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 50;
  const offset = (page - 1) * limit;

  const activeStatuses = ["pending", "assigned", "dispatch_ready"];

  const [countResult] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(assignments)
    .innerJoin(loads, eq(assignments.loadId, loads.id))
    .leftJoin(jotformImports, eq(jotformImports.matchedLoadId, loads.id))
    .where(
      and(
        inArray(assignments.status, activeStatuses),
        sql`${loads.ticketNo} IS NULL`,
        sql`${jotformImports.id} IS NULL`,
      ),
    );

  const total = countResult?.count ?? 0;

  const rows = await db
    .select({
      assignmentId: assignments.id,
      assignmentStatus: assignments.status,
      loadId: loads.id,
      loadNo: loads.loadNo,
      driverName: loads.driverName,
      truckNo: loads.truckNo,
      carrierName: loads.carrierName,
      weightTons: loads.weightTons,
      bolNo: loads.bolNo,
      deliveredOn: loads.deliveredOn,
      wellId: wells.id,
      wellName: wells.name,
    })
    .from(assignments)
    .innerJoin(loads, eq(assignments.loadId, loads.id))
    .innerJoin(wells, eq(assignments.wellId, wells.id))
    .leftJoin(jotformImports, eq(jotformImports.matchedLoadId, loads.id))
    .where(
      and(
        inArray(assignments.status, activeStatuses),
        sql`${loads.ticketNo} IS NULL`,
        sql`${jotformImports.id} IS NULL`,
      ),
    )
    .orderBy(sql`${loads.deliveredOn} desc nulls last`)
    .limit(limit)
    .offset(offset);

  return { data: rows, meta: { page, limit, total } };
}
