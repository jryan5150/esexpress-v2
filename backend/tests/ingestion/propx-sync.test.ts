import { describe, it, expect } from "vitest";
import {
  extractNumeric,
  lbsToTons,
  normalizeFromPropx,
  detectSchemaDrift,
  type NormalizedLoad,
} from "../../src/plugins/ingestion/services/propx-sync.service.js";

// ---------------------------------------------------------------------------
// extractNumeric
// ---------------------------------------------------------------------------

describe("PropX Sync — extractNumeric", () => {
  it("finds weight from primary alias 'weight'", () => {
    const obj = { weight: 42000 };
    expect(extractNumeric(obj, "weight", "net_weight")).toBe(42000);
  });

  it("finds weight from secondary alias 'net_weight'", () => {
    const obj = { net_weight: 38500 };
    expect(extractNumeric(obj, "weight", "net_weight")).toBe(38500);
  });

  it("finds weight from camelCase alias 'NetWeight'", () => {
    const obj = { NetWeight: 39000 };
    expect(extractNumeric(obj, "weight", "net_weight", "NetWeight")).toBe(
      39000,
    );
  });

  it("finds weight from 'gross_wt' alias", () => {
    const obj = { gross_wt: 44500 };
    expect(extractNumeric(obj, "weight", "gross_wt")).toBe(44500);
  });

  it("returns the first matching alias (priority order)", () => {
    const obj = { net_weight: 38500, weight: 42000 };
    // 'weight' is checked first
    expect(extractNumeric(obj, "weight", "net_weight")).toBe(42000);
  });

  it("checks nested objects (ticket.weight)", () => {
    const obj = { ticket: { weight: 41000 } };
    expect(extractNumeric(obj, "weight")).toBe(41000);
  });

  it("checks nested objects (scale.net_weight)", () => {
    const obj = { scale: { net_weight: 37000 } };
    expect(extractNumeric(obj, "net_weight")).toBe(37000);
  });

  it("checks nested objects (billing.weight)", () => {
    const obj = { billing: { weight: 40000 } };
    expect(extractNumeric(obj, "weight")).toBe(40000);
  });

  it("checks nested objects (details.weight)", () => {
    const obj = { details: { weight: 39500 } };
    expect(extractNumeric(obj, "weight")).toBe(39500);
  });

  it("prefers direct field over nested", () => {
    const obj = { weight: 42000, ticket: { weight: 41000 } };
    expect(extractNumeric(obj, "weight")).toBe(42000);
  });

  it("returns null when no alias matches", () => {
    const obj = { unrelated_field: 12345 };
    expect(
      extractNumeric(obj, "weight", "net_weight", "gross_weight"),
    ).toBeNull();
  });

  it("returns null for null input", () => {
    expect(
      extractNumeric(null as unknown as Record<string, unknown>, "weight"),
    ).toBeNull();
  });

  it("handles string-encoded numbers", () => {
    const obj = { weight: "42000" };
    expect(extractNumeric(obj, "weight")).toBe(42000);
  });

  it("rejects negative values", () => {
    const obj = { weight: -500 };
    expect(extractNumeric(obj, "weight")).toBeNull();
  });

  it("rejects NaN values", () => {
    const obj = { weight: "not-a-number" };
    expect(extractNumeric(obj, "weight")).toBeNull();
  });

  it("accepts zero as valid", () => {
    const obj = { weight: 0 };
    expect(extractNumeric(obj, "weight")).toBe(0);
  });

  it("skips null field value and continues to next alias", () => {
    const obj = { weight: null, net_weight: 38500 };
    expect(extractNumeric(obj, "weight", "net_weight")).toBe(38500);
  });

  it("skips undefined field and continues to next alias", () => {
    const obj = { net_weight: 38500 };
    expect(extractNumeric(obj, "weight", "net_weight")).toBe(38500);
  });

  it("handles nested object that is not a plain object", () => {
    const obj = { ticket: "not-an-object", weight: 42000 };
    expect(extractNumeric(obj, "weight")).toBe(42000);
  });
});

// ---------------------------------------------------------------------------
// lbsToTons
// ---------------------------------------------------------------------------

