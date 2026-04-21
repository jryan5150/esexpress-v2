/**
 * Payment Service -- Track 7.1
 * =============================
 *
 * Driver payment batch service: batch creation, payment calculation,
 * status machine, deduction management, and Sheets export support.
 *
 * V1 reference: backend/services/paymentService.js (MongoDB/Mongoose)
 * V2: Drizzle ORM + PostgreSQL, functional exports, join table for loads.
 */

import { eq, and, sql, between } from "drizzle-orm";
import {
  paymentBatches,
  paymentBatchLoads,
  loads,
} from "../../../db/schema.js";
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from "../../../lib/errors.js";
import type { Database } from "../../../db/client.js";

// ─── TYPES ───────────────────────────────────────────────────────

export interface PaymentInput {
  totalWeightTons: number;
  totalMileage: number;
  ratePerTon?: number;
  ratePerMile?: number;
  rateType: "per_ton" | "per_mile";
  deductions: Array<{ type: string; amount: number; description: string }>;
}

export interface PaymentResult {
  grossPay: number;
  totalDeductions: number;
  netPay: number;
}

export interface Deduction {
  type: string;
  amount: number;
  description: string;
  reference?: string;
  date?: string;
}

export interface CreateBatchParams {
  driverId: string;
  driverName: string;
  carrierName?: string;
  weekStart: Date;
  weekEnd: Date;
  ratePerTon?: number;
  ratePerMile?: number;
  rateType?: "per_ton" | "per_mile";
  createdBy: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface PaymentBatch {
  id: number;
  batchNumber: string;
  driverId: string;
  driverName: string;
  carrierName: string | null;
  weekStart: Date;
  weekEnd: Date;
  loadCount: number;
  totalWeightTons: string | null;
  totalMileage: string | null;
  ratePerTon: string | null;
  ratePerMile: string | null;
  rateType: string | null;
  grossPay: string | null;
  totalDeductions: string | null;
  netPay: string | null;
  deductions: Deduction[];
  status: string | null;
  statusHistory: StatusHistoryEntry[];
  sheetsExportUrl: string | null;
  sheetsExportedAt: Date | null;
  createdBy: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface PaymentBatchDetail extends PaymentBatch {
  loadIds: number[];
}

export interface BatchCreationResult {
  created: Array<{
    driverId: string;
    driverName: string;
    batchNumber: string;
    loadCount: number;
  }>;
  skipped: Array<{
    driverId: string;
    driverName: string | null;
    reason: string;
  }>;
  errors: Array<{
    driverId: string;
    driverName: string | null;
    error: string;
  }>;
}

interface StatusHistoryEntry {
  status: string;
  changedBy: number;
  changedAt: string;
  notes?: string;
}

export interface FeatureDiagnostic {
  name: string;
  status: "healthy" | "degraded" | "error";
  stats: Record<string, unknown>;
  checks: Array<{ name: string; ok: boolean; detail?: string | number }>;
}

// ─── STATUS MACHINE ──────────────────────────────────────────────

export const PAYMENT_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_review", "cancelled"],
  pending_review: ["under_review", "draft", "cancelled"],
  under_review: ["approved", "rejected", "draft"],
  approved: ["paid", "cancelled"],
  rejected: ["draft"],
  // paid and cancelled are terminal
};

export const PAYMENT_STATUSES = [
  "draft",
  "pending_review",
  "under_review",
  "approved",
  "rejected",
  "paid",
  "cancelled",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export function isValidTransition(from: string, to: string): boolean {
  const allowed = PAYMENT_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

// ─── PURE FUNCTIONS ──────────────────────────────────────────────

export function calculatePayment(input: PaymentInput): PaymentResult {
  let grossPay: number;

  if (input.rateType === "per_ton") {
    grossPay = input.totalWeightTons * (input.ratePerTon ?? 0);
  } else {
    grossPay = input.totalMileage * (input.ratePerMile ?? 0);
  }

  const totalDeductions = input.deductions.reduce(
    (sum, d) => sum + d.amount,
    0,
  );
  const netPay = grossPay - totalDeductions;

  return {
    grossPay: roundCents(grossPay),
    totalDeductions: roundCents(totalDeductions),
    netPay: roundCents(netPay),
  };
}

export function generateBatchNumber(
  driverId: string,
  date: Date,
  seq = 1,
): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `PAY-${yyyy}${mm}${dd}-${driverId}-${seq}`;
}

/** Round to 2 decimal places (cents). */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function createStatusHistoryEntry(
  status: string,
  userId: number,
  notes?: string,
): StatusHistoryEntry {
  return {
    status,
    changedBy: userId,
    changedAt: new Date().toISOString(),
    ...(notes ? { notes } : {}),
  };
}

// ─── INTERNAL COUNTERS (for diagnostics) ─────────────────────────

let _totalBatchesCreated = 0;
let _totalTransitions = 0;
let _totalCalculations = 0;
let _lastOperationAt: Date | null = null;

// ─── DATABASE FUNCTIONS ──────────────────────────────────────────

/**
 * Create a single payment batch for a driver within a date range.
 * Aggregates delivered loads by driver_id, links them via the join table,
 * and computes initial totals. Skips if batch already exists for that driver+week.
 */
export async function createBatch(
  db: Database,
  params: CreateBatchParams,
): Promise<PaymentBatch> {
  // Check for existing batch for this driver+week
  const [existing] = await db
    .select({ id: paymentBatches.id, batchNumber: paymentBatches.batchNumber })
    .from(paymentBatches)
    .where(
      and(
        eq(paymentBatches.driverId, params.driverId),
        eq(paymentBatches.weekStart, params.weekStart),
        eq(paymentBatches.weekEnd, params.weekEnd),
      ),
    )
    .limit(1);

  if (existing) {
    throw new ConflictError(
      `Batch already exists for driver ${params.driverId} week ${params.weekStart.toISOString()} - ${params.weekEnd.toISOString()}: ${existing.batchNumber}`,
    );
  }

  // Find delivered loads for this driver in the date range
  const driverLoads = await db
    .select({
      id: loads.id,
      weightTons: loads.weightTons,
      mileage: loads.mileage,
    })
    .from(loads)
    .where(
      and(
        eq(loads.driverId, params.driverId),
        eq(loads.status, "active"),
        between(loads.deliveredOn, params.weekStart, params.weekEnd),
      ),
    );

  if (driverLoads.length === 0) {
    throw new ValidationError(
      `No delivered loads found for driver ${params.driverId} in date range`,
    );
  }

  // Aggregate totals
  let totalWeightTons = 0;
  let totalMileage = 0;
  for (const load of driverLoads) {
    totalWeightTons += parseFloat(load.weightTons ?? "0");
    totalMileage += parseFloat(load.mileage ?? "0");
  }

  const rateType = params.rateType ?? "per_ton";
  const ratePerTon = params.ratePerTon ?? null;
  const ratePerMile = params.ratePerMile ?? null;

  // Calculate initial gross pay
  let grossPay = 0;
  if (rateType === "per_ton" && ratePerTon != null) {
    grossPay = totalWeightTons * ratePerTon;
  } else if (rateType === "per_mile" && ratePerMile != null) {
    grossPay = totalMileage * ratePerMile;
  }

  // Generate batch number (check for sequence collisions)
  let seq = 1;
  let batchNumber = generateBatchNumber(params.driverId, params.weekStart, seq);
  const existingNumbers = await db
    .select({ batchNumber: paymentBatches.batchNumber })
    .from(paymentBatches)
    .where(
      sql`${paymentBatches.batchNumber} LIKE ${`PAY-%-${params.driverId}-%`}`,
    );

  const usedNumbers = new Set(existingNumbers.map((r) => r.batchNumber));
  while (usedNumbers.has(batchNumber)) {
    seq++;
    batchNumber = generateBatchNumber(params.driverId, params.weekStart, seq);
  }

  const initialHistory = createStatusHistoryEntry(
    "draft",
    params.createdBy,
    "Batch created",
  );

  const [batch] = await db
    .insert(paymentBatches)
    .values({
      batchNumber,
      driverId: params.driverId,
      driverName: params.driverName,
      carrierName: params.carrierName ?? null,
      weekStart: params.weekStart,
      weekEnd: params.weekEnd,
      loadCount: driverLoads.length,
      totalWeightTons: String(roundCents(totalWeightTons)),
      totalMileage: String(roundCents(totalMileage)),
      ratePerTon: ratePerTon != null ? String(ratePerTon) : null,
      ratePerMile: ratePerMile != null ? String(ratePerMile) : null,
      rateType,
      grossPay: String(roundCents(grossPay)),
      totalDeductions: "0",
      netPay: String(roundCents(grossPay)),
      deductions: [],
      status: "draft",
      statusHistory: [initialHistory],
      createdBy: params.createdBy,
    })
    .returning();

  // Link loads via join table
  if (driverLoads.length > 0) {
    await db.insert(paymentBatchLoads).values(
      driverLoads.map((l) => ({
        batchId: batch.id,
        loadId: l.id,
      })),
    );
  }

  _totalBatchesCreated++;
  _lastOperationAt = new Date();

  return batch as unknown as PaymentBatch;
}

/**
 * Create batches for ALL drivers that have delivered loads in the date range.
 * Groups loads by driver_id, creates one batch per driver, skips duplicates.
 */
export async function createBatchesForAllDrivers(
  db: Database,
  dateRange: DateRange,
  createdBy: number,
): Promise<BatchCreationResult> {
  // Find all distinct drivers with delivered loads in the range
  const driverGroups = await db
    .select({
      driverId: loads.driverId,
      driverName: loads.driverName,
      carrierName: loads.carrierName,
    })
    .from(loads)
    .where(
      and(
        eq(loads.status, "active"),
        between(loads.deliveredOn, dateRange.start, dateRange.end),
        sql`${loads.driverId} IS NOT NULL`,
      ),
    )
    .groupBy(loads.driverId, loads.driverName, loads.carrierName);

  const result: BatchCreationResult = {
    created: [],
    skipped: [],
    errors: [],
  };

  for (const group of driverGroups) {
    if (!group.driverId) {
      result.skipped.push({
        driverId: "unknown",
        driverName: group.driverName,
        reason: "No driver_id on loads",
      });
      continue;
    }

    try {
      const batch = await createBatch(db, {
        driverId: group.driverId,
        driverName: group.driverName ?? "Unknown",
        carrierName: group.carrierName ?? undefined,
        weekStart: dateRange.start,
        weekEnd: dateRange.end,
        createdBy,
      });

      result.created.push({
        driverId: group.driverId,
        driverName: group.driverName ?? "Unknown",
        batchNumber: batch.batchNumber,
        loadCount: batch.loadCount ?? 0,
      });
    } catch (err) {
      if (err instanceof ConflictError) {
        result.skipped.push({
          driverId: group.driverId,
          driverName: group.driverName,
          reason: err.message,
        });
      } else {
        result.errors.push({
          driverId: group.driverId,
          driverName: group.driverName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return result;
}

/**
 * Get a payment batch by ID, including linked load IDs.
 */
export async function getBatch(
  db: Database,
  batchId: number,
): Promise<PaymentBatchDetail> {
  const [batch] = await db
    .select()
    .from(paymentBatches)
    .where(eq(paymentBatches.id, batchId))
    .limit(1);

  if (!batch) throw new NotFoundError("PaymentBatch", batchId);

  const linkedLoads = await db
    .select({ loadId: paymentBatchLoads.loadId })
    .from(paymentBatchLoads)
    .where(eq(paymentBatchLoads.batchId, batchId));

  return {
    ...(batch as unknown as PaymentBatch),
    loadIds: linkedLoads.map((l) => l.loadId),
  };
}

/**
 * Update batch fields. Only allowed in draft/pending_review status for
 * financial fields. Status changes go through transitionStatus().
 */
export async function updateBatch(
  db: Database,
  batchId: number,
  updates: Partial<
    Pick<
      PaymentBatch,
      "ratePerTon" | "ratePerMile" | "rateType" | "carrierName"
    >
  >,
): Promise<void> {
  const [batch] = await db
    .select({ status: paymentBatches.status })
    .from(paymentBatches)
    .where(eq(paymentBatches.id, batchId))
    .limit(1);

  if (!batch) throw new NotFoundError("PaymentBatch", batchId);

  if (!["draft", "pending_review"].includes(batch.status ?? "")) {
    throw new ValidationError(
      `Cannot update batch in status "${batch.status}". Only draft or pending_review batches can be modified.`,
    );
  }

  const setValues: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (updates.ratePerTon !== undefined)
    setValues.ratePerTon = String(updates.ratePerTon);
  if (updates.ratePerMile !== undefined)
    setValues.ratePerMile = String(updates.ratePerMile);
  if (updates.rateType !== undefined) setValues.rateType = updates.rateType;
  if (updates.carrierName !== undefined)
    setValues.carrierName = updates.carrierName;

  await db
    .update(paymentBatches)
    .set(setValues)
    .where(eq(paymentBatches.id, batchId));

  _lastOperationAt = new Date();
}

/**
 * Transition batch status. Validates the transition is allowed,
 * appends to status history.
 */
export async function transitionStatus(
  db: Database,
  batchId: number,
  newStatus: string,
  userId: number,
  notes?: string,
): Promise<void> {
  const [batch] = await db
    .select({
      status: paymentBatches.status,
      statusHistory: paymentBatches.statusHistory,
      createdBy: paymentBatches.createdBy,
    })
    .from(paymentBatches)
    .where(eq(paymentBatches.id, batchId))
    .limit(1);

  if (!batch) throw new NotFoundError("PaymentBatch", batchId);

  if (newStatus === "approved" && batch.createdBy === userId) {
    throw new ForbiddenError("Cannot approve a batch you created");
  }

  const currentStatus = batch.status ?? "draft";
  if (!isValidTransition(currentStatus, newStatus)) {
    const allowed = PAYMENT_TRANSITIONS[currentStatus] ?? [];
    throw new ValidationError(
      `Invalid transition: ${currentStatus} -> ${newStatus}. Allowed: [${allowed.join(", ")}]`,
    );
  }

  const entry = createStatusHistoryEntry(newStatus, userId, notes);
  const history = [
    ...((batch.statusHistory as StatusHistoryEntry[]) ?? []),
    entry,
  ];

  await db
    .update(paymentBatches)
    .set({
      status: newStatus as typeof paymentBatches.status._.data,
      statusHistory: history,
      updatedAt: new Date(),
    })
    .where(eq(paymentBatches.id, batchId));

  _totalTransitions++;
  _lastOperationAt = new Date();
}

/**
 * Add a deduction to a batch. Recalculates totalDeductions and netPay.
 * Only allowed in draft or pending_review status.
 */
export async function addDeduction(
  db: Database,
  batchId: number,
  deduction: Deduction,
): Promise<void> {
  const [batch] = await db
    .select({
      status: paymentBatches.status,
      deductions: paymentBatches.deductions,
      grossPay: paymentBatches.grossPay,
    })
    .from(paymentBatches)
    .where(eq(paymentBatches.id, batchId))
    .limit(1);

  if (!batch) throw new NotFoundError("PaymentBatch", batchId);

  if (!["draft", "pending_review"].includes(batch.status ?? "")) {
    throw new ValidationError(
      `Cannot modify deductions for batch in status "${batch.status}"`,
    );
  }

  const currentDeductions = (batch.deductions as Deduction[]) ?? [];
  const updatedDeductions = [...currentDeductions, deduction];
  const totalDeductions = updatedDeductions.reduce(
    (sum, d) => sum + d.amount,
    0,
  );
  const grossPay = parseFloat(batch.grossPay ?? "0");
  const netPay = grossPay - totalDeductions;

  await db
    .update(paymentBatches)
    .set({
      deductions: updatedDeductions,
      totalDeductions: String(roundCents(totalDeductions)),
      netPay: String(roundCents(netPay)),
      updatedAt: new Date(),
    })
    .where(eq(paymentBatches.id, batchId));

  _lastOperationAt = new Date();
}

/**
 * Remove a deduction by index. Recalculates totalDeductions and netPay.
 * Only allowed in draft or pending_review status.
 */
export async function removeDeduction(
  db: Database,
  batchId: number,
  deductionIdx: number,
): Promise<void> {
  const [batch] = await db
    .select({
      status: paymentBatches.status,
      deductions: paymentBatches.deductions,
      grossPay: paymentBatches.grossPay,
    })
    .from(paymentBatches)
    .where(eq(paymentBatches.id, batchId))
    .limit(1);

  if (!batch) throw new NotFoundError("PaymentBatch", batchId);

  if (!["draft", "pending_review"].includes(batch.status ?? "")) {
    throw new ValidationError(
      `Cannot modify deductions for batch in status "${batch.status}"`,
    );
  }

  const currentDeductions = (batch.deductions as Deduction[]) ?? [];
  if (deductionIdx < 0 || deductionIdx >= currentDeductions.length) {
    throw new ValidationError(
      `Deduction index ${deductionIdx} out of range (0-${currentDeductions.length - 1})`,
    );
  }

  const updatedDeductions = [...currentDeductions];
  updatedDeductions.splice(deductionIdx, 1);
  const totalDeductions = updatedDeductions.reduce(
    (sum, d) => sum + d.amount,
    0,
  );
  const grossPay = parseFloat(batch.grossPay ?? "0");
  const netPay = grossPay - totalDeductions;

  await db
    .update(paymentBatches)
    .set({
      deductions: updatedDeductions,
      totalDeductions: String(roundCents(totalDeductions)),
      netPay: String(roundCents(netPay)),
      updatedAt: new Date(),
    })
    .where(eq(paymentBatches.id, batchId));

  _lastOperationAt = new Date();
}

// ─── DIAGNOSTICS ─────────────────────────────────────────────────

export function diagnostics(): FeatureDiagnostic {
  return {
    name: "payment",
    status: "healthy",
    stats: {
      totalBatchesCreated: _totalBatchesCreated,
      totalTransitions: _totalTransitions,
      totalCalculations: _totalCalculations,
      lastOperationAt: _lastOperationAt?.toISOString() ?? null,
      supportedStatuses: [...PAYMENT_STATUSES],
      rateTypes: ["per_ton", "per_mile"],
    },
    checks: [
      {
        name: "status-machine",
        ok: true,
        detail: `${Object.keys(PAYMENT_TRANSITIONS).length} states with transitions`,
      },
      {
        name: "payment-calculation",
        ok: true,
        detail: "2 rate types (per_ton, per_mile)",
      },
      {
        name: "batch-creation",
        ok: true,
        detail: `${_totalBatchesCreated} batches created`,
      },
    ],
  };
}
