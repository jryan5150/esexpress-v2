import { describe, it, expect } from "vitest";
import {
  ASSIGNMENT_EXPORT_COLUMNS,
  WELL_EXPORT_COLUMNS,
  MAX_EXPORT_ROWS,
  sanitizeCell,
  getGoogleAuth,
  exportAssignments,
  exportWells,
  previewImport,
  executeImport,
  listAccessibleSheets,
  diagnostics,
  type ExportColumn,
} from "../../src/plugins/sheets/services/sheets.service.js";

// ---------------------------------------------------------------------------
// Column config exports
// ---------------------------------------------------------------------------

describe("ASSIGNMENT_EXPORT_COLUMNS", () => {
  it("exports exactly 19 columns", () => {
    expect(ASSIGNMENT_EXPORT_COLUMNS).toHaveLength(19);
  });

  it("each column has key, header, and optional width", () => {
    for (const col of ASSIGNMENT_EXPORT_COLUMNS) {
      expect(typeof col.key).toBe("string");
      expect(col.key.length).toBeGreaterThan(0);
      expect(typeof col.header).toBe("string");
      expect(col.header.length).toBeGreaterThan(0);
      if (col.width !== undefined) {
        expect(typeof col.width).toBe("number");
        expect(col.width).toBeGreaterThan(0);
      }
    }
  });

  it("has no duplicate keys", () => {
    const keys = ASSIGNMENT_EXPORT_COLUMNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has no duplicate headers", () => {
    const headers = ASSIGNMENT_EXPORT_COLUMNS.map((c) => c.header);
    expect(new Set(headers).size).toBe(headers.length);
  });

  it("includes required columns from spec", () => {
    const headers = ASSIGNMENT_EXPORT_COLUMNS.map((c) => c.header);
    const required = [
      "Load #",
      "BOL #",
      "Driver",
      "Truck #",
      "Carrier",
      "Well",
      "Status",
      "Product",
      "Weight (tons)",
      "Rate",
      "Mileage",
      "Origin",
      "Destination",
      "Delivered On",
      "Assigned Date",
      "Dispatcher",
      "PCS Status",
      "Photo Status",
      "Notes",
    ];
    for (const h of required) {
      expect(headers).toContain(h);
    }
  });
});

describe("WELL_EXPORT_COLUMNS", () => {
  it("exports exactly 15 columns", () => {
    expect(WELL_EXPORT_COLUMNS).toHaveLength(15);
  });

  it("each column has key, header, and optional width", () => {
    for (const col of WELL_EXPORT_COLUMNS) {
      expect(typeof col.key).toBe("string");
      expect(col.key.length).toBeGreaterThan(0);
      expect(typeof col.header).toBe("string");
      expect(col.header.length).toBeGreaterThan(0);
      if (col.width !== undefined) {
        expect(typeof col.width).toBe("number");
        expect(col.width).toBeGreaterThan(0);
      }
    }
  });

  it("has no duplicate keys", () => {
    const keys = WELL_EXPORT_COLUMNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has no duplicate headers", () => {
    const headers = WELL_EXPORT_COLUMNS.map((c) => c.header);
    expect(new Set(headers).size).toBe(headers.length);
  });

  it("includes required columns from spec", () => {
    const headers = WELL_EXPORT_COLUMNS.map((c) => c.header);
    const required = [
      "Name",
      "Status",
      "Daily Target (Loads)",
      "Daily Target (Tons)",
      "Latitude",
      "Longitude",
      "PropX Job ID",
      "PropX Destination ID",
      "Aliases",
      "Active Assignments",
      "Total Loads",
      "Avg Weight",
      "Customer",
      "Created",
      "Last Updated",
    ];
    for (const h of required) {
      expect(headers).toContain(h);
    }
  });
});

// ---------------------------------------------------------------------------
// MAX_EXPORT_ROWS constant
// ---------------------------------------------------------------------------