describe("PropX Sync — lbsToTons", () => {
  it("converts 42000 lbs to 21.0000 tons", () => {
    expect(lbsToTons(42000)).toBe("21.0000");
  });

  it("converts 38500 lbs correctly", () => {
    expect(lbsToTons(38500)).toBe("19.2500");
  });

  it("returns null for null input", () => {
    expect(lbsToTons(null)).toBeNull();
  });

  it("handles zero", () => {
    expect(lbsToTons(0)).toBe("0.0000");
  });

  it("rounds to 4 decimal places", () => {
    // 1 / 2000 = 0.0005
    expect(lbsToTons(1)).toBe("0.0005");
  });

  it("handles fractional pounds", () => {
    // 42001.5 / 2000 = 21.00075
    expect(lbsToTons(42001.5)).toBe("21.0008");
  });

  it("handles large values", () => {
    // 100000 / 2000 = 50
    expect(lbsToTons(100000)).toBe("50.0000");
  });

  it("returns null for undefined (cast as null)", () => {
    expect(lbsToTons(undefined as unknown as null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeFromPropx
// ---------------------------------------------------------------------------

describe("PropX Sync — normalizeFromPropx", () => {
  const sampleLoad: Record<string, unknown> = {
    propx_load_id: "abc-123",
    load_no: "L-4001",
    job_id: "job-456",
    driver_name: "John Smith",
    driver_id: "drv-789",
    truck_no: "T100",
    trailer_no: "TR200",
    carrier_name: "Swift Transport",
    customer_name: "Acme Oil",
    product_name: "Frac Sand 40/70",
    terminal_name: "Sand Mine Alpha",
    destination_name: "Well Pad #7",
    weight: 42000,
    net_weight: 38500,
    rate: 125.5,
    mileage: 87.3,
    bol_no: "BOL-2026-001",
    order_no: "ORD-500",
    reference_no: "REF-600",
    ticket_no: "TKT-700",
    load_status: "Delivered",
    delivered_on: "2026-03-15T14:30:00Z",
  };

  it("maps all fields correctly", () => {
    const result = normalizeFromPropx(sampleLoad);
    expect(result.loadNo).toBe("L-4001");
    expect(result.sourceId).toBe("abc-123");
    expect(result.driverName).toBe("John Smith");
    expect(result.driverId).toBe("drv-789");
    expect(result.truckNo).toBe("T100");
    expect(result.trailerNo).toBe("TR200");
    expect(result.carrierName).toBe("Swift Transport");
    expect(result.customerName).toBe("Acme Oil");
    expect(result.productDescription).toBe("Frac Sand 40/70");
    expect(result.originName).toBe("Sand Mine Alpha");
    expect(result.destinationName).toBe("Well Pad #7");
    expect(result.bolNo).toBe("BOL-2026-001");
    expect(result.orderNo).toBe("ORD-500");
    expect(result.referenceNo).toBe("REF-600");
    expect(result.ticketNo).toBe("TKT-700");
    expect(result.status).toBe("Delivered");
  });

  it("sets source to 'propx'", () => {
    const result = normalizeFromPropx(sampleLoad);
    expect(result.source).toBe("propx");
  });

  it("converts weight from lbs to tons", () => {
    const result = normalizeFromPropx(sampleLoad);
    expect(result.weightTons).toBe("21.0000");
  });

  it("converts net weight from lbs to tons", () => {
    const result = normalizeFromPropx(sampleLoad);
    expect(result.netWeightTons).toBe("19.2500");
  });

  it("formats rate as string with 2 decimal places", () => {
    const result = normalizeFromPropx(sampleLoad);
    expect(result.rate).toBe("125.50");
  });

  it("formats mileage as string with 2 decimal places", () => {
    const result = normalizeFromPropx(sampleLoad);
    expect(result.mileage).toBe("87.30");
  });

  it("preserves raw_data as the original object", () => {
    const result = normalizeFromPropx(sampleLoad);
    expect(result.rawData).toBe(sampleLoad);
    expect(result.rawData.propx_load_id).toBe("abc-123");
  });

  it("parses delivered_on date", () => {
    const result = normalizeFromPropx(sampleLoad);
    expect(result.deliveredOn).toBeInstanceOf(Date);
    expect(result.deliveredOn?.toISOString()).toBe("2026-03-15T14:30:00.000Z");
  });

  it("returns null for missing optional fields", () => {
    const minimal: Record<string, unknown> = {
      propx_load_id: "min-001",
      load_no: "L-1",
    };
    const result = normalizeFromPropx(minimal);
    expect(result.driverName).toBeNull();
    expect(result.driverId).toBeNull();
    expect(result.truckNo).toBeNull();
    expect(result.trailerNo).toBeNull();
    expect(result.carrierName).toBeNull();
    expect(result.customerName).toBeNull();
    expect(result.productDescription).toBeNull();
    expect(result.originName).toBeNull();
    expect(result.destinationName).toBeNull();
    expect(result.weightTons).toBeNull();
    expect(result.netWeightTons).toBeNull();
    expect(result.rate).toBeNull();
    expect(result.mileage).toBeNull();
    expect(result.bolNo).toBeNull();
    expect(result.orderNo).toBeNull();
    expect(result.referenceNo).toBeNull();
    expect(result.ticketNo).toBeNull();
    expect(result.status).toBeNull();
    expect(result.deliveredOn).toBeNull();
  });

  it("handles camelCase field names from PropX", () => {
    const camelCaseLoad: Record<string, unknown> = {
      propx_load_id: "cc-001",
      loadNo: "L-CC-1",
      driverName: "Jane Doe",
      truckNo: "T50",
      trailerNo: "TR50",
      carrierName: "CarrierCamel",
      terminalName: "TermCamel",
    };
    const result = normalizeFromPropx(camelCaseLoad);
    expect(result.loadNo).toBe("L-CC-1");
    expect(result.driverName).toBe("Jane Doe");
    expect(result.truckNo).toBe("T50");
    expect(result.trailerNo).toBe("TR50");
    expect(result.carrierName).toBe("CarrierCamel");
    expect(result.originName).toBe("TermCamel");
  });

  it("uses propx_load_id as sourceId", () => {
    const result = normalizeFromPropx(sampleLoad);
    expect(result.sourceId).toBe("abc-123");
  });

  it("falls back to id when propx_load_id missing", () => {
    const load: Record<string, unknown> = { id: "fallback-id", load_no: "L-1" };
    const result = normalizeFromPropx(load);
    expect(result.sourceId).toBe("fallback-id");
  });

  it("handles invalid delivered_on gracefully", () => {
    const load: Record<string, unknown> = {
      propx_load_id: "bad-date",
      load_no: "L-1",
      delivered_on: "not-a-date",
    };
    const result = normalizeFromPropx(load);
    expect(result.deliveredOn).toBeNull();
  });

  it("resolves weight from nested ticket.weight", () => {
    const load: Record<string, unknown> = {
      propx_load_id: "nested-wt",
      load_no: "L-1",
      ticket: { weight: 40000 },
    };
    const result = normalizeFromPropx(load);
    expect(result.weightTons).toBe("20.0000");
  });

  it("resolves mileage from 'miles' alias", () => {
    const load: Record<string, unknown> = {
      propx_load_id: "miles-alias",
      load_no: "L-1",
      miles: 120,
    };
    const result = normalizeFromPropx(load);
    expect(result.mileage).toBe("120.00");
  });

  it("resolves mileage from 'Distance' alias", () => {
    const load: Record<string, unknown> = {
      propx_load_id: "dist-alias",
      load_no: "L-1",
      Distance: 95.5,
    };
    const result = normalizeFromPropx(load);
    expect(result.mileage).toBe("95.50");
  });
});

// ---------------------------------------------------------------------------
// detectSchemaDrift
// ---------------------------------------------------------------------------

describe("PropX Sync — detectSchemaDrift", () => {
  it("returns empty array for all known fields", () => {
    const raw = {
      propx_load_id: "abc",
      load_no: "L-1",
      weight: 42000,
      driver_name: "John",
      status: "Delivered",
    };
    expect(detectSchemaDrift(raw)).toEqual([]);
  });

  it("detects unknown fields", () => {
    const raw = {
      propx_load_id: "abc",
      completely_new_field: "surprise",
      another_unknown: 42,
    };
    const drift = detectSchemaDrift(raw);
    expect(drift).toContain("completely_new_field");
    expect(drift).toContain("another_unknown");
    expect(drift).not.toContain("propx_load_id");
  });

  it("is case-insensitive for known fields", () => {
    // 'Weight' maps to 'weight' in the known set
    const raw = { Weight: 42000 };
    expect(detectSchemaDrift(raw)).toEqual([]);
  });

  it("returns all unknown fields at once", () => {
    const raw = {
      field_a: 1,
      field_b: 2,
      field_c: 3,
    };
    expect(detectSchemaDrift(raw)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// NormalizedLoad type structure
// ---------------------------------------------------------------------------

describe("PropX Sync — NormalizedLoad type contract", () => {
  it("has all expected fields in the interface", () => {
    const result = normalizeFromPropx({
      propx_load_id: "type-check",
      load_no: "L-1",
    });

    // Verify all keys exist (runtime shape matches the interface)
    const expectedKeys: (keyof NormalizedLoad)[] = [
      "loadNo",
      "source",
      "sourceId",
      "driverName",
      "driverId",
      "truckNo",
      "trailerNo",
      "carrierName",
      "customerName",
      "productDescription",
      "originName",
      "destinationName",
      "weightTons",
      "netWeightTons",
      "rate",
      "mileage",
      "bolNo",
      "orderNo",
      "referenceNo",
      "ticketNo",
      "status",
      "deliveredOn",
      "rawData",
    ];

    for (const key of expectedKeys) {
      expect(result).toHaveProperty(key);
    }
  });
});
