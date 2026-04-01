/**
 * Payment Service -- Tests (Track 7.1)
 * ======================================
 *
 * Focus on pure functions (calculatePayment, isValidTransition, generateBatchNumber)
 * and the PAYMENT_TRANSITIONS / PAYMENT_STATUSES constants. DB-dependent functions
 * get export-existence checks.
 */

import { describe, it, expect } from "vitest";
import {
  calculatePayment,
  isValidTransition,
  generateBatchNumber,
  createBatch,
  createBatchesForAllDrivers,
  getBatch,
  updateBatch,
  transitionStatus,
  addDeduction,
  removeDeduction,
  diagnostics,
  PAYMENT_TRANSITIONS,
  PAYMENT_STATUSES,
  type PaymentInput,
  type PaymentResult,
  type PaymentBatch,
  type PaymentBatchDetail,
  type BatchCreationResult,
  type CreateBatchParams,
  type DateRange,
  type Deduction,
  type FeatureDiagnostic,
  type PaymentStatus,
} from "../../src/plugins/finance/services/payment.service.js";

// ---------------------------------------------------------------------------
// PAYMENT_TRANSITIONS constant
// ---------------------------------------------------------------------------

describe("PAYMENT_TRANSITIONS", () => {
  it("defines transitions for 5 non-terminal states", () => {
    expect(Object.keys(PAYMENT_TRANSITIONS)).toHaveLength(5);
  });

  it("draft can transition to pending_review or cancelled", () => {
    expect(PAYMENT_TRANSITIONS.draft).toEqual(["pending_review", "cancelled"]);
  });

  it("pending_review can transition to under_review, draft, or cancelled", () => {
    expect(PAYMENT_TRANSITIONS.pending_review).toEqual([
      "under_review",
      "draft",
      "cancelled",
    ]);
  });

  it("under_review can transition to approved, rejected, or draft", () => {
    expect(PAYMENT_TRANSITIONS.under_review).toEqual([
      "approved",
      "rejected",
      "draft",
    ]);
  });

  it("approved can transition to paid or cancelled", () => {
    expect(PAYMENT_TRANSITIONS.approved).toEqual(["paid", "cancelled"]);
  });

  it("rejected can transition to draft", () => {
    expect(PAYMENT_TRANSITIONS.rejected).toEqual(["draft"]);
  });

  it("paid is not a key (terminal state)", () => {
    expect(PAYMENT_TRANSITIONS.paid).toBeUndefined();
  });

  it("cancelled is not a key (terminal state)", () => {
    expect(PAYMENT_TRANSITIONS.cancelled).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PAYMENT_STATUSES constant
// ---------------------------------------------------------------------------

describe("PAYMENT_STATUSES", () => {
  it("contains exactly 7 statuses", () => {
    expect(PAYMENT_STATUSES).toHaveLength(7);
  });

  it("includes all expected status values in order", () => {
    expect([...PAYMENT_STATUSES]).toEqual([
      "draft",
      "pending_review",
      "under_review",
      "approved",
      "rejected",
      "paid",
      "cancelled",
    ]);
  });

  it("is a readonly tuple", () => {
    expect(Array.isArray(PAYMENT_STATUSES)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isValidTransition -- pure function
// ---------------------------------------------------------------------------

describe("isValidTransition", () => {
  // --- Valid forward transitions ---

  it("draft -> pending_review is valid", () => {
    expect(isValidTransition("draft", "pending_review")).toBe(true);
  });

  it("draft -> cancelled is valid", () => {
    expect(isValidTransition("draft", "cancelled")).toBe(true);
  });

  it("pending_review -> under_review is valid", () => {
    expect(isValidTransition("pending_review", "under_review")).toBe(true);
  });

  it("pending_review -> draft is valid (return to draft)", () => {
    expect(isValidTransition("pending_review", "draft")).toBe(true);
  });

  it("pending_review -> cancelled is valid", () => {
    expect(isValidTransition("pending_review", "cancelled")).toBe(true);
  });

  it("under_review -> approved is valid", () => {
    expect(isValidTransition("under_review", "approved")).toBe(true);
  });

  it("under_review -> rejected is valid", () => {
    expect(isValidTransition("under_review", "rejected")).toBe(true);
  });

  it("under_review -> draft is valid (send back)", () => {
    expect(isValidTransition("under_review", "draft")).toBe(true);
  });

  it("approved -> paid is valid", () => {
    expect(isValidTransition("approved", "paid")).toBe(true);
  });

  it("approved -> cancelled is valid", () => {
    expect(isValidTransition("approved", "cancelled")).toBe(true);
  });

  it("rejected -> draft is valid (rework)", () => {
    expect(isValidTransition("rejected", "draft")).toBe(true);
  });

  // --- Terminal states (no transitions out) ---

  it("paid is terminal (no transitions)", () => {
    expect(isValidTransition("paid", "draft")).toBe(false);
    expect(isValidTransition("paid", "cancelled")).toBe(false);
    expect(isValidTransition("paid", "approved")).toBe(false);
  });

  it("cancelled is terminal (no transitions)", () => {
    expect(isValidTransition("cancelled", "draft")).toBe(false);
    expect(isValidTransition("cancelled", "pending_review")).toBe(false);
  });

  // --- Invalid transitions ---

  it("draft -> approved is invalid (skip steps)", () => {
    expect(isValidTransition("draft", "approved")).toBe(false);
  });

  it("draft -> paid is invalid (skip steps)", () => {
    expect(isValidTransition("draft", "paid")).toBe(false);
  });

  it("pending_review -> approved is invalid (must go through under_review)", () => {
    expect(isValidTransition("pending_review", "approved")).toBe(false);
  });

  it("approved -> draft is invalid (must go to paid or cancelled)", () => {
    expect(isValidTransition("approved", "draft")).toBe(false);
  });

  it("rejected -> paid is invalid (must go through draft first)", () => {
    expect(isValidTransition("rejected", "paid")).toBe(false);
  });

  it("unknown status returns false", () => {
    expect(isValidTransition("nonexistent", "draft")).toBe(false);
  });

  it("same state to same state is invalid", () => {
    expect(isValidTransition("draft", "draft")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// calculatePayment -- pure function
// ---------------------------------------------------------------------------

describe("calculatePayment", () => {
  it("calculates per-ton payment correctly", () => {
    const input: PaymentInput = {
      totalWeightTons: 150,
      totalMileage: 0,
      ratePerTon: 12.5,
      rateType: "per_ton",
      deductions: [],
    };
    const result = calculatePayment(input);
    expect(result.grossPay).toBe(1875);
    expect(result.totalDeductions).toBe(0);
    expect(result.netPay).toBe(1875);
  });

  it("calculates per-mile payment correctly", () => {
    const input: PaymentInput = {
      totalWeightTons: 0,
      totalMileage: 500,
      ratePerMile: 2.75,
      rateType: "per_mile",
      deductions: [],
    };
    const result = calculatePayment(input);
    expect(result.grossPay).toBe(1375);
    expect(result.totalDeductions).toBe(0);
    expect(result.netPay).toBe(1375);
  });

  it("handles zero deductions", () => {
    const input: PaymentInput = {
      totalWeightTons: 100,
      totalMileage: 0,
      ratePerTon: 10,
      rateType: "per_ton",
      deductions: [],
    };
    const result = calculatePayment(input);
    expect(result.grossPay).toBe(1000);
    expect(result.totalDeductions).toBe(0);
    expect(result.netPay).toBe(1000);
  });

  it("handles multiple deductions", () => {
    const input: PaymentInput = {
      totalWeightTons: 100,
      totalMileage: 0,
      ratePerTon: 10,
      rateType: "per_ton",
      deductions: [
        { type: "fuel", amount: 150, description: "Fuel advance" },
        { type: "insurance", amount: 75, description: "Weekly insurance" },
        { type: "tire", amount: 200, description: "Tire repair" },
      ],
    };
    const result = calculatePayment(input);
    expect(result.grossPay).toBe(1000);
    expect(result.totalDeductions).toBe(425);
    expect(result.netPay).toBe(575);
  });

  it("handles zero weight (per_ton)", () => {
    const input: PaymentInput = {
      totalWeightTons: 0,
      totalMileage: 0,
      ratePerTon: 10,
      rateType: "per_ton",
      deductions: [],
    };
    const result = calculatePayment(input);
    expect(result.grossPay).toBe(0);
    expect(result.netPay).toBe(0);
  });

  it("handles zero mileage (per_mile)", () => {
    const input: PaymentInput = {
      totalWeightTons: 0,
      totalMileage: 0,
      ratePerMile: 2.5,
      rateType: "per_mile",
      deductions: [],
    };
    const result = calculatePayment(input);
    expect(result.grossPay).toBe(0);
    expect(result.netPay).toBe(0);
  });

  it("uses ratePerTon=0 when not provided for per_ton", () => {
    const input: PaymentInput = {
      totalWeightTons: 100,
      totalMileage: 0,
      rateType: "per_ton",
      deductions: [],
    };
    const result = calculatePayment(input);
    expect(result.grossPay).toBe(0);
  });

  it("uses ratePerMile=0 when not provided for per_mile", () => {
    const input: PaymentInput = {
      totalWeightTons: 0,
      totalMileage: 500,
      rateType: "per_mile",
      deductions: [],
    };
    const result = calculatePayment(input);
    expect(result.grossPay).toBe(0);
  });

  it("netPay can be negative when deductions exceed gross", () => {
    const input: PaymentInput = {
      totalWeightTons: 10,
      totalMileage: 0,
      ratePerTon: 5,
      rateType: "per_ton",
      deductions: [
        { type: "advance", amount: 100, description: "Cash advance" },
      ],
    };
    const result = calculatePayment(input);
    expect(result.grossPay).toBe(50);
    expect(result.totalDeductions).toBe(100);
    expect(result.netPay).toBe(-50);
  });

  it("rounds to 2 decimal places (cents)", () => {
    const input: PaymentInput = {
      totalWeightTons: 33.333,
      totalMileage: 0,
      ratePerTon: 11.111,
      rateType: "per_ton",
      deductions: [],
    };
    const result = calculatePayment(input);
    // 33.333 * 11.111 = 370.362963 → rounded to 370.36
    expect(result.grossPay).toBe(370.36);
    expect(result.netPay).toBe(370.36);
  });

  it("per_ton ignores totalMileage", () => {
    const input: PaymentInput = {
      totalWeightTons: 50,
      totalMileage: 9999,
      ratePerTon: 10,
      ratePerMile: 100,
      rateType: "per_ton",
      deductions: [],
    };
    const result = calculatePayment(input);
    expect(result.grossPay).toBe(500); // 50 * 10, not 9999 * 100
  });

  it("per_mile ignores totalWeightTons", () => {
    const input: PaymentInput = {
      totalWeightTons: 9999,
      totalMileage: 100,
      ratePerTon: 100,
      ratePerMile: 3,
      rateType: "per_mile",
      deductions: [],
    };
    const result = calculatePayment(input);
    expect(result.grossPay).toBe(300); // 100 * 3, not 9999 * 100
  });

  it("returns PaymentResult shape", () => {
    const input: PaymentInput = {
      totalWeightTons: 10,
      totalMileage: 0,
      ratePerTon: 5,
      rateType: "per_ton",
      deductions: [],
    };
    const result = calculatePayment(input);
    expect(result).toHaveProperty("grossPay");
    expect(result).toHaveProperty("totalDeductions");
    expect(result).toHaveProperty("netPay");
    expect(typeof result.grossPay).toBe("number");
    expect(typeof result.totalDeductions).toBe("number");
    expect(typeof result.netPay).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// generateBatchNumber -- pure function
// ---------------------------------------------------------------------------

describe("generateBatchNumber", () => {
  it("formats correctly with default sequence", () => {
    const date = new Date("2026-03-15T00:00:00Z");
    const result = generateBatchNumber("DRV-123", date);
    expect(result).toBe("PAY-20260315-DRV-123-1");
  });

  it("includes driver ID in the number", () => {
    const date = new Date("2026-04-01T00:00:00Z");
    const result = generateBatchNumber("ABC-456", date);
    expect(result).toContain("ABC-456");
  });

  it("pads month and day with leading zeros", () => {
    const date = new Date("2026-01-05T00:00:00Z");
    const result = generateBatchNumber("DRV-1", date);
    expect(result).toBe("PAY-20260105-DRV-1-1");
  });

  it("includes sequence number", () => {
    const date = new Date("2026-03-15T00:00:00Z");
    const result = generateBatchNumber("DRV-1", date, 3);
    expect(result).toBe("PAY-20260315-DRV-1-3");
  });

  it("defaults sequence to 1", () => {
    const date = new Date("2026-06-20T00:00:00Z");
    const result = generateBatchNumber("DRV-1", date);
    expect(result).toMatch(/-1$/);
  });

  it("starts with PAY- prefix", () => {
    const date = new Date("2026-12-31T00:00:00Z");
    const result = generateBatchNumber("X", date);
    expect(result).toMatch(/^PAY-/);
  });

  it("handles double-digit month and day", () => {
    const date = new Date("2026-12-25T00:00:00Z");
    const result = generateBatchNumber("DRV-1", date);
    expect(result).toBe("PAY-20261225-DRV-1-1");
  });

  it("handles large sequence numbers", () => {
    const date = new Date("2026-01-01T00:00:00Z");
    const result = generateBatchNumber("DRV-1", date, 999);
    expect(result).toBe("PAY-20260101-DRV-1-999");
  });
});

// ---------------------------------------------------------------------------
// Export existence checks (DB-dependent functions)
// ---------------------------------------------------------------------------

describe("createBatch", () => {
  it("is exported as a function", () => {
    expect(typeof createBatch).toBe("function");
  });
});

describe("createBatchesForAllDrivers", () => {
  it("is exported as a function", () => {
    expect(typeof createBatchesForAllDrivers).toBe("function");
  });
});

describe("getBatch", () => {
  it("is exported as a function", () => {
    expect(typeof getBatch).toBe("function");
  });
});

describe("updateBatch", () => {
  it("is exported as a function", () => {
    expect(typeof updateBatch).toBe("function");
  });
});

describe("transitionStatus", () => {
  it("is exported as a function", () => {
    expect(typeof transitionStatus).toBe("function");
  });
});

describe("addDeduction", () => {
  it("is exported as a function", () => {
    expect(typeof addDeduction).toBe("function");
  });
});

describe("removeDeduction", () => {
  it("is exported as a function", () => {
    expect(typeof removeDeduction).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Type exports verification
// ---------------------------------------------------------------------------

describe("type exports", () => {
  it("exports PaymentInput type (verified via runtime shape)", () => {
    const input: PaymentInput = {
      totalWeightTons: 100,
      totalMileage: 50,
      ratePerTon: 10,
      rateType: "per_ton",
      deductions: [],
    };
    expect(input.rateType).toBe("per_ton");
  });

  it("exports PaymentResult type (verified via runtime shape)", () => {
    const result: PaymentResult = {
      grossPay: 1000,
      totalDeductions: 100,
      netPay: 900,
    };
    expect(result.netPay).toBe(900);
  });

  it("exports CreateBatchParams type (verified via runtime shape)", () => {
    const params: CreateBatchParams = {
      driverId: "DRV-1",
      driverName: "John Doe",
      weekStart: new Date(),
      weekEnd: new Date(),
      createdBy: 1,
    };
    expect(params.driverId).toBe("DRV-1");
  });

  it("exports DateRange type (verified via runtime shape)", () => {
    const range: DateRange = {
      start: new Date("2026-03-01"),
      end: new Date("2026-03-07"),
    };
    expect(range.start).toBeInstanceOf(Date);
  });

  it("exports Deduction type (verified via runtime shape)", () => {
    const d: Deduction = {
      type: "fuel",
      amount: 150,
      description: "Fuel advance",
      reference: "REF-001",
      date: "2026-03-15",
    };
    expect(d.type).toBe("fuel");
    expect(d.reference).toBe("REF-001");
  });

  it("exports BatchCreationResult type (verified via runtime shape)", () => {
    const result: BatchCreationResult = {
      created: [],
      skipped: [],
      errors: [],
    };
    expect(result.created).toEqual([]);
  });

  it("exports PaymentStatus type (verified via runtime)", () => {
    const status: PaymentStatus = "draft";
    expect(PAYMENT_STATUSES).toContain(status);
  });

  it("exports FeatureDiagnostic type (verified via runtime shape)", () => {
    const diag: FeatureDiagnostic = {
      name: "test",
      status: "healthy",
      stats: {},
      checks: [],
    };
    expect(diag.name).toBe("test");
  });
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

describe("diagnostics", () => {
  it("returns proper FeatureDiagnostic shape", () => {
    const diag = diagnostics();
    expect(diag).toHaveProperty("name", "payment");
    expect(["healthy", "degraded", "error"]).toContain(diag.status);
    expect(diag).toHaveProperty("stats");
    expect(diag).toHaveProperty("checks");
    expect(Array.isArray(diag.checks)).toBe(true);
  });

  it("includes status-machine check", () => {
    const diag = diagnostics();
    const check = diag.checks.find((c) => c.name === "status-machine");
    expect(check).toBeDefined();
    expect(check!.ok).toBe(true);
    expect(check!.detail).toContain("5 states");
  });

  it("includes payment-calculation check", () => {
    const diag = diagnostics();
    const check = diag.checks.find((c) => c.name === "payment-calculation");
    expect(check).toBeDefined();
    expect(check!.ok).toBe(true);
    expect(check!.detail).toContain("2 rate types");
  });

  it("includes batch-creation check", () => {
    const diag = diagnostics();
    const check = diag.checks.find((c) => c.name === "batch-creation");
    expect(check).toBeDefined();
    expect(check!.ok).toBe(true);
  });

  it("reports stats with expected keys", () => {
    const diag = diagnostics();
    expect(diag.stats).toHaveProperty("totalBatchesCreated");
    expect(diag.stats).toHaveProperty("totalTransitions");
    expect(diag.stats).toHaveProperty("totalCalculations");
    expect(diag.stats).toHaveProperty("lastOperationAt");
    expect(diag.stats).toHaveProperty("supportedStatuses");
    expect(diag.stats).toHaveProperty("rateTypes");
  });

  it("lists all 7 supported statuses", () => {
    const diag = diagnostics();
    const statuses = diag.stats.supportedStatuses as string[];
    expect(statuses).toEqual([...PAYMENT_STATUSES]);
  });

  it("lists both rate types", () => {
    const diag = diagnostics();
    const types = diag.stats.rateTypes as string[];
    expect(types).toEqual(["per_ton", "per_mile"]);
  });
});