describe("MAX_EXPORT_ROWS", () => {
  it("equals 10,000", () => {
    expect(MAX_EXPORT_ROWS).toBe(10_000);
  });

  it("is a number", () => {
    expect(typeof MAX_EXPORT_ROWS).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// sanitizeCell — formula injection protection
// ---------------------------------------------------------------------------

describe("sanitizeCell", () => {
  it("prefixes strings starting with = to prevent formula injection", () => {
    expect(sanitizeCell("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
  });

  it("prefixes strings starting with + to prevent formula injection", () => {
    expect(sanitizeCell("+cmd|'/C calc'!A0")).toBe("'+cmd|'/C calc'!A0");
  });

  it("prefixes strings starting with - to prevent formula injection", () => {
    expect(sanitizeCell("-1+cmd|'/C calc'!A0")).toBe("'-1+cmd|'/C calc'!A0");
  });

  it("prefixes strings starting with @ to prevent formula injection", () => {
    expect(sanitizeCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("prefixes strings starting with tab to prevent formula injection", () => {
    expect(sanitizeCell("\t=1+1")).toBe("'\t=1+1");
  });

  it("prefixes strings starting with carriage return to prevent formula injection", () => {
    expect(sanitizeCell("\r=1+1")).toBe("'\r=1+1");
  });

  it("prefixes strings starting with pipe to prevent formula injection", () => {
    expect(sanitizeCell("|cmd")).toBe("'|cmd");
  });

  it("preserves safe strings unchanged", () => {
    expect(sanitizeCell("Hello World")).toBe("Hello World");
    expect(sanitizeCell("12345")).toBe("12345");
    expect(sanitizeCell("john@example.com")).toBe("john@example.com");
    expect(sanitizeCell("Well #42")).toBe("Well #42");
  });

  it("preserves empty string", () => {
    expect(sanitizeCell("")).toBe("");
  });

  it("preserves strings with dangerous characters not at start", () => {
    expect(sanitizeCell("total = 100")).toBe("total = 100");
    expect(sanitizeCell("net +5")).toBe("net +5");
    expect(sanitizeCell("load-123")).toBe("load-123");
    expect(sanitizeCell("user@domain.com")).toBe("user@domain.com");
  });

  it("handles single dangerous character", () => {
    expect(sanitizeCell("=")).toBe("'=");
    expect(sanitizeCell("+")).toBe("'+");
    expect(sanitizeCell("-")).toBe("'-");
    expect(sanitizeCell("@")).toBe("'@");
    expect(sanitizeCell("|")).toBe("'|");
  });

  it("returns non-string values as-is (type safety)", () => {
    // The function signature says string, but the implementation handles
    // non-string gracefully for defense-in-depth
    expect(sanitizeCell(42 as unknown as string)).toBe(42);
    expect(sanitizeCell(null as unknown as string)).toBe(null);
    expect(sanitizeCell(undefined as unknown as string)).toBe(undefined);
  });
});

// ---------------------------------------------------------------------------
// Function exports exist
// ---------------------------------------------------------------------------

describe("function exports", () => {
  it("exports getGoogleAuth function", () => {
    expect(typeof getGoogleAuth).toBe("function");
  });

  it("exports exportAssignments function", () => {
    expect(typeof exportAssignments).toBe("function");
  });

  it("exports exportWells function", () => {
    expect(typeof exportWells).toBe("function");
  });

  it("exports previewImport function", () => {
    expect(typeof previewImport).toBe("function");
  });

  it("exports executeImport function", () => {
    expect(typeof executeImport).toBe("function");
  });

  it("exports listAccessibleSheets function", () => {
    expect(typeof listAccessibleSheets).toBe("function");
  });

  it("exports diagnostics function", () => {
    expect(typeof diagnostics).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Diagnostics shape
// ---------------------------------------------------------------------------

describe("diagnostics", () => {
  it("returns correct shape", () => {
    const diag = diagnostics();
    expect(diag.name).toBe("google-sheets");
    expect(["healthy", "degraded", "error"]).toContain(diag.status);
    expect(diag.stats).toBeDefined();
    expect(Array.isArray(diag.checks)).toBe(true);
  });

  it("includes required stats fields", () => {
    const diag = diagnostics();
    expect(diag.stats.maxExportRows).toBe(10_000);
    expect(diag.stats.assignmentColumns).toBe(19);
    expect(diag.stats.wellColumns).toBe(15);
    expect(typeof diag.stats.totalExports).toBe("number");
    expect(typeof diag.stats.totalImports).toBe("number");
  });

  it("includes required checks", () => {
    const diag = diagnostics();
    const checkNames = diag.checks.map((c) => c.name);
    expect(checkNames).toContain("auth-configured");
    expect(checkNames).toContain("last-auth-attempt");
    expect(checkNames).toContain("assignment-columns");
    expect(checkNames).toContain("well-columns");
  });

  it("each check has ok boolean and optional detail", () => {
    const diag = diagnostics();
    for (const check of diag.checks) {
      expect(typeof check.name).toBe("string");
      expect(typeof check.ok).toBe("boolean");
    }
  });

  it("reports error status when no Google auth configured", () => {
    // In test environment, no Google env vars are set
    const diag = diagnostics();
    expect(diag.status).toBe("error");
    const authCheck = diag.checks.find((c) => c.name === "auth-configured");
    expect(authCheck?.ok).toBe(false);
    expect(authCheck?.detail).toBe("missing");
  });

  it("column count checks pass", () => {
    const diag = diagnostics();
    const assignCheck = diag.checks.find(
      (c) => c.name === "assignment-columns",
    );
    const wellCheck = diag.checks.find((c) => c.name === "well-columns");
    expect(assignCheck?.ok).toBe(true);
    expect(assignCheck?.detail).toBe(19);
    expect(wellCheck?.ok).toBe(true);
    expect(wellCheck?.detail).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// getGoogleAuth — error handling
// ---------------------------------------------------------------------------

describe("getGoogleAuth", () => {
  it("throws when no Google credentials are configured", async () => {
    // Test env has no GOOGLE_* env vars
    await expect(getGoogleAuth()).rejects.toThrow(
      /Google Sheets integration requires/,
    );
  });
});
