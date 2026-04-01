import { createHash } from "node:crypto";
import { eq, and, inArray, sql } from "drizzle-orm";
import { loads, ingestionConflicts } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";
import type { LogistiqClient } from "./logistiq.service.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NormalizedLoad {
  loadNo: string;
  source: "logistiq";
  sourceId: string;
  driverName: string | null;
  driverId: string | null;
  truckNo: string | null;
  trailerNo: string | null;
  carrierName: string | null;
  customerName: string | null;
  productDescription: string | null;
  originName: string | null;
  destinationName: string | null;
  weightTons: string | null;
  netWeightTons: string | null;
  rate: string | null;
  mileage: string | null;
  bolNo: string | null;
  orderNo: string | null;
  referenceNo: string | null;
  ticketNo: string | null;
  status: string | null;
  deliveredOn: Date | null;
  rawData: Record<string, unknown>;
}

export interface SyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skippedFinalized: number;
  errors: Array<{ sourceId: string; error: string }>;
}

export interface Discrepancy {
  field: string;
  propxValue: unknown;
  logistiqValue: unknown;
  severity: "critical" | "warning" | "info";
}

export interface ConflictResult {
  conflictsFound: number;
  conflictsCreated: number;
}

/** Shape of a row selected from the loads table for comparison. */
interface LoadRow {
  id: number;
  loadNo: string;
  source: string;
  sourceId: string;
  orderNo: string | null;
  driverName: string | null;
  carrierName: string | null;
  productDescription: string | null;
  truckNo: string | null;
  trailerNo: string | null;
  ticketNo: string | null;
  weightTons: string | null;
  netWeightTons: string | null;
  rate: string | null;
  mileage: string | null;
  deliveredOn: Date | null;
}

// ---------------------------------------------------------------------------
// Column header alias map — 40+ variations from CSV/Excel/API
// Maps lowercased header name -> canonical internal field name
// ---------------------------------------------------------------------------

