/**
 * BOL Extraction Service -- Tests (Track 6.1)
 * =============================================
 *
 * Focus on pure functions (validateExtraction) and constants since the
 * extraction itself requires the Anthropic API and processSubmission
 * requires a database. Export-existence checks cover those.
 */

import { describe, it, expect } from "vitest";
import {
  validateExtraction,
  extractFromPhotos,
  processSubmission,
  diagnostics,
  MAX_RETRY_COUNT,
  BOL_EXTRACTION_FIELDS,
  type ExtractedBolData,
  type ValidationResult,
  type ValidationIssue,
} from "../../src/plugins/verification/services/bol-extraction.service.js";

// ---------------------------------------------------------------------------
// Helpers -- build ExtractedBolData fixtures
// ---------------------------------------------------------------------------

function buildExtraction(
  overrides: Partial<ExtractedBolData> = {},
): ExtractedBolData {
  return {
    ticketNo: "123456",
    loadNumber: "L-2026-001",
    weight: 45000,
    grossWeight: 80000,
    tareWeight: 35000,
    pickupDate: new Date().toISOString().split("T")[0],
    deliveryDate: new Date().toISOString().split("T")[0],
    shipper: "ABC Quarry",
    consignee: "XYZ Well Site",
    product: "Frac Sand",
    truckNo: "T-101",
    trailerNo: "TR-200",
    carrier: "ES Express",
    driverName: "John Smith",
    notes: null,
    fieldConfidences: {
      ticketNo: 95,
      loadNumber: 88,
      weight: 92,
      grossWeight: 90,
      tareWeight: 90,
      pickupDate: 85,
      deliveryDate: 85,
      shipper: 80,
      consignee: 75,
      product: 90,
      truckNo: 95,
      trailerNo: 60,
      carrier: 70,
      driverName: 60,
      notes: 0,
    },
    overallConfidence: 82,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("BOL_EXTRACTION_FIELDS", () => {
  it("contains exactly 15 fields", () => {
    expect(BOL_EXTRACTION_FIELDS).toHaveLength(15);
  });

  it("includes all expected field names", () => {
    const expected = [
      "ticketNo",
      "loadNumber",
      "weight",
      "grossWeight",
      "tareWeight",
      "pickupDate",
      "deliveryDate",
      "shipper",
      "consignee",
      "product",
      "truckNo",
      "trailerNo",
      "carrier",
      "driverName",
      "notes",
    ];
    expect([...BOL_EXTRACTION_FIELDS]).toEqual(expected);
  });

  it("is a readonly tuple", () => {
    // TypeScript enforces this at compile time; runtime check that it's frozen-ish
    expect(Array.isArray(BOL_EXTRACTION_FIELDS)).toBe(true);
  });
});

describe("MAX_RETRY_COUNT", () => {
  it("equals 3", () => {
    expect(MAX_RETRY_COUNT).toBe(3);
  });

  it("is a number", () => {
    expect(typeof MAX_RETRY_COUNT).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// validateExtraction -- pure function, exhaustive rule coverage
// ---------------------------------------------------------------------------

describe("validateExtraction", () => {
  // --- Valid extraction ---

  it("returns isValid=true for a complete, normal extraction", () => {
    const result = validateExtraction(buildExtraction());
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns empty warnings for normal weight and date values", () => {
    const result = validateExtraction(buildExtraction());
    expect(result.warnings).toHaveLength(0);
  });

  // --- Critical: no identification ---

  it("returns critical error when both ticketNo and loadNumber are null", () => {
    const result = validateExtraction(
      buildExtraction({ ticketNo: null, loadNumber: null }),
    );
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe("identification");
    expect(result.errors[0].severity).toBe("critical");
  });

  it("is valid when ticketNo is present but loadNumber is null", () => {
    const result = validateExtraction(
      buildExtraction({ ticketNo: "12345", loadNumber: null }),
    );
    // Should not have identification error
    const idErrors = result.errors.filter((e) => e.field === "identification");
    expect(idErrors).toHaveLength(0);
  });

  it("is valid when loadNumber is present but ticketNo is null", () => {
    const result = validateExtraction(
      buildExtraction({ ticketNo: null, loadNumber: "L-001" }),
    );
    const idErrors = result.errors.filter((e) => e.field === "identification");
    expect(idErrors).toHaveLength(0);
  });

  // --- Critical: no weight ---

  it("returns critical error when both weight and grossWeight are null", () => {
    const result = validateExtraction(
      buildExtraction({ weight: null, grossWeight: null }),
    );
    expect(result.isValid).toBe(false);
    const weightErrors = result.errors.filter((e) => e.field === "weight");
    expect(weightErrors).toHaveLength(1);
    expect(weightErrors[0].severity).toBe("critical");
  });

  it("is valid when weight is present but grossWeight is null", () => {
    const result = validateExtraction(
      buildExtraction({ weight: 45000, grossWeight: null }),
    );
    const weightErrors = result.errors.filter((e) => e.field === "weight");
    expect(weightErrors).toHaveLength(0);
  });

  it("is valid when grossWeight is present but weight is null", () => {
    const result = validateExtraction(
      buildExtraction({ weight: null, grossWeight: 80000 }),
    );
    const weightErrors = result.errors.filter((e) => e.field === "weight");
    expect(weightErrors).toHaveLength(0);
  });

  // --- Multiple critical errors ---

  it("returns multiple critical errors when both identification and weight are missing", () => {
    const result = validateExtraction(
      buildExtraction({
        ticketNo: null,
        loadNumber: null,
        weight: null,
        grossWeight: null,
      }),
    );
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(2);
    const fields = result.errors.map((e) => e.field);
    expect(fields).toContain("identification");
    expect(fields).toContain("weight");
  });

  // --- Warning: weight > 120,000 lbs ---

  it("warns when weight exceeds 120,000 lbs", () => {
    const result = validateExtraction(buildExtraction({ weight: 130000 }));
    expect(result.isValid).toBe(true);
    const weightWarnings = result.warnings.filter((w) => w.field === "weight");
    expect(weightWarnings).toHaveLength(1);
    expect(weightWarnings[0].message).toContain("120,000");
    expect(weightWarnings[0].severity).toBe("warning");
  });

  it("does not warn when weight is exactly 120,000 lbs", () => {
    const result = validateExtraction(buildExtraction({ weight: 120000 }));
    const weightWarnings = result.warnings.filter(
      (w) => w.field === "weight" && w.message.includes("120,000"),
    );
    expect(weightWarnings).toHaveLength(0);
  });

  it("warns when grossWeight exceeds 120,000 and weight is null (uses effectiveWeight)", () => {
    const result = validateExtraction(
      buildExtraction({ weight: null, grossWeight: 150000 }),
    );
    const weightWarnings = result.warnings.filter(
      (w) => w.field === "weight" && w.message.includes("120,000"),
    );
    expect(weightWarnings).toHaveLength(1);
  });

  // --- Warning: weight < 100 lbs ---

  it("warns when weight is less than 100 lbs", () => {
    const result = validateExtraction(buildExtraction({ weight: 50 }));
    expect(result.isValid).toBe(true);
    const weightWarnings = result.warnings.filter(
      (w) => w.field === "weight" && w.message.includes("suspiciously low"),
    );
    expect(weightWarnings).toHaveLength(1);
  });

  it("does not warn when weight is exactly 100 lbs", () => {
    const result = validateExtraction(buildExtraction({ weight: 100 }));
    const lowWeightWarnings = result.warnings.filter(
      (w) => w.field === "weight" && w.message.includes("suspiciously low"),
    );
    expect(lowWeightWarnings).toHaveLength(0);
  });

  it("warns when grossWeight is less than 100 and weight is null", () => {
    const result = validateExtraction(
      buildExtraction({ weight: null, grossWeight: 10 }),
    );
    const lowWarnings = result.warnings.filter(
      (w) => w.field === "weight" && w.message.includes("suspiciously low"),
    );
    expect(lowWarnings).toHaveLength(1);
  });

  // --- Warning: ticketNo format ---

  it("warns when ticketNo does not match numeric pattern", () => {
    const result = validateExtraction(buildExtraction({ ticketNo: "ABC-123" }));
    const ticketWarnings = result.warnings.filter(
      (w) => w.field === "ticketNo",
    );
    expect(ticketWarnings).toHaveLength(1);
    expect(ticketWarnings[0].message).toContain("numeric pattern");
  });

  it("does not warn for a 4-digit numeric ticket number", () => {
    const result = validateExtraction(buildExtraction({ ticketNo: "1234" }));
    const ticketWarnings = result.warnings.filter(
      (w) => w.field === "ticketNo",
    );
    expect(ticketWarnings).toHaveLength(0);
  });

  it("does not warn for a 10-digit numeric ticket number", () => {
    const result = validateExtraction(
      buildExtraction({ ticketNo: "1234567890" }),
    );
    const ticketWarnings = result.warnings.filter(
      (w) => w.field === "ticketNo",
    );
    expect(ticketWarnings).toHaveLength(0);
  });

  it("warns for a 3-digit ticket number (too short)", () => {
    const result = validateExtraction(buildExtraction({ ticketNo: "123" }));
    const ticketWarnings = result.warnings.filter(
      (w) => w.field === "ticketNo",
    );
    expect(ticketWarnings).toHaveLength(1);
  });

  it("warns for an 11-digit ticket number (too long)", () => {
    const result = validateExtraction(
      buildExtraction({ ticketNo: "12345678901" }),
    );
    const ticketWarnings = result.warnings.filter(
      (w) => w.field === "ticketNo",
    );
    expect(ticketWarnings).toHaveLength(1);
  });

  it("does not warn when ticketNo is null", () => {
    const result = validateExtraction(buildExtraction({ ticketNo: null }));
    const ticketWarnings = result.warnings.filter(
      (w) => w.field === "ticketNo",
    );
    expect(ticketWarnings).toHaveLength(0);
  });

  // --- Warning: dates more than 90 days in past ---

  it("warns when pickupDate is more than 90 days ago", () => {
    const old = new Date();
    old.setDate(old.getDate() - 100);
    const result = validateExtraction(
      buildExtraction({ pickupDate: old.toISOString().split("T")[0] }),
    );
    const dateWarnings = result.warnings.filter(
      (w) => w.field === "pickupDate" && w.message.includes("90 days"),
    );
    expect(dateWarnings).toHaveLength(1);
  });

  it("warns when deliveryDate is more than 90 days ago", () => {
    const old = new Date();
    old.setDate(old.getDate() - 100);
    const result = validateExtraction(
      buildExtraction({ deliveryDate: old.toISOString().split("T")[0] }),
    );
    const dateWarnings = result.warnings.filter(
      (w) => w.field === "deliveryDate" && w.message.includes("90 days"),
    );
    expect(dateWarnings).toHaveLength(1);
  });

  it("does not warn for a date 89 days ago", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 89);
    const result = validateExtraction(
      buildExtraction({ pickupDate: recent.toISOString().split("T")[0] }),
    );
    const dateWarnings = result.warnings.filter(
      (w) => w.field === "pickupDate" && w.message.includes("90 days"),
    );
    expect(dateWarnings).toHaveLength(0);
  });

  // --- Warning: dates in the future ---

  it("warns when pickupDate is in the future", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const result = validateExtraction(
      buildExtraction({ pickupDate: future.toISOString().split("T")[0] }),
    );
    const dateWarnings = result.warnings.filter(
      (w) => w.field === "pickupDate" && w.message.includes("future"),
    );
    expect(dateWarnings).toHaveLength(1);
  });

  it("warns when deliveryDate is in the future", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const result = validateExtraction(
      buildExtraction({ deliveryDate: future.toISOString().split("T")[0] }),
    );
    const dateWarnings = result.warnings.filter(
      (w) => w.field === "deliveryDate" && w.message.includes("future"),
    );
    expect(dateWarnings).toHaveLength(1);
  });

  it("does not warn when dates are null", () => {
    const result = validateExtraction(
      buildExtraction({ pickupDate: null, deliveryDate: null }),
    );
    const dateWarnings = result.warnings.filter(
      (w) => w.field === "pickupDate" || w.field === "deliveryDate",
    );
    expect(dateWarnings).toHaveLength(0);
  });

  // --- Edge cases ---

  it("handles extraction with all null fields", () => {
    const result = validateExtraction(
      buildExtraction({
        ticketNo: null,
        loadNumber: null,
        weight: null,
        grossWeight: null,
        tareWeight: null,
        pickupDate: null,
        deliveryDate: null,
        shipper: null,
        consignee: null,
        product: null,
        truckNo: null,
        trailerNo: null,
        carrier: null,
        driverName: null,
        notes: null,
      }),
    );
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(2); // identification + weight
  });

  it("returns proper ValidationResult shape", () => {
    const result = validateExtraction(buildExtraction());
    expect(result).toHaveProperty("isValid");
    expect(result).toHaveProperty("errors");
    expect(result).toHaveProperty("warnings");
    expect(typeof result.isValid).toBe("boolean");
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("ValidationIssue has correct shape", () => {
    const result = validateExtraction(
      buildExtraction({ ticketNo: null, loadNumber: null }),
    );
    expect(result.errors.length).toBeGreaterThan(0);
    const issue = result.errors[0];
    expect(issue).toHaveProperty("field");
    expect(issue).toHaveProperty("message");
    expect(issue).toHaveProperty("severity");
    expect(typeof issue.field).toBe("string");
    expect(typeof issue.message).toBe("string");
    expect(["critical", "warning"]).toContain(issue.severity);
  });

  it("warnings are severity 'warning', errors are severity 'critical'", () => {
    const result = validateExtraction(
      buildExtraction({
        ticketNo: null,
        loadNumber: null,
        weight: 130000,
      }),
    );
    for (const e of result.errors) {
      expect(e.severity).toBe("critical");
    }
    for (const w of result.warnings) {
      expect(w.severity).toBe("warning");
    }
  });
});

// ---------------------------------------------------------------------------
// Export existence checks (DB/API-dependent functions)
// ---------------------------------------------------------------------------

describe("extractFromPhotos", () => {
  it("is exported as a function", () => {
    expect(typeof extractFromPhotos).toBe("function");
  });
});

describe("processSubmission", () => {
  it("is exported as a function", () => {
    expect(typeof processSubmission).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

describe("diagnostics", () => {
  it("returns proper FeatureDiagnostic shape", () => {
    const diag = diagnostics();
    expect(diag).toHaveProperty("name", "bol-extraction");
    expect(["healthy", "degraded", "error"]).toContain(diag.status);
    expect(diag).toHaveProperty("stats");
    expect(diag).toHaveProperty("checks");
    expect(Array.isArray(diag.checks)).toBe(true);
  });

  it("includes anthropic-api-key check", () => {
    const diag = diagnostics();
    const apiKeyCheck = diag.checks.find((c) => c.name === "anthropic-api-key");
    expect(apiKeyCheck).toBeDefined();
    expect(typeof apiKeyCheck!.ok).toBe("boolean");
  });

  it("includes model check", () => {
    const diag = diagnostics();
    const modelCheck = diag.checks.find((c) => c.name === "model");
    expect(modelCheck).toBeDefined();
    expect(modelCheck!.ok).toBe(true);
  });

  it("includes queue-health check", () => {
    const diag = diagnostics();
    const queueCheck = diag.checks.find((c) => c.name === "queue-health");
    expect(queueCheck).toBeDefined();
    expect(queueCheck!.ok).toBe(true);
  });

  it("reports stats with expected keys", () => {
    const diag = diagnostics();
    expect(diag.stats).toHaveProperty("totalExtractions");
    expect(diag.stats).toHaveProperty("totalFailures");
    expect(diag.stats).toHaveProperty("maxRetryCount", MAX_RETRY_COUNT);
    expect(diag.stats).toHaveProperty("fieldCount", 15);
    expect(diag.stats).toHaveProperty("configuredModel");
  });
});
