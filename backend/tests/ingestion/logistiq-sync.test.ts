import { describe, it, expect } from "vitest";
import {
  parseDate,
  generateSourceId,
  normalizeFromLogistiq,
  compareLoadValues,
  type NormalizedLoad,
  type Discrepancy,
} from "../../src/plugins/ingestion/services/logistiq-sync.service.js";

// ---------------------------------------------------------------------------
// parseDate
// ---------------------------------------------------------------------------

describe("Logistiq Sync — parseDate", () => {
  it("parses ISO 8601 string", () => {
    const result = parseDate("2026-03-15T14:30:00Z");
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe("2026-03-15T14:30:00.000Z");
  });

  it("parses ISO 8601 date-only string", () => {
    const result = parseDate("2026-03-15");
    expect(result).toBeInstanceOf(Date);
    // Date-only ISO parses as UTC
    expect(result?.getFullYear()).toBe(2026);
  });

  it("parses MM/DD/YYYY format", () => {
    const result = parseDate("03/15/2026");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2026);
    expect(result?.getMonth()).toBe(2); // 0-indexed
    expect(result?.getDate()).toBe(15);
  });

  it("parses M/D/YYYY format (single digits)", () => {
    const result = parseDate("3/5/2026");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2026);
    expect(result?.getMonth()).toBe(2);
    expect(result?.getDate()).toBe(5);
  });

  it("parses MM-DD-YYYY format", () => {
    const result = parseDate("03-15-2026");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2026);
    expect(result?.getMonth()).toBe(2);
    expect(result?.getDate()).toBe(15);
  });

  it("expands 2-digit year 00-29 to 2000s", () => {
    const result = parseDate("03/15/26");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2026);
  });

  it("expands 2-digit year 29 to 2029", () => {
    const result = parseDate("01/01/29");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2029);
  });

  it("expands 2-digit year 30 to 1930", () => {
    const result = parseDate("01/01/30");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(1930);
  });

  it("expands 2-digit year 99 to 1999", () => {
    const result = parseDate("06/15/99");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(1999);
  });

  it("returns null for null input", () => {
    expect(parseDate(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseDate("")).toBeNull();
  });

  it("returns null for zeroed-out date (0000-00-00 00:00:00)", () => {
    expect(parseDate("0000-00-00 00:00:00")).toBeNull();
  });

  it("returns null for garbage string", () => {
    expect(parseDate("not-a-date")).toBeNull();
  });

  it("returns null for undefined cast to null", () => {
    expect(parseDate(undefined as unknown as null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// generateSourceId
// ---------------------------------------------------------------------------

describe("Logistiq Sync — generateSourceId", () => {
  it("generates lgx-{load_no}-{order_no} for normal case", () => {
    const raw = { load_no: "L-100", order_no: "ORD-200" };
    expect(generateSourceId(raw)).toBe("lgx-L-100-ORD-200");
  });

  it("handles camelCase field names", () => {
    const raw = { loadNo: "L-101", orderNo: "ORD-201" };
    expect(generateSourceId(raw)).toBe("lgx-L-101-ORD-201");
  });

  it("handles order_id as fallback for order_no", () => {
    const raw = { load_no: "L-102", order_id: "12345" };
    expect(generateSourceId(raw)).toBe("lgx-L-102-12345");
  });

  it("falls back to hash when load_no is null", () => {
    const raw = { order_no: "ORD-300", driver_name: "Smith" };
    const result = generateSourceId(raw);
    expect(result).toMatch(/^lgx-unknown-[a-f0-9]{12}$/);
  });

  it("falls back to hash when order_no is null", () => {
    const raw = { load_no: "L-103" };
    const result = generateSourceId(raw);
    expect(result).toMatch(/^lgx-unknown-[a-f0-9]{12}$/);
  });

  it("falls back to hash for empty object", () => {
    const result = generateSourceId({});
    expect(result).toMatch(/^lgx-unknown-[a-f0-9]{12}$/);
  });

  it("produces deterministic hash for same input", () => {
    const raw = { some_field: "abc" };
    const a = generateSourceId(raw);
    const b = generateSourceId(raw);
    expect(a).toBe(b);
  });

  it("produces different hashes for different input", () => {
    const a = generateSourceId({ some_field: "abc" });
    const b = generateSourceId({ some_field: "xyz" });
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// normalizeFromLogistiq
// ---------------------------------------------------------------------------

describe("Logistiq Sync — normalizeFromLogistiq", () => {
  const sampleApiOrder: Record<string, unknown> = {
    order_id: "12345",
    load_no: "L-5001",
    order_no: "ORD-600",
    driver_name: "Jane Smith",
    driver_id: "drv-100",
    truck_no: "T200",
    trailer_no: "TR300",
    carrier_name: "Express Hauling",
    customer_name: "Oilfield Corp",
    product_name: "Frac Sand 100",
    terminal_name: "Sand Mine Beta",
    destination_name: "Taylor Creek 1H",
    tonsPerLoad: 22.5,
    rate: 15.75,
    mileage: 120.5,
    bol_no: "BOL-3001",
    reference_no: "REF-400",
    sand_ticket_no: "ST-700",
    order_status: "completed",
    completed_at: "2026-03-15T14:30:00Z",
  };

  it("sets source to 'logistiq'", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.source).toBe("logistiq");
  });

  it("generates correct sourceId", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.sourceId).toBe("lgx-L-5001-ORD-600");
  });

  it("maps driver fields", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.driverName).toBe("Jane Smith");
    expect(result.driverId).toBe("drv-100");
  });

  it("maps truck and trailer", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.truckNo).toBe("T200");
    expect(result.trailerNo).toBe("TR300");
  });

  it("maps carrier and customer", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.carrierName).toBe("Express Hauling");
    expect(result.customerName).toBe("Oilfield Corp");
  });

  it("maps product to productDescription", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.productDescription).toBe("Frac Sand 100");
  });

  it("maps terminal_name to originName", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.originName).toBe("Sand Mine Beta");
  });

  it("maps destination", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.destinationName).toBe("Taylor Creek 1H");
  });

  it("uses tonsPerLoad for weight (direct tons)", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.weightTons).toBe("22.5000");
  });

  it("formats rate as string with 2 decimal places", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.rate).toBe("15.75");
  });

  it("formats mileage as string with 2 decimal places", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.mileage).toBe("120.50");
  });

  it("maps BOL number", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.bolNo).toBe("BOL-3001");
  });

  it("maps order number", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.orderNo).toBe("ORD-600");
  });

  it("maps reference number", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.referenceNo).toBe("REF-400");
  });

  it("maps ticket number from sand_ticket_no", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.ticketNo).toBe("ST-700");
  });

  it("maps status from order_status", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.status).toBe("completed");
  });

  it("parses delivered_on from completed_at", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.deliveredOn).toBeInstanceOf(Date);
    expect(result.deliveredOn?.toISOString()).toBe("2026-03-15T14:30:00.000Z");
  });

  it("preserves raw data", () => {
    const result = normalizeFromLogistiq(sampleApiOrder);
    expect(result.rawData).toBe(sampleApiOrder);
  });

  it("returns null for missing optional fields", () => {
    const minimal: Record<string, unknown> = {
      load_no: "L-1",
      order_no: "O-1",
    };
    const result = normalizeFromLogistiq(minimal);
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
    expect(result.referenceNo).toBeNull();
    expect(result.ticketNo).toBeNull();
    expect(result.status).toBeNull();
    expect(result.deliveredOn).toBeNull();
  });

  // Weight resolution priority tests
  it("prefers direct tons over lbs conversion", () => {
    const raw: Record<string, unknown> = {
      load_no: "L-1",
      order_no: "O-1",
      tons: "25.5",
      weight: "42000",
    };
    const result = normalizeFromLogistiq(raw);
    // Direct tons should win: 25.5, not 42000/2000 = 21
    expect(result.weightTons).toBe("25.5000");
  });

  it("converts lbs to tons when no direct ton field", () => {
    const raw: Record<string, unknown> = {
      load_no: "L-1",
      order_no: "O-1",
      weight: "42000",
    };
    const result = normalizeFromLogistiq(raw);
    expect(result.weightTons).toBe("21.0000");
  });

  it("handles tonsPerLoad as primary weight source", () => {
    const raw: Record<string, unknown> = {
      load_no: "L-1",
      order_no: "O-1",
      tonsPerLoad: 22.1,
    };
    const result = normalizeFromLogistiq(raw);
    expect(result.weightTons).toBe("22.1000");
  });

  it("handles zero tonsPerLoad (via nullish coalescing, 0 is valid)", () => {
    const raw: Record<string, unknown> = {
      load_no: "L-1",
      order_no: "O-1",
      tonsPerLoad: 0,
    };
    const result = normalizeFromLogistiq(raw);
    expect(result.weightTons).toBe("0.0000");
  });

  it("converts net_weight lbs to net tons", () => {
    const raw: Record<string, unknown> = {
      load_no: "L-1",
      order_no: "O-1",
      "net weight": "38500",
    };
    const result = normalizeFromLogistiq(raw);
    expect(result.netWeightTons).toBe("19.2500");
  });

  // CSV column header variations
  it("maps 'Load #' header to loadNo", () => {
    const raw: Record<string, unknown> = {
      "Load #": "L-CSV-1",
      "Order #": "O-CSV-1",
    };
    const result = normalizeFromLogistiq(raw);
    expect(result.loadNo).toBe("L-CSV-1");
  });

  it("maps 'Driver Name' header to driverName", () => {
    const raw: Record<string, unknown> = {
      load_no: "L-1",
      order_no: "O-1",
      "Driver Name": "Bob Johnson",
    };
    // "Driver Name" lowercased = "driver name", which maps to "driver_name"
    const result = normalizeFromLogistiq(raw);
    expect(result.driverName).toBe("Bob Johnson");
  });

  it("maps 'Weight (lbs)' header to weight via lbs conversion", () => {
    const raw: Record<string, unknown> = {
      load_no: "L-1",
      order_no: "O-1",
      "Weight (lbs)": "40000",
    };
    const result = normalizeFromLogistiq(raw);
    expect(result.weightTons).toBe("20.0000");
  });

  it("maps 'Weight (tons)' header to direct tons", () => {
    const raw: Record<string, unknown> = {
      load_no: "L-1",
      order_no: "O-1",
      "Weight (tons)": "20.5",
    };
    const result = normalizeFromLogistiq(raw);
    expect(result.weightTons).toBe("20.5000");
  });

  it("maps 'Bill of Lading' header to bolNo", () => {
    const raw: Record<string, unknown> = {
      load_no: "L-1",
      order_no: "O-1",
      "Bill of Lading": "BOL-999",
    };
    const result = normalizeFromLogistiq(raw);
    expect(result.bolNo).toBe("BOL-999");
  });

  // Date resolution priority
  it("prefers completed_at over expected_pickup_time", () => {
    const raw: Record<string, unknown> = {
      load_no: "L-1",
      order_no: "O-1",
      completed_at: "2026-03-15T14:00:00Z",
      expected_pickup_time: "2026-03-15T08:00:00Z",
    };
    const result = normalizeFromLogistiq(raw);
    expect(result.deliveredOn?.toISOString()).toBe("2026-03-15T14:00:00.000Z");
  });

  it("falls back to expected_pickup_time when completed_at is missing", () => {
    const raw: Record<string, unknown> = {
      load_no: "L-1",
      order_no: "O-1",
      expected_pickup_time: "2026-03-15T08:00:00Z",
    };
    const result = normalizeFromLogistiq(raw);
    expect(result.deliveredOn?.toISOString()).toBe("2026-03-15T08:00:00.000Z");
  });

  it("rejects zeroed-out expected_pickup_time", () => {
    const raw: Record<string, unknown> = {
      load_no: "L-1",
      order_no: "O-1",
      expected_pickup_time: "0000-00-00 00:00:00",
    };
    const result = normalizeFromLogistiq(raw);
    expect(result.deliveredOn).toBeNull();
  });

  it("parses MM/DD/YYYY delivered date from CSV", () => {
    const raw: Record<string, unknown> = {
      load_no: "L-1",
      order_no: "O-1",
      delivered_on: "03/15/2026",
    };
    const result = normalizeFromLogistiq(raw);
    expect(result.deliveredOn).toBeInstanceOf(Date);
    expect(result.deliveredOn?.getFullYear()).toBe(2026);
    expect(result.deliveredOn?.getMonth()).toBe(2);
    expect(result.deliveredOn?.getDate()).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// compareLoadValues
// ---------------------------------------------------------------------------

describe("Logistiq Sync — compareLoadValues", () => {
  function makeLoad(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 1,
      loadNo: "L-100",
      source: "propx",
      sourceId: "propx-100",
      orderNo: "ORD-1",
      driverName: "John Smith",
      carrierName: "Swift Transport",
      productDescription: "Frac Sand 40/70",
      truckNo: "T100",
      trailerNo: "TR200",
      ticketNo: "TKT-001",
      weightTons: "21.0000",
      netWeightTons: "19.2500",
      rate: "125.50",
      mileage: "87.30",
      deliveredOn: new Date("2026-03-15"),
      ...overrides,
    };
  }

  it("returns empty array when loads are identical", () => {
    const propx = makeLoad({ source: "propx" });
    const lgx = makeLoad({ source: "logistiq" });
    expect(compareLoadValues(propx, lgx)).toEqual([]);
  });

  it("detects critical weight discrepancy (>10%)", () => {
    const propx = makeLoad({ weightTons: "21.0000" });
    const lgx = makeLoad({ weightTons: "18.0000" }); // ~14% diff
    const result = compareLoadValues(propx, lgx);
    const weightDisc = result.find((d) => d.field === "weightTons");
    expect(weightDisc).toBeDefined();
    expect(weightDisc?.severity).toBe("critical");
    expect(weightDisc?.propxValue).toBe(21);
    expect(weightDisc?.logistiqValue).toBe(18);
  });

  it("detects warning weight discrepancy (5-10%)", () => {
    const propx = makeLoad({ weightTons: "21.0000" });
    const lgx = makeLoad({ weightTons: "19.7000" }); // ~6.2% diff
    const result = compareLoadValues(propx, lgx);
    const weightDisc = result.find((d) => d.field === "weightTons");
    expect(weightDisc).toBeDefined();
    expect(weightDisc?.severity).toBe("warning");
  });

  it("no discrepancy when weight within 5% tolerance", () => {
    const propx = makeLoad({ weightTons: "21.0000" });
    const lgx = makeLoad({ weightTons: "20.5000" }); // ~2.4% diff
    const result = compareLoadValues(propx, lgx);
    const weightDisc = result.find((d) => d.field === "weightTons");
    expect(weightDisc).toBeUndefined();
  });

  it("detects critical rate discrepancy (>$100)", () => {
    const propx = makeLoad({ rate: "125.50" });
    const lgx = makeLoad({ rate: "250.00" }); // $124.50 diff
    const result = compareLoadValues(propx, lgx);
    const rateDisc = result.find((d) => d.field === "rate");
    expect(rateDisc).toBeDefined();
    expect(rateDisc?.severity).toBe("critical");
  });

  it("detects warning rate discrepancy (>$10)", () => {
    const propx = makeLoad({ rate: "125.50" });
    const lgx = makeLoad({ rate: "140.00" }); // $14.50 diff
    const result = compareLoadValues(propx, lgx);
    const rateDisc = result.find((d) => d.field === "rate");
    expect(rateDisc).toBeDefined();
    expect(rateDisc?.severity).toBe("warning");
  });

  it("no rate discrepancy when within $10", () => {
    const propx = makeLoad({ rate: "125.50" });
    const lgx = makeLoad({ rate: "130.00" }); // $4.50 diff
    const result = compareLoadValues(propx, lgx);
    const rateDisc = result.find((d) => d.field === "rate");
    expect(rateDisc).toBeUndefined();
  });

  it("detects driver name mismatch as warning", () => {
    const propx = makeLoad({ driverName: "John Smith" });
    const lgx = makeLoad({ driverName: "Johnny Smith" });
    const result = compareLoadValues(propx, lgx);
    const disc = result.find((d) => d.field === "driverName");
    expect(disc).toBeDefined();
    expect(disc?.severity).toBe("warning");
    expect(disc?.propxValue).toBe("John Smith");
    expect(disc?.logistiqValue).toBe("Johnny Smith");
  });

  it("detects carrier name mismatch as warning", () => {
    const propx = makeLoad({ carrierName: "Swift Transport" });
    const lgx = makeLoad({ carrierName: "Swift Trucking" });
    const result = compareLoadValues(propx, lgx);
    const disc = result.find((d) => d.field === "carrierName");
    expect(disc).toBeDefined();
    expect(disc?.severity).toBe("warning");
  });

  it("detects ticket number mismatch as warning", () => {
    const propx = makeLoad({ ticketNo: "TKT-001" });
    const lgx = makeLoad({ ticketNo: "TKT-002" });
    const result = compareLoadValues(propx, lgx);
    const disc = result.find((d) => d.field === "ticketNo");
    expect(disc).toBeDefined();
    expect(disc?.severity).toBe("warning");
  });

  it("detects product description mismatch as info", () => {
    const propx = makeLoad({ productDescription: "Frac Sand 40/70" });
    const lgx = makeLoad({ productDescription: "Sand 40/70 Mesh" });
    const result = compareLoadValues(propx, lgx);
    const disc = result.find((d) => d.field === "productDescription");
    expect(disc).toBeDefined();
    expect(disc?.severity).toBe("info");
  });

  it("detects truck number mismatch as info", () => {
    const propx = makeLoad({ truckNo: "T100" });
    const lgx = makeLoad({ truckNo: "T101" });
    const result = compareLoadValues(propx, lgx);
    const disc = result.find((d) => d.field === "truckNo");
    expect(disc).toBeDefined();
    expect(disc?.severity).toBe("info");
  });

  it("ignores case differences in string comparisons", () => {
    const propx = makeLoad({ driverName: "JOHN SMITH" });
    const lgx = makeLoad({ driverName: "john smith" });
    const result = compareLoadValues(propx, lgx);
    const disc = result.find((d) => d.field === "driverName");
    expect(disc).toBeUndefined(); // same after normalization
  });

  it("handles null on both sides (no discrepancy)", () => {
    const propx = makeLoad({ weightTons: null });
    const lgx = makeLoad({ weightTons: null });
    const result = compareLoadValues(propx, lgx);
    const disc = result.find((d) => d.field === "weightTons");
    expect(disc).toBeUndefined();
  });

  it("reports info when one side has weight and other is null", () => {
    const propx = makeLoad({ weightTons: "21.0000" });
    const lgx = makeLoad({ weightTons: null });
    const result = compareLoadValues(propx, lgx);
    const disc = result.find((d) => d.field === "weightTons");
    expect(disc).toBeDefined();
    expect(disc?.severity).toBe("info");
  });

  it("handles null string fields (no discrepancy when both null)", () => {
    const propx = makeLoad({ driverName: null });
    const lgx = makeLoad({ driverName: null });
    const result = compareLoadValues(propx, lgx);
    const disc = result.find((d) => d.field === "driverName");
    expect(disc).toBeUndefined();
  });

  it("accumulates multiple discrepancies", () => {
    const propx = makeLoad({
      weightTons: "21.0000",
      rate: "125.50",
      driverName: "John",
    });
    const lgx = makeLoad({
      weightTons: "15.0000",
      rate: "300.00",
      driverName: "Jane",
    });
    const result = compareLoadValues(propx, lgx);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.some((d) => d.field === "weightTons")).toBe(true);
    expect(result.some((d) => d.field === "rate")).toBe(true);
    expect(result.some((d) => d.field === "driverName")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Exports exist
// ---------------------------------------------------------------------------

describe("Logistiq Sync — exports", () => {
  it("exports normalizeFromLogistiq function", () => {
    expect(typeof normalizeFromLogistiq).toBe("function");
  });

  it("exports parseDate function", () => {
    expect(typeof parseDate).toBe("function");
  });

  it("exports generateSourceId function", () => {
    expect(typeof generateSourceId).toBe("function");
  });

  it("exports compareLoadValues function", () => {
    expect(typeof compareLoadValues).toBe("function");
  });

  it("NormalizedLoad type is usable (compile-time check)", () => {
    const load: NormalizedLoad = normalizeFromLogistiq({
      load_no: "L-1",
      order_no: "O-1",
    });
    expect(load.source).toBe("logistiq");
  });

  it("Discrepancy type is usable", () => {
    const d: Discrepancy = {
      field: "weightTons",
      propxValue: 21,
      logistiqValue: 18,
      severity: "critical",
    };
    expect(d.severity).toBe("critical");
  });
});

// ---------------------------------------------------------------------------
// NormalizedLoad type structure
// ---------------------------------------------------------------------------

describe("Logistiq Sync — NormalizedLoad type contract", () => {
  it("has all expected fields in the interface", () => {
    const result = normalizeFromLogistiq({
      load_no: "L-1",
      order_no: "O-1",
    });

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
