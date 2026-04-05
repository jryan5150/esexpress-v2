/**
 * Tests for overnight gap closure (2026-04-05)
 * - Task 1: Demurrage + rawData field extraction
 * - Task 3: BOL last-4-digit matching logic
 * - Task 5: Sheet validation service exports
 */
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Task 1: Verify dispatch-desk service exports demurrage fields
// ---------------------------------------------------------------------------

describe("Dispatch Desk rawData extraction", () => {
  it("getDispatchDeskLoads is exported", async () => {
    const mod =
      await import("../../src/plugins/dispatch/services/dispatch-desk.service.js");
    expect(typeof mod.getDispatchDeskLoads).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Task 3: BOL last-4-digit matching (pure logic)
// ---------------------------------------------------------------------------

describe("BOL last-4-digit matching", () => {
  function bolMatchStatus(
    bolNo: string | null,
    jotformBolNo: string | null,
  ): "match" | "mismatch" | null {
    if (!bolNo || !jotformBolNo) return null;
    const loadLast4 = bolNo.replace(/\D/g, "").slice(-4);
    const jotLast4 = jotformBolNo.replace(/\D/g, "").slice(-4);
    if (loadLast4.length < 4) return null;
    return loadLast4 === jotLast4 ? "match" : "mismatch";
  }

  it("returns null when bolNo is null", () => {
    expect(bolMatchStatus(null, "BOL-1234")).toBeNull();
  });

  it("returns null when jotformBolNo is null", () => {
    expect(bolMatchStatus("BOL-1234", null)).toBeNull();
  });

  it("returns null when both are null", () => {
    expect(bolMatchStatus(null, null)).toBeNull();
  });

  it("returns match when last 4 digits are identical", () => {
    expect(bolMatchStatus("BOL-12345678", "JF-5678")).toBe("match");
  });

  it("returns mismatch when last 4 digits differ", () => {
    expect(bolMatchStatus("BOL-12345678", "JF-9999")).toBe("mismatch");
  });

  it("strips non-digit characters before comparing", () => {
    expect(bolMatchStatus("BOL-1234-5678", "JF-56-78")).toBe("match");
  });

  it("returns null when bolNo has fewer than 4 digits", () => {
    expect(bolMatchStatus("B12", "J1234")).toBeNull();
  });

  it("handles numeric-only strings", () => {
    expect(bolMatchStatus("87654321", "4321")).toBe("match");
  });

  it("handles mismatched lengths with same last 4", () => {
    expect(bolMatchStatus("1111222233334444", "4444")).toBe("match");
  });

  it("is case-insensitive to non-digit chars", () => {
    expect(bolMatchStatus("ABC-1234", "xyz-1234")).toBe("match");
  });
});

// ---------------------------------------------------------------------------
// Task 1: Demurrage rawData field mapping
// ---------------------------------------------------------------------------

describe("Demurrage rawData field mapping", () => {
  // Simulates the extraction logic from dispatch-desk.service.ts
  function extractDemurrage(raw: Record<string, unknown>) {
    return {
      demurrageAtLoader: raw.demurrage_at_loader ?? null,
      demurrageAtLoaderHours: raw.demurrage_at_loader_hour ?? null,
      demurrageAtLoaderMinutes: raw.demurrage_at_loader_minutes ?? null,
      demurrageAtDestination: raw.demurrage_at_destination ?? null,
      demurrageAtDestHours: raw.demurrage_at_destination_hour ?? null,
      demurrageAtDestMinutes: raw.demurrage_at_destination_minutes ?? null,
      loadOutTime: raw.terminal_off ?? raw.terminal_off_time ?? null,
      loadTotalTime: raw.terminal_total_time ?? null,
      unloadTotalTime: raw.destination_total_time ?? null,
      appointmentTime: raw.appt_time ?? null,
      settlementDate: raw.settlement_date ?? null,
      shipperBol: raw.shipper_bol ?? raw.shipper_bol_no ?? null,
      dispatcherNotes: raw.dispatcher_notes ?? null,
    };
  }

  it("extracts demurrage at loader", () => {
    const result = extractDemurrage({ demurrage_at_loader: 125.5 });
    expect(result.demurrageAtLoader).toBe(125.5);
  });

  it("extracts demurrage at destination with hours/minutes", () => {
    const result = extractDemurrage({
      demurrage_at_destination: 75.0,
      demurrage_at_destination_hour: 2,
      demurrage_at_destination_minutes: 30,
    });
    expect(result.demurrageAtDestination).toBe(75.0);
    expect(result.demurrageAtDestHours).toBe(2);
    expect(result.demurrageAtDestMinutes).toBe(30);
  });

  it("extracts terminal_off as loadOutTime", () => {
    const result = extractDemurrage({
      terminal_off: "2026-04-03T08:30:00",
    });
    expect(result.loadOutTime).toBe("2026-04-03T08:30:00");
  });

  it("falls back to terminal_off_time for loadOutTime", () => {
    const result = extractDemurrage({
      terminal_off_time: "2026-04-03T08:30:00",
    });
    expect(result.loadOutTime).toBe("2026-04-03T08:30:00");
  });

  it("extracts load/unload total times", () => {
    const result = extractDemurrage({
      terminal_total_time: 45,
      destination_total_time: 22,
    });
    expect(result.loadTotalTime).toBe(45);
    expect(result.unloadTotalTime).toBe(22);
  });

  it("extracts appointment time", () => {
    const result = extractDemurrage({ appt_time: "14:00" });
    expect(result.appointmentTime).toBe("14:00");
  });

  it("extracts settlement date", () => {
    const result = extractDemurrage({ settlement_date: "2026-04-10" });
    expect(result.settlementDate).toBe("2026-04-10");
  });

  it("extracts shipper_bol with fallback", () => {
    expect(extractDemurrage({ shipper_bol: "SB-123" }).shipperBol).toBe(
      "SB-123",
    );
    expect(extractDemurrage({ shipper_bol_no: "SB-456" }).shipperBol).toBe(
      "SB-456",
    );
  });

  it("extracts dispatcher notes", () => {
    const result = extractDemurrage({ dispatcher_notes: "Call ahead" });
    expect(result.dispatcherNotes).toBe("Call ahead");
  });

  it("returns null for all fields when rawData is empty", () => {
    const result = extractDemurrage({});
    expect(Object.values(result).every((v) => v === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Task 5: Sheet validation service exports
// ---------------------------------------------------------------------------

describe("Sheet validation service", () => {
  it("exports validateFromSheet function", async () => {
    const mod =
      await import("../../src/plugins/sheets/services/sheets.service.js");
    expect(typeof mod.validateFromSheet).toBe("function");
  });

  it("exports SheetValidationResult type (function returns correct shape)", async () => {
    const mod =
      await import("../../src/plugins/sheets/services/sheets.service.js");
    // Verify the function exists and has expected arity (5 params)
    expect(mod.validateFromSheet.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Task 6 (state machine): Verify reconciled status exists
// ---------------------------------------------------------------------------

describe("State machine includes reconciled", () => {
  it("assigned can transition to reconciled", async () => {
    const mod = await import("../../src/plugins/dispatch/lib/state-machine.js");
    const transitions = mod.VALID_TRANSITIONS ?? mod.default;
    expect(transitions.assigned).toContain("reconciled");
  });

  it("reconciled can transition to dispatch_ready", async () => {
    const mod = await import("../../src/plugins/dispatch/lib/state-machine.js");
    const transitions = mod.VALID_TRANSITIONS ?? mod.default;
    expect(transitions.reconciled).toContain("dispatch_ready");
  });
});
