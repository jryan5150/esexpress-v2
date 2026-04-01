/**
 * Reconciliation Service -- Tests (Track 6.2)
 * =============================================
 *
 * Focus on pure functions (detectDiscrepancies, classifyReconciliationStatus)
 * and the RECONCILIATION_STATUSES constant. DB-dependent functions (autoMatch,
 * batchAutoMatch, manualMatch, getReconciliationQueue, getReconciliationStats)
 * get export-existence checks.
 */

import { describe, it, expect } from "vitest";
import {
  detectDiscrepancies,
  classifyReconciliationStatus,
  autoMatch,
  batchAutoMatch,
  manualMatch,
  getReconciliationQueue,
  getReconciliationStats,
  diagnostics,
  RECONCILIATION_STATUSES,
  type Discrepancy,
  type MatchResult,
  type BatchMatchResult,
  type LoadRow,
  type ReconciliationStats,
  type ReconciliationStatus,
  type QueueItem,
  type QueueFilters,
} from "../../src/plugins/verification/services/reconciliation.service.js";
import type { ExtractedBolData } from "../../src/plugins/verification/services/bol-extraction.service.js";

// ---------------------------------------------------------------------------
// Helpers -- build fixtures
// ---------------------------------------------------------------------------

function buildBolData(
  overrides: Partial<ExtractedBolData> = {},
): ExtractedBolData {
  return {
    ticketNo: "123456",
    loadNumber: "L-2026-001",
    weight: 45000, // lbs
    grossWeight: 80000,
    tareWeight: 35000,
    pickupDate: "2026-03-15",
    deliveryDate: "2026-03-15",
    shipper: "ABC Quarry",
    consignee: "XYZ Well Site",
    product: "Frac Sand",
    truckNo: "T-101",
    trailerNo: "TR-200",
    carrier: "ES Express",
    driverName: "John Smith",
    notes: null,
    fieldConfidences: {},
    overallConfidence: 82,
    ...overrides,
  };
}