const COLUMN_ALIASES: Record<string, string> = {
  // Load identification
  "load #": "load_no",
  "load no": "load_no",
  load_no: "load_no",
  loadno: "load_no",
  "load number": "load_no",
  loadnumber: "load_no",
  "order #": "order_no",
  "order no": "order_no",
  order_no: "order_no",
  orderno: "order_no",
  "order number": "order_no",
  ordernumber: "order_no",

  // BOL
  bol: "bol_no",
  "bol #": "bol_no",
  "bol no": "bol_no",
  bol_no: "bol_no",
  "bill of lading": "bol_no",

  // Job/customer
  job: "job_name",
  "job name": "job_name",
  job_name: "job_name",
  jobname: "job_name",
  customer: "customer_name",
  "customer name": "customer_name",
  customer_name: "customer_name",
  customername: "customer_name",

  // Location
  destination: "destination_name",
  "destination name": "destination_name",
  destination_name: "destination_name",
  destinationname: "destination_name",
  dest: "destination_name",
  terminal: "origin_name",
  "terminal name": "origin_name",
  terminal_name: "origin_name",
  terminalname: "origin_name",
  origin: "origin_name",
  "origin name": "origin_name",
  origin_name: "origin_name",
  originname: "origin_name",

  // Carrier/Driver
  driver: "driver_name",
  "driver name": "driver_name",
  driver_name: "driver_name",
  drivername: "driver_name",
  driver_id: "driver_id",
  driverid: "driver_id",
  carrier: "carrier_name",
  "carrier name": "carrier_name",
  carrier_name: "carrier_name",
  carriername: "carrier_name",
  truck: "truck_no",
  "truck #": "truck_no",
  "truck no": "truck_no",
  truck_no: "truck_no",
  truckno: "truck_no",
  trailer: "trailer_no",
  "trailer #": "trailer_no",
  "trailer no": "trailer_no",
  trailer_no: "trailer_no",
  trailerno: "trailer_no",

  // Product
  product: "product_name",
  "product name": "product_name",
  product_name: "product_name",
  productname: "product_name",
  "product description": "product_name",
  product_description: "product_name",
  material: "product_name",

  // Dates
  delivered: "delivered_on",
  "delivered on": "delivered_on",
  delivered_on: "delivered_on",
  "delivery date": "delivered_on",
  deliverydate: "delivered_on",
  "date delivered": "delivered_on",

  // Weight (lbs)
  weight: "weight_lbs",
  "weight (lbs)": "weight_lbs",
  "weight lbs": "weight_lbs",
  weight_lbs: "weight_lbs",
  wt: "weight_lbs",
  "net weight": "net_weight_lbs",
  netweight: "net_weight_lbs",
  net_weight: "net_weight_lbs",
  "net wt": "net_weight_lbs",
  "gross weight": "gross_weight_lbs",
  grossweight: "gross_weight_lbs",
  gross_weight: "gross_weight_lbs",
  "gross wt": "gross_weight_lbs",
  "scale weight": "weight_lbs",
  scaleweight: "weight_lbs",

  // Weight (tons) — direct ton values from source
  tons: "weight_tons_direct",
  "net tons": "net_weight_tons_direct",
  net_tons: "net_weight_tons_direct",
  "gross tons": "gross_weight_tons_direct",
  gross_tons: "gross_weight_tons_direct",
  tonnage: "weight_tons_direct",
  "weight (tons)": "weight_tons_direct",
  tonsperload: "weight_tons_direct",

  // Distance
  mileage: "mileage",
  miles: "mileage",
  distance: "mileage",

  // Financial
  rate: "rate",
  amount: "amount",
  "total amount": "total_amount",
  total_amount: "total_amount",

  // Ticket
  ticket: "ticket_no",
  "ticket #": "ticket_no",
  "ticket no": "ticket_no",
  ticket_no: "ticket_no",
  ticketno: "ticket_no",
  "ticket number": "ticket_no",

  // Reference
  reference: "reference_no",
  "reference #": "reference_no",
  "reference no": "reference_no",
  reference_no: "reference_no",
  referenceno: "reference_no",

  // Status
  status: "status",
  "load status": "status",
  load_status: "status",
  order_status: "status",
  orderstatus: "status",

  // Logistiq-specific API fields (camelCase from API)
  orderid: "order_id",
  order_id: "order_id",
  completed_at: "completed_at",
  expected_pickup_time: "expected_pickup_time",
  sand_ticket_no: "ticket_no",
  uic_ticket_number: "ticket_no",
  carrierpricepertmile: "rate",
  carrierpricepermile: "rate",
  pricepermile: "rate",
  carriertotal: "amount",
  carrierid: "carrier_id",
  carrier_id: "carrier_id",
  destinationid: "destination_id",
  destination_id: "destination_id",
  terminalid: "origin_id",
  terminal_id: "origin_id",
};

// ---------------------------------------------------------------------------
// Finalized statuses — loads in these statuses should not be overwritten
// ---------------------------------------------------------------------------

const FINALIZED_STATUSES = new Set([
  "Delivered",
  "Canceled",
  "Cancelled",
  "Transfered",
  "Transferred",
  "completed",
]);

// ---------------------------------------------------------------------------
// Dedup thresholds
// ---------------------------------------------------------------------------

const WEIGHT_CRITICAL_PCT = 0.1; // >10% difference
const WEIGHT_WARNING_PCT = 0.05; // 5-10% difference
const AMOUNT_CRITICAL_ABS = 100; // >$100 difference
const AMOUNT_WARNING_ABS = 10; // >$10 difference

// ---------------------------------------------------------------------------
// Date parsing — handles ISO 8601 and MM/DD/YYYY with 2-digit year
// ---------------------------------------------------------------------------

/**
 * Parse a date string into a Date object.
 *
 * Handles:
 * - ISO 8601 (2026-03-15T14:30:00Z)
 * - MM/DD/YYYY or M/D/YYYY
 * - MM-DD-YYYY or M-D-YYYY
 * - 2-digit year expansion: 00-29 = 2000s, 30-99 = 1900s
 *
 * Returns null for invalid or empty input.
 */