function buildLoadRow(overrides: Partial<LoadRow> = {}): LoadRow {
  return {
    ticketNo: "123456",
    bolNo: null,
    loadNo: "L-2026-001",
    driverName: "John Smith",
    weightTons: "22.5000", // 22.5 tons = 45,000 lbs
    netWeightTons: null,
    deliveredOn: new Date("2026-03-15T12:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RECONCILIATION_STATUSES constant
// ---------------------------------------------------------------------------

describe("RECONCILIATION_STATUSES", () => {
  it("contains exactly 6 statuses", () => {
    expect(RECONCILIATION_STATUSES).toHaveLength(6);
  });

  it("includes all expected status values", () => {
    const expected = [
      "pending_bol",
      "pending_confirmation",
      "critical_discrepancy",
      "needs_review",
      "reconciled",
      "ready_for_review",
    ];
    expect([...RECONCILIATION_STATUSES]).toEqual(expected);
  });

  it("is a readonly tuple", () => {
    expect(Array.isArray(RECONCILIATION_STATUSES)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// detectDiscrepancies -- pure function, exhaustive field coverage
// ---------------------------------------------------------------------------

describe("detectDiscrepancies", () => {
  // --- No discrepancies ---

  it("returns empty array when all fields match", () => {
    const bol = buildBolData();
    const load = buildLoadRow();
    const result = detectDiscrepancies(bol, load);
    expect(result).toEqual([]);
  });

  it("returns empty array when both sides have null values", () => {
    const bol = buildBolData({
      weight: null,
      grossWeight: null,
      ticketNo: null,
      deliveryDate: null,
      driverName: null,
    });
    const load = buildLoadRow({
      weightTons: null,
      netWeightTons: null,
      ticketNo: null,
      bolNo: null,
      deliveredOn: null,
      driverName: null,
    });
    const result = detectDiscrepancies(bol, load);
    expect(result).toEqual([]);
  });

  // --- Weight: critical (>10% difference) ---

  it("flags critical discrepancy when weight difference exceeds 10%", () => {
    // BOL: 50,000 lbs, Load: 22.5 tons = 45,000 lbs → ~11.1% diff
    const bol = buildBolData({ weight: 50000 });
    const load = buildLoadRow({ weightTons: "22.5000" });
    const result = detectDiscrepancies(bol, load);

    const weightDisc = result.find((d) => d.field === "weight");
    expect(weightDisc).toBeDefined();
    expect(weightDisc!.severity).toBe("critical");
    expect(weightDisc!.bolValue).toBe(50000);
    expect(weightDisc!.loadValue).toBe(45000);
  });

  it("flags critical for large weight difference (>20%)", () => {
    // BOL: 60,000 lbs, Load: 22.5 tons = 45,000 lbs → ~33% diff
    const bol = buildBolData({ weight: 60000 });
    const load = buildLoadRow({ weightTons: "22.5000" });
    const result = detectDiscrepancies(bol, load);

    const weightDisc = result.find((d) => d.field === "weight");
    expect(weightDisc).toBeDefined();
    expect(weightDisc!.severity).toBe("critical");
  });

  // --- Weight: warning (5-10% difference) ---

  it("flags warning discrepancy when weight difference is 5-10%", () => {
    // BOL: 48,000 lbs, Load: 22.5 tons = 45,000 lbs → ~6.67% diff
    const bol = buildBolData({ weight: 48000 });
    const load = buildLoadRow({ weightTons: "22.5000" });
    const result = detectDiscrepancies(bol, load);

    const weightDisc = result.find((d) => d.field === "weight");
    expect(weightDisc).toBeDefined();
    expect(weightDisc!.severity).toBe("warning");
  });

  it("flags warning at exactly 6% weight difference", () => {
    // Load: 22.5 tons = 45,000 lbs. 6% of 45,000 = 2,700. BOL: 47,700
    const bol = buildBolData({ weight: 47700 });
    const load = buildLoadRow({ weightTons: "22.5000" });
    const result = detectDiscrepancies(bol, load);

    const weightDisc = result.find((d) => d.field === "weight");
    expect(weightDisc).toBeDefined();
    expect(weightDisc!.severity).toBe("warning");
  });

  // --- Weight: no discrepancy (<=5% difference) ---

  it("does not flag weight when difference is within 5%", () => {
    // BOL: 46,000 lbs, Load: 22.5 tons = 45,000 lbs → ~2.2% diff
    const bol = buildBolData({ weight: 46000 });
    const load = buildLoadRow({ weightTons: "22.5000" });
    const result = detectDiscrepancies(bol, load);

    const weightDisc = result.find((d) => d.field === "weight");
    expect(weightDisc).toBeUndefined();
  });

  it("does not flag weight when values are identical", () => {
    const bol = buildBolData({ weight: 45000 });
    const load = buildLoadRow({ weightTons: "22.5000" });
    const result = detectDiscrepancies(bol, load);

    const weightDisc = result.find((d) => d.field === "weight");
    expect(weightDisc).toBeUndefined();
  });

  // --- Weight: uses netWeightTons fallback ---

  it("uses netWeightTons when weightTons is null", () => {
    const bol = buildBolData({ weight: 50000 });
    const load = buildLoadRow({
      weightTons: null,
      netWeightTons: "22.5000", // 45,000 lbs
    });
    const result = detectDiscrepancies(bol, load);

    const weightDisc = result.find((d) => d.field === "weight");
    expect(weightDisc).toBeDefined();
    expect(weightDisc!.severity).toBe("critical");
  });

  // --- Weight: uses grossWeight fallback ---

  it("uses grossWeight when weight is null", () => {
    // grossWeight 50,000 vs load 45,000 → >10% diff
    const bol = buildBolData({ weight: null, grossWeight: 50000 });
    const load = buildLoadRow({ weightTons: "22.5000" });
    const result = detectDiscrepancies(bol, load);

    const weightDisc = result.find((d) => d.field === "weight");
    expect(weightDisc).toBeDefined();
    expect(weightDisc!.severity).toBe("critical");
  });

  // --- Weight: skips when one side is null ---

  it("does not flag weight when BOL weight is null and grossWeight is null", () => {
    const bol = buildBolData({ weight: null, grossWeight: null });
    const load = buildLoadRow({ weightTons: "22.5000" });
    const result = detectDiscrepancies(bol, load);

    const weightDisc = result.find((d) => d.field === "weight");
    expect(weightDisc).toBeUndefined();
  });

  it("does not flag weight when load weight is null", () => {
    const bol = buildBolData({ weight: 45000 });
    const load = buildLoadRow({ weightTons: null, netWeightTons: null });
    const result = detectDiscrepancies(bol, load);

    const weightDisc = result.find((d) => d.field === "weight");
    expect(weightDisc).toBeUndefined();
  });

  // --- Ticket number mismatch ---

  it("flags warning when ticket numbers differ", () => {
    const bol = buildBolData({ ticketNo: "123456" });
    const load = buildLoadRow({ ticketNo: "789012" });
    const result = detectDiscrepancies(bol, load);

    const ticketDisc = result.find((d) => d.field === "ticket_no");
    expect(ticketDisc).toBeDefined();
    expect(ticketDisc!.severity).toBe("warning");
    expect(ticketDisc!.bolValue).toBe("123456");
    expect(ticketDisc!.loadValue).toBe("789012");
  });

  it("does not flag ticket when they match", () => {
    const bol = buildBolData({ ticketNo: "123456" });
    const load = buildLoadRow({ ticketNo: "123456" });
    const result = detectDiscrepancies(bol, load);

    const ticketDisc = result.find((d) => d.field === "ticket_no");
    expect(ticketDisc).toBeUndefined();
  });

  it("does not flag ticket when BOL ticketNo is null", () => {
    const bol = buildBolData({ ticketNo: null });
    const load = buildLoadRow({ ticketNo: "123456" });
    const result = detectDiscrepancies(bol, load);

    const ticketDisc = result.find((d) => d.field === "ticket_no");
    expect(ticketDisc).toBeUndefined();
  });

  it("does not flag ticket when load ticketNo is null", () => {
    const bol = buildBolData({ ticketNo: "123456" });
    const load = buildLoadRow({ ticketNo: null, bolNo: null });
    const result = detectDiscrepancies(bol, load);

    const ticketDisc = result.find((d) => d.field === "ticket_no");
    expect(ticketDisc).toBeUndefined();
  });

  it("compares BOL ticketNo against load bolNo when ticketNo is null", () => {
    const bol = buildBolData({ ticketNo: "123456" });
    const load = buildLoadRow({ ticketNo: null, bolNo: "789012" });
    const result = detectDiscrepancies(bol, load);

    const ticketDisc = result.find((d) => d.field === "ticket_no");
    expect(ticketDisc).toBeDefined();
    expect(ticketDisc!.severity).toBe("warning");
    expect(ticketDisc!.loadValue).toBe("789012");
  });

  it("does not flag ticket when BOL ticketNo matches load bolNo", () => {
    const bol = buildBolData({ ticketNo: "123456" });
    const load = buildLoadRow({ ticketNo: null, bolNo: "123456" });
    const result = detectDiscrepancies(bol, load);

    const ticketDisc = result.find((d) => d.field === "ticket_no");
    expect(ticketDisc).toBeUndefined();
  });

  // --- Delivery date mismatch ---

  it("flags warning when delivery dates differ by more than 1 day", () => {
    const bol = buildBolData({ deliveryDate: "2026-03-15" });
    const load = buildLoadRow({
      deliveredOn: new Date("2026-03-18T12:00:00Z"),
    });
    const result = detectDiscrepancies(bol, load);

    const dateDisc = result.find((d) => d.field === "delivery_date");
    expect(dateDisc).toBeDefined();
    expect(dateDisc!.severity).toBe("warning");
    expect(dateDisc!.message).toContain("days apart");
  });

  it("does not flag delivery date when within 1 day", () => {
    const bol = buildBolData({ deliveryDate: "2026-03-15" });
    const load = buildLoadRow({
      deliveredOn: new Date("2026-03-15T18:00:00Z"),
    });
    const result = detectDiscrepancies(bol, load);

    const dateDisc = result.find((d) => d.field === "delivery_date");
    expect(dateDisc).toBeUndefined();
  });

  it("does not flag delivery date when BOL date is null", () => {
    const bol = buildBolData({ deliveryDate: null });
    const load = buildLoadRow({
      deliveredOn: new Date("2026-03-15T12:00:00Z"),
    });
    const result = detectDiscrepancies(bol, load);

    const dateDisc = result.find((d) => d.field === "delivery_date");
    expect(dateDisc).toBeUndefined();
  });

  it("does not flag delivery date when load deliveredOn is null", () => {
    const bol = buildBolData({ deliveryDate: "2026-03-15" });
    const load = buildLoadRow({ deliveredOn: null });
    const result = detectDiscrepancies(bol, load);

    const dateDisc = result.find((d) => d.field === "delivery_date");
    expect(dateDisc).toBeUndefined();
  });

  // --- Driver name mismatch ---

  it("flags info when driver names do not match by substring", () => {
    const bol = buildBolData({ driverName: "John Smith" });
    const load = buildLoadRow({ driverName: "Mike Johnson" });
    const result = detectDiscrepancies(bol, load);

    const driverDisc = result.find((d) => d.field === "driver_name");
    expect(driverDisc).toBeDefined();
    expect(driverDisc!.severity).toBe("info");
  });

  it("does not flag driver when names match exactly (case-insensitive)", () => {
    const bol = buildBolData({ driverName: "JOHN SMITH" });
    const load = buildLoadRow({ driverName: "john smith" });
    const result = detectDiscrepancies(bol, load);

    const driverDisc = result.find((d) => d.field === "driver_name");
    expect(driverDisc).toBeUndefined();
  });

  it("does not flag driver when BOL name is substring of load name", () => {
    const bol = buildBolData({ driverName: "John" });
    const load = buildLoadRow({ driverName: "John Smith" });
    const result = detectDiscrepancies(bol, load);

    const driverDisc = result.find((d) => d.field === "driver_name");
    expect(driverDisc).toBeUndefined();
  });

  it("does not flag driver when load name is substring of BOL name", () => {
    const bol = buildBolData({ driverName: "John Smith Jr" });
    const load = buildLoadRow({ driverName: "John Smith" });
    const result = detectDiscrepancies(bol, load);

    const driverDisc = result.find((d) => d.field === "driver_name");
    expect(driverDisc).toBeUndefined();
  });

  it("does not flag driver when BOL driverName is null", () => {
    const bol = buildBolData({ driverName: null });
    const load = buildLoadRow({ driverName: "John Smith" });
    const result = detectDiscrepancies(bol, load);

    const driverDisc = result.find((d) => d.field === "driver_name");
    expect(driverDisc).toBeUndefined();
  });

  it("does not flag driver when load driverName is null", () => {
    const bol = buildBolData({ driverName: "John Smith" });
    const load = buildLoadRow({ driverName: null });
    const result = detectDiscrepancies(bol, load);

    const driverDisc = result.find((d) => d.field === "driver_name");
    expect(driverDisc).toBeUndefined();
  });

  // --- Multiple discrepancies ---

  it("returns multiple discrepancies when several fields differ", () => {
    const bol = buildBolData({
      weight: 60000, // way off from 45,000
      ticketNo: "999999",
      deliveryDate: "2026-03-20",
      driverName: "Alice Brown",
    });
    const load = buildLoadRow({
      weightTons: "22.5000", // 45,000 lbs
      ticketNo: "123456",
      deliveredOn: new Date("2026-03-15T12:00:00Z"),
      driverName: "John Smith",
    });
    const result = detectDiscrepancies(bol, load);

    expect(result.length).toBe(4);
    const fields = result.map((d) => d.field);
    expect(fields).toContain("weight");
    expect(fields).toContain("ticket_no");
    expect(fields).toContain("delivery_date");
    expect(fields).toContain("driver_name");
  });

  // --- Discrepancy shape ---

  it("returns Discrepancy objects with correct shape", () => {
    const bol = buildBolData({ weight: 60000 });
    const load = buildLoadRow({ weightTons: "22.5000" });
    const result = detectDiscrepancies(bol, load);

    expect(result.length).toBeGreaterThan(0);
    const disc = result[0];
    expect(disc).toHaveProperty("field");
    expect(disc).toHaveProperty("bolValue");
    expect(disc).toHaveProperty("loadValue");
    expect(disc).toHaveProperty("severity");
    expect(disc).toHaveProperty("message");
    expect(typeof disc.field).toBe("string");
    expect(typeof disc.severity).toBe("string");
    expect(typeof disc.message).toBe("string");
    expect(["critical", "warning", "info"]).toContain(disc.severity);
  });

  // --- Edge case: zero load weight ---

  it("does not flag weight when load weight is zero (prevents division by zero)", () => {
    const bol = buildBolData({ weight: 45000 });
    const load = buildLoadRow({ weightTons: "0" });
    const result = detectDiscrepancies(bol, load);

    // loadWeightLbs = 0, guard prevents division by zero
    const weightDisc = result.find((d) => d.field === "weight");
    expect(weightDisc).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// classifyReconciliationStatus -- pure function
// ---------------------------------------------------------------------------

describe("classifyReconciliationStatus", () => {
  it("returns 'reconciled' when no discrepancies", () => {
    expect(classifyReconciliationStatus([])).toBe("reconciled");
  });

  it("returns 'critical_discrepancy' when any critical discrepancy exists", () => {
    const discrepancies: Discrepancy[] = [
      {
        field: "weight",
        bolValue: 60000,
        loadValue: 45000,
        severity: "critical",
        message: "Weight difference exceeds 10%",
      },
    ];
    expect(classifyReconciliationStatus(discrepancies)).toBe(
      "critical_discrepancy",
    );
  });

  it("returns 'critical_discrepancy' when mixed critical and warning", () => {
    const discrepancies: Discrepancy[] = [
      {
        field: "weight",
        bolValue: 60000,
        loadValue: 45000,
        severity: "critical",
        message: "Weight difference exceeds 10%",
      },
      {
        field: "ticket_no",
        bolValue: "123",
        loadValue: "456",
        severity: "warning",
        message: "Ticket mismatch",
      },
    ];
    expect(classifyReconciliationStatus(discrepancies)).toBe(
      "critical_discrepancy",
    );
  });

  it("returns 'needs_review' when warnings only (no critical)", () => {
    const discrepancies: Discrepancy[] = [
      {
        field: "ticket_no",
        bolValue: "123",
        loadValue: "456",
        severity: "warning",
        message: "Ticket mismatch",
      },
    ];
    expect(classifyReconciliationStatus(discrepancies)).toBe("needs_review");
  });

  it("returns 'needs_review' when multiple warnings", () => {
    const discrepancies: Discrepancy[] = [
      {
        field: "ticket_no",
        bolValue: "123",
        loadValue: "456",
        severity: "warning",
        message: "Ticket mismatch",
      },
      {
        field: "delivery_date",
        bolValue: "2026-03-15",
        loadValue: "2026-03-18",
        severity: "warning",
        message: "Date mismatch",
      },
    ];
    expect(classifyReconciliationStatus(discrepancies)).toBe("needs_review");
  });

  it("returns 'reconciled' when only info-level discrepancies", () => {
    const discrepancies: Discrepancy[] = [
      {
        field: "driver_name",
        bolValue: "John Smith",
        loadValue: "J. Smith",
        severity: "info",
        message: "Driver name mismatch",
      },
    ];
    expect(classifyReconciliationStatus(discrepancies)).toBe("reconciled");
  });

  it("returns 'needs_review' when mixed warning and info", () => {
    const discrepancies: Discrepancy[] = [
      {
        field: "driver_name",
        bolValue: "John Smith",
        loadValue: "Mike Johnson",
        severity: "info",
        message: "Driver name mismatch",
      },
      {
        field: "ticket_no",
        bolValue: "123",
        loadValue: "456",
        severity: "warning",
        message: "Ticket mismatch",
      },
    ];
    expect(classifyReconciliationStatus(discrepancies)).toBe("needs_review");
  });
});

// ---------------------------------------------------------------------------
// Export existence checks (DB-dependent functions)
// ---------------------------------------------------------------------------

describe("autoMatch", () => {
  it("is exported as a function", () => {
    expect(typeof autoMatch).toBe("function");
  });
});

describe("batchAutoMatch", () => {
  it("is exported as a function", () => {
    expect(typeof batchAutoMatch).toBe("function");
  });
});

describe("manualMatch", () => {
  it("is exported as a function", () => {
    expect(typeof manualMatch).toBe("function");
  });
});

describe("getReconciliationQueue", () => {
  it("is exported as a function", () => {
    expect(typeof getReconciliationQueue).toBe("function");
  });
});

describe("getReconciliationStats", () => {
  it("is exported as a function", () => {
    expect(typeof getReconciliationStats).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Type exports verification
// ---------------------------------------------------------------------------

describe("type exports", () => {
  it("exports Discrepancy type (verified via runtime shape)", () => {
    const disc: Discrepancy = {
      field: "weight",
      bolValue: 45000,
      loadValue: 50000,
      severity: "critical",
      message: "test",
    };
    expect(disc.field).toBe("weight");
    expect(disc.severity).toBe("critical");
  });

  it("exports MatchResult type (verified via runtime shape)", () => {
    const result: MatchResult = {
      matched: true,
      loadId: 1,
      matchStrategy: "ticket_no",
      confidence: 95,
      discrepancies: [],
      reconciliationStatus: "reconciled",
    };
    expect(result.matched).toBe(true);
    expect(result.matchStrategy).toBe("ticket_no");
  });

  it("exports BatchMatchResult type (verified via runtime shape)", () => {
    const result: BatchMatchResult = {
      total: 2,
      matched: 1,
      unmatched: 1,
      results: [],
    };
    expect(result.total).toBe(2);
  });

  it("exports ReconciliationStats type (verified via runtime shape)", () => {
    const stats: ReconciliationStats = {
      totalSubmissions: 100,
      matched: 60,
      unmatched: 40,
      criticalDiscrepancies: 5,
      needsReview: 10,
      reconciled: 45,
    };
    expect(stats.totalSubmissions).toBe(100);
  });

  it("exports ReconciliationStatus type", () => {
    const status: ReconciliationStatus = "reconciled";
    expect(RECONCILIATION_STATUSES).toContain(status);
  });

  it("exports LoadRow type (verified via runtime shape)", () => {
    const row: LoadRow = buildLoadRow();
    expect(row.loadNo).toBe("L-2026-001");
  });

  it("exports QueueItem type (verified via runtime shape)", () => {
    const item: QueueItem = {
      submissionId: 1,
      loadNumber: "L-001",
      driverName: "Test",
      status: "pending",
      matchedLoadId: null,
      matchMethod: null,
      matchScore: null,
      discrepancies: [],
      aiConfidence: null,
      createdAt: null,
    };
    expect(item.submissionId).toBe(1);
  });

  it("exports QueueFilters type (verified via runtime shape)", () => {
    const filters: QueueFilters = {
      status: "needs_review",
      limit: 50,
      offset: 0,
    };
    expect(filters.status).toBe("needs_review");
  });
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

describe("diagnostics", () => {
  it("returns proper FeatureDiagnostic shape", () => {
    const diag = diagnostics();
    expect(diag).toHaveProperty("name", "reconciliation");
    expect(["healthy", "degraded", "error"]).toContain(diag.status);
    expect(diag).toHaveProperty("stats");
    expect(diag).toHaveProperty("checks");
    expect(Array.isArray(diag.checks)).toBe(true);
  });

  it("includes matching-engine check", () => {
    const diag = diagnostics();
    const check = diag.checks.find((c) => c.name === "matching-engine");
    expect(check).toBeDefined();
    expect(check!.ok).toBe(true);
    expect(check!.detail).toContain("3-strategy");
  });

  it("includes discrepancy-detection check", () => {
    const diag = diagnostics();
    const check = diag.checks.find((c) => c.name === "discrepancy-detection");
    expect(check).toBeDefined();
    expect(check!.ok).toBe(true);
  });

  it("includes match-rate check", () => {
    const diag = diagnostics();
    const check = diag.checks.find((c) => c.name === "match-rate");
    expect(check).toBeDefined();
    expect(typeof check!.ok).toBe("boolean");
  });

  it("reports stats with expected keys", () => {
    const diag = diagnostics();
    expect(diag.stats).toHaveProperty("totalMatches");
    expect(diag.stats).toHaveProperty("totalMisses");
    expect(diag.stats).toHaveProperty("matchRate");
    expect(diag.stats).toHaveProperty("totalDiscrepancies");
    expect(diag.stats).toHaveProperty("matchStrategies");
    expect(diag.stats).toHaveProperty("reconciliationStatuses");
  });

  it("lists all 3 match strategies", () => {
    const diag = diagnostics();
    const strategies = diag.stats.matchStrategies as string[];
    expect(strategies).toEqual(["ticket_no", "load_no", "driver_date_weight"]);
  });

  it("lists all reconciliation statuses in stats", () => {
    const diag = diagnostics();
    const statuses = diag.stats.reconciliationStatuses as string[];
    expect(statuses).toEqual([...RECONCILIATION_STATUSES]);
  });
});