export function parseDate(value: string | null): Date | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === "" || str === "0000-00-00 00:00:00") return null;

  // Try ISO 8601 first
  const iso = new Date(str);
  if (!isNaN(iso.getTime())) {
    // Guard against the Date constructor interpreting MM/DD/YYYY as valid ISO
    // If the string looks like a US date, fall through to explicit parsing
    if (/^\d{4}/.test(str)) {
      return iso;
    }
  }

  // MM/DD/YYYY or M/D/YYYY (with / or - separator)
  const usMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (usMatch) {
    let year = usMatch[3];
    if (year.length === 2) {
      const yearNum = parseInt(year, 10);
      year = yearNum <= 29 ? `20${year}` : `19${year}`;
    }
    const month = usMatch[1].padStart(2, "0");
    const day = usMatch[2].padStart(2, "0");
    const d = new Date(`${year}-${month}-${day}T00:00:00`);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Source ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a synthetic source_id for a Logistiq record.
 *
 * Format: `lgx-{load_no}-{order_no}`
 * Fallback: `lgx-unknown-{sha1(JSON.stringify(raw)).slice(0,12)}`
 */
export function generateSourceId(raw: Record<string, unknown>): string {
  const loadNo = resolveField(
    raw,
    "load_no",
    "loadNo",
    "load_number",
    "Load #",
    "Load No",
  );
  const orderNo = resolveField(
    raw,
    "order_no",
    "orderNo",
    "order_number",
    "Order #",
    "Order No",
    "order_id",
    "orderId",
  );

  if (loadNo != null && orderNo != null) {
    return `lgx-${loadNo}-${orderNo}`;
  }

  // Fallback: hash the entire raw record
  const hash = createHash("sha1")
    .update(JSON.stringify(raw))
    .digest("hex")
    .slice(0, 12);
  return `lgx-unknown-${hash}`;
}

/**
 * Resolve the first non-null, non-empty value from a set of field names.
 */
function resolveField(
  obj: Record<string, unknown>,
  ...fieldNames: string[]
): string | null {
  for (const field of fieldNames) {
    const val = obj[field];
    if (val !== undefined && val !== null && val !== "") {
      return String(val);
    }
  }
  return null;
}

/**
 * Resolve a field by checking raw keys against the COLUMN_ALIASES map,
 * plus direct field names. Returns the first non-empty value for the
 * target internal field name.
 */
function resolveByAlias(
  raw: Record<string, unknown>,
  targetField: string,
): string | null {
  // Direct key match first
  const direct = raw[targetField];
  if (direct !== undefined && direct !== null && direct !== "") {
    return String(direct);
  }

  // Check all raw keys against alias map
  for (const [key, value] of Object.entries(raw)) {
    if (COLUMN_ALIASES[key.toLowerCase()] === targetField) {
      const val = raw[key];
      if (val !== undefined && val !== null && val !== "") {
        return String(val);
      }
    }
  }
  return null;
}

/**
 * Resolve a numeric field by alias lookup.
 * Returns null for non-numeric or negative values.
 */
function resolveNumericByAlias(
  raw: Record<string, unknown>,
  targetField: string,
): number | null {
  const str = resolveByAlias(raw, targetField);
  if (str === null) return null;
  // Clean currency/comma formatting
  const cleaned = str.replace(/[$,\s]/g, "");
  const num = Number(cleaned);
  return !isNaN(num) && num >= 0 ? num : null;
}

/**
 * Convert lbs to tons (short tons), returning a string with 4 decimal places
 * for Drizzle numeric column compatibility.
 */
function lbsToTons(lbs: number | null): string | null {
  if (lbs === null || lbs === undefined) return null;
  return (lbs / 2000).toFixed(4);
}

/**
 * Convert a numeric value to a string representation for Drizzle numeric columns.
 */
function numericToString(
  val: number | null,
  decimalPlaces: number,
): string | null {
  if (val === null || val === undefined) return null;
  return val.toFixed(decimalPlaces);
}

// ---------------------------------------------------------------------------
// Normalizer — raw Logistiq record -> NormalizedLoad
// ---------------------------------------------------------------------------

/**
 * Normalize a raw Logistiq record (from API or CSV/Excel) into the shape
 * expected by the `loads` table. Handles 40+ column header variations,
 * weight resolution (direct tons > lbs / 2000), and date parsing.
 *
 * Accepts both API orders (camelCase) and CSV parsed rows (varied headers).
 */
export function normalizeFromLogistiq(
  raw: Record<string, unknown>,
): NormalizedLoad {
  // Weight resolution priority:
  // 1. Direct ton fields (tons, net_tons, tonnage, tonsPerLoad, weight_tons_direct)
  // 2. Lbs fields / 2000
  const directTons = resolveNumericByAlias(raw, "weight_tons_direct");
  const directNetTons = resolveNumericByAlias(raw, "net_weight_tons_direct");
  const weightLbs = resolveNumericByAlias(raw, "weight_lbs");
  const netWeightLbs = resolveNumericByAlias(raw, "net_weight_lbs");

  // Also check Logistiq API-specific field: tonsPerLoad (not in alias map but common)
  const tonsPerLoad =
    raw.tonsPerLoad !== undefined && raw.tonsPerLoad !== null
      ? Number(raw.tonsPerLoad)
      : null;
  const validTonsPerLoad =
    tonsPerLoad !== null && !isNaN(tonsPerLoad) && tonsPerLoad >= 0
      ? tonsPerLoad
      : null;

  const weightTons =
    directTons !== null
      ? numericToString(directTons, 4)
      : validTonsPerLoad !== null
        ? numericToString(validTonsPerLoad, 4)
        : lbsToTons(weightLbs);

  const netWeightTons =
    directNetTons !== null
      ? numericToString(directNetTons, 4)
      : lbsToTons(netWeightLbs);

  // Rate
  const rateVal = resolveNumericByAlias(raw, "rate");

  // Mileage
  const mileageVal = resolveNumericByAlias(raw, "mileage");

  // Date resolution: completed_at > delivered_on > expected_pickup_time
  let deliveredOn: Date | null = null;
  const completedAt = raw.completed_at ?? raw.completedAt;
  const deliveredOnRaw = resolveByAlias(raw, "delivered_on");
  const expectedPickup = raw.expected_pickup_time ?? raw.expectedPickupTime;

  if (completedAt) {
    deliveredOn = parseDate(String(completedAt));
  }
  if (!deliveredOn && deliveredOnRaw) {
    deliveredOn = parseDate(deliveredOnRaw);
  }
  if (
    !deliveredOn &&
    expectedPickup &&
    expectedPickup !== "0000-00-00 00:00:00"
  ) {
    deliveredOn = parseDate(String(expectedPickup));
  }

  // Load/order numbers
  const loadNo =
    resolveByAlias(raw, "load_no") ??
    resolveField(raw, "load_no", "loadNo", "load_number") ??
    "";
  const orderNo =
    resolveByAlias(raw, "order_no") ??
    resolveField(
      raw,
      "order_no",
      "orderNo",
      "order_number",
      "order_id",
      "orderId",
    ) ??
    null;

  return {
    loadNo,
    source: "logistiq",
    sourceId: generateSourceId(raw),
    driverName:
      resolveByAlias(raw, "driver_name") ??
      resolveField(raw, "driver_name", "driverName") ??
      null,
    driverId:
      resolveByAlias(raw, "driver_id") ??
      resolveField(raw, "driver_id", "driverId") ??
      null,
    truckNo:
      resolveByAlias(raw, "truck_no") ??
      resolveField(raw, "truck_no", "truckNo") ??
      null,
    trailerNo:
      resolveByAlias(raw, "trailer_no") ??
      resolveField(raw, "trailer_no", "trailerNo") ??
      null,
    carrierName:
      resolveByAlias(raw, "carrier_name") ??
      resolveField(raw, "carrier_name", "carrierName") ??
      null,
    customerName:
      resolveByAlias(raw, "customer_name") ??
      resolveField(raw, "customer_name", "customerName") ??
      null,
    productDescription:
      resolveByAlias(raw, "product_name") ??
      resolveField(raw, "product_name", "productName", "product_description") ??
      null,
    originName:
      resolveByAlias(raw, "origin_name") ??
      resolveField(
        raw,
        "terminal_name",
        "terminalName",
        "origin_name",
        "originName",
      ) ??
      null,
    destinationName:
      resolveByAlias(raw, "destination_name") ??
      resolveField(raw, "destination_name", "destinationName") ??
      null,
    weightTons,
    netWeightTons,
    rate: numericToString(rateVal, 2),
    mileage: numericToString(mileageVal, 2),
    bolNo:
      resolveByAlias(raw, "bol_no") ??
      resolveField(raw, "bol_no", "bolNo") ??
      null,
    orderNo,
    referenceNo:
      resolveByAlias(raw, "reference_no") ??
      resolveField(raw, "reference_no", "referenceNo") ??
      null,
    ticketNo:
      resolveByAlias(raw, "ticket_no") ??
      resolveField(
        raw,
        "ticket_no",
        "ticketNo",
        "sand_ticket_no",
        "uic_ticket_number",
      ) ??
      null,
    status:
      resolveByAlias(raw, "status") ??
      resolveField(
        raw,
        "order_status",
        "orderStatus",
        "status",
        "load_status",
      ) ??
      null,
    deliveredOn,
    rawData: raw,
  };
}

// ---------------------------------------------------------------------------
// Sync pipeline — fetch from LogistiqClient, normalize, upsert
// ---------------------------------------------------------------------------

/**
 * Fetch loads from Logistiq API for a date range, normalize, and upsert
 * into the `loads` table.
 *
 * - Skips finalized loads that already exist in DB
 * - Respects the (source, source_id) unique constraint via onConflictDoUpdate
 */
export async function syncLogistiqLoads(
  db: Database,
  client: LogistiqClient,
  dateRange: { from: Date; to: Date },
): Promise<SyncResult> {
  const result: SyncResult = {
    fetched: 0,
    inserted: 0,
    updated: 0,
    skippedFinalized: 0,
    errors: [],
  };

  // 1. Fetch raw orders from Logistiq
  const rawOrders = await client.searchOrders(dateRange.from, dateRange.to);
  result.fetched = rawOrders.length;

  if (rawOrders.length === 0) return result;

  // 2. Normalize all orders
  const normalized = rawOrders.map((raw) =>
    normalizeFromLogistiq(raw as unknown as Record<string, unknown>),
  );

  // 3. Look up existing finalized loads to skip
  const sourceIds = normalized.map((l) => l.sourceId);
  const existingRows = await db
    .select({ sourceId: loads.sourceId, status: loads.status })
    .from(loads)
    .where(
      and(eq(loads.source, "logistiq"), inArray(loads.sourceId, sourceIds)),
    );

  const finalizedSet = new Set(
    existingRows
      .filter((row) => FINALIZED_STATUSES.has(row.status ?? ""))
      .map((row) => row.sourceId),
  );

  const existingNonFinalizedIds = new Set(
    existingRows
      .filter((row) => !FINALIZED_STATUSES.has(row.status ?? ""))
      .map((row) => row.sourceId),
  );

  // 4. Upsert each load (skip finalized)
  for (const load of normalized) {
    if (finalizedSet.has(load.sourceId)) {
      result.skippedFinalized++;
      continue;
    }

    try {
      await db
        .insert(loads)
        .values({
          loadNo: load.loadNo,
          source: load.source,
          sourceId: load.sourceId,
          driverName: load.driverName,
          driverId: load.driverId,
          truckNo: load.truckNo,
          trailerNo: load.trailerNo,
          carrierName: load.carrierName,
          customerName: load.customerName,
          productDescription: load.productDescription,
          originName: load.originName,
          destinationName: load.destinationName,
          weightTons: load.weightTons,
          netWeightTons: load.netWeightTons,
          rate: load.rate,
          mileage: load.mileage,
          bolNo: load.bolNo,
          orderNo: load.orderNo,
          referenceNo: load.referenceNo,
          ticketNo: load.ticketNo,
          status: load.status,
          deliveredOn: load.deliveredOn,
          rawData: load.rawData,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [loads.source, loads.sourceId],
          set: {
            loadNo: load.loadNo,
            driverName: load.driverName,
            driverId: load.driverId,
            truckNo: load.truckNo,
            trailerNo: load.trailerNo,
            carrierName: load.carrierName,
            customerName: load.customerName,
            productDescription: load.productDescription,
            originName: load.originName,
            destinationName: load.destinationName,
            weightTons: load.weightTons,
            netWeightTons: load.netWeightTons,
            rate: load.rate,
            mileage: load.mileage,
            bolNo: load.bolNo,
            orderNo: load.orderNo,
            referenceNo: load.referenceNo,
            ticketNo: load.ticketNo,
            status: load.status,
            deliveredOn: load.deliveredOn,
            rawData: load.rawData,
            updatedAt: new Date(),
          },
        });

      if (existingNonFinalizedIds.has(load.sourceId)) {
        result.updated++;
      } else {
        result.inserted++;
      }
    } catch (err: unknown) {
      result.errors.push({
        sourceId: load.sourceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cross-source dedup — compare PropX vs Logistiq for the same physical load
// ---------------------------------------------------------------------------

/**
 * Compare two load records field-by-field. Returns an array of discrepancies
 * with severity levels.
 *
 * Weight: >10% = critical, 5-10% = warning
 * Amount/rate: >$100 = critical, >$10 = warning
 * String fields: mismatch = warning or info
 */
export function compareLoadValues(
  propxLoad: LoadRow,
  logistiqLoad: LoadRow,
): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];

  // Weight comparison
  compareNumeric(
    discrepancies,
    "weightTons",
    toNum(propxLoad.weightTons),
    toNum(logistiqLoad.weightTons),
    "percent",
    WEIGHT_CRITICAL_PCT,
    WEIGHT_WARNING_PCT,
  );

  compareNumeric(
    discrepancies,
    "netWeightTons",
    toNum(propxLoad.netWeightTons),
    toNum(logistiqLoad.netWeightTons),
    "percent",
    WEIGHT_CRITICAL_PCT,
    WEIGHT_WARNING_PCT,
  );

  // Rate/amount comparison
  compareNumeric(
    discrepancies,
    "rate",
    toNum(propxLoad.rate),
    toNum(logistiqLoad.rate),
    "absolute",
    AMOUNT_CRITICAL_ABS,
    AMOUNT_WARNING_ABS,
  );

  // String comparisons (warning severity)
  compareStrings(
    discrepancies,
    "driverName",
    propxLoad.driverName,
    logistiqLoad.driverName,
    "warning",
  );
  compareStrings(
    discrepancies,
    "carrierName",
    propxLoad.carrierName,
    logistiqLoad.carrierName,
    "warning",
  );
  compareStrings(
    discrepancies,
    "ticketNo",
    propxLoad.ticketNo,
    logistiqLoad.ticketNo,
    "warning",
  );

  // String comparisons (info severity)
  compareStrings(
    discrepancies,
    "productDescription",
    propxLoad.productDescription,
    logistiqLoad.productDescription,
    "info",
  );
  compareStrings(
    discrepancies,
    "truckNo",
    propxLoad.truckNo,
    logistiqLoad.truckNo,
    "info",
  );
  compareStrings(
    discrepancies,
    "trailerNo",
    propxLoad.trailerNo,
    logistiqLoad.trailerNo,
    "info",
  );

  return discrepancies;
}

/**
 * Detect cross-source conflicts for a set of newly upserted Logistiq load IDs.
 *
 * For each new Logistiq load, find a matching PropX load by:
 * - loadNo + orderNo + deliveredOn (1-day window)
 *
 * If a match is found, compare field values and insert discrepancies into
 * the ingestionConflicts table.
 */
export async function detectCrossSourceConflicts(
  db: Database,
  newLoadIds: number[],
): Promise<ConflictResult> {
  const result: ConflictResult = {
    conflictsFound: 0,
    conflictsCreated: 0,
  };

  if (newLoadIds.length === 0) return result;

  // Fetch the new Logistiq loads
  const logistiqLoads = await db
    .select()
    .from(loads)
    .where(and(eq(loads.source, "logistiq"), inArray(loads.id, newLoadIds)));

  for (const lgxLoad of logistiqLoads) {
    if (!lgxLoad.loadNo || !lgxLoad.deliveredOn) continue;

    // Build a 1-day window around the delivery date
    const deliveredDate = new Date(lgxLoad.deliveredOn);
    const startOfDay = new Date(deliveredDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(deliveredDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Find PropX match
    const conditions = [
      eq(loads.source, "propx"),
      eq(loads.loadNo, lgxLoad.loadNo),
      sql`${loads.deliveredOn} >= ${startOfDay}`,
      sql`${loads.deliveredOn} <= ${endOfDay}`,
    ];

    if (lgxLoad.orderNo) {
      conditions.push(eq(loads.orderNo, lgxLoad.orderNo));
    }

    const [propxMatch] = await db
      .select()
      .from(loads)
      .where(and(...conditions))
      .limit(1);

    if (!propxMatch) continue;

    // Compare values
    const discrepancies = compareLoadValues(
      propxMatch as LoadRow,
      lgxLoad as LoadRow,
    );

    if (discrepancies.length === 0) continue;

    result.conflictsFound++;

    // Determine max severity
    const maxSeverity = getMaxSeverity(discrepancies);
    const matchKey = [
      lgxLoad.loadNo,
      lgxLoad.orderNo ?? "",
      lgxLoad.deliveredOn?.toISOString().slice(0, 10) ?? "",
    ].join("|");

    // Insert conflict record
    try {
      await db.insert(ingestionConflicts).values({
        propxLoadId: propxMatch.id,
        logistiqLoadId: lgxLoad.id,
        matchKey,
        discrepancies: discrepancies as unknown as Record<string, unknown>,
        maxSeverity,
      });
      result.conflictsCreated++;
    } catch {
      // Ignore duplicate conflict records
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------

function toNum(val: string | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function compareNumeric(
  discrepancies: Discrepancy[],
  field: string,
  propxVal: number | null,
  lgxVal: number | null,
  mode: "percent" | "absolute",
  criticalThreshold: number,
  warningThreshold: number,
): void {
  if (propxVal === null && lgxVal === null) return;

  if (propxVal === null || lgxVal === null) {
    // One side has a value, the other doesn't
    if (propxVal !== null || lgxVal !== null) {
      discrepancies.push({
        field,
        propxValue: propxVal,
        logistiqValue: lgxVal,
        severity: "info",
      });
    }
    return;
  }

  const diff = Math.abs(propxVal - lgxVal);

  if (mode === "percent") {
    const denominator = Math.max(propxVal, lgxVal);
    if (denominator === 0) return; // both zero
    const pctDiff = diff / denominator;

    if (pctDiff > criticalThreshold) {
      discrepancies.push({
        field,
        propxValue: propxVal,
        logistiqValue: lgxVal,
        severity: "critical",
      });
    } else if (pctDiff > warningThreshold) {
      discrepancies.push({
        field,
        propxValue: propxVal,
        logistiqValue: lgxVal,
        severity: "warning",
      });
    }
  } else {
    // absolute mode
    if (diff > criticalThreshold) {
      discrepancies.push({
        field,
        propxValue: propxVal,
        logistiqValue: lgxVal,
        severity: "critical",
      });
    } else if (diff > warningThreshold) {
      discrepancies.push({
        field,
        propxValue: propxVal,
        logistiqValue: lgxVal,
        severity: "warning",
      });
    }
  }
}

function compareStrings(
  discrepancies: Discrepancy[],
  field: string,
  propxVal: string | null,
  lgxVal: string | null,
  severity: "critical" | "warning" | "info",
): void {
  if (!propxVal && !lgxVal) return;

  const pNorm = (propxVal ?? "").trim().toLowerCase();
  const lNorm = (lgxVal ?? "").trim().toLowerCase();

  if (pNorm && lNorm && pNorm !== lNorm) {
    discrepancies.push({
      field,
      propxValue: propxVal,
      logistiqValue: lgxVal,
      severity,
    });
  }
}

function getMaxSeverity(
  discrepancies: Discrepancy[],
): "critical" | "warning" | "info" {
  const order = { critical: 3, warning: 2, info: 1 };
  let max: "critical" | "warning" | "info" = "info";
  for (const d of discrepancies) {
    if (order[d.severity] > order[max]) {
      max = d.severity;
    }
  }
  return max;
}
