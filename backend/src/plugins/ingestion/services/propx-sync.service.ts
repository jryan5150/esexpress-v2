import { eq, and, inArray } from "drizzle-orm";
import { loads } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";
import type { PropxClient } from "./propx.service.js";
import { classifyHistoricalLoad } from "../../dispatch/lib/historical-classifier.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NormalizedLoad {
  loadNo: string;
  source: "propx";
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
  weightLbs: string | null;
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
  driftWarnings: string[];
}

// ---------------------------------------------------------------------------
// Weight field aliases — ordered by preference (most specific first)
// ---------------------------------------------------------------------------

const WEIGHT_ALIASES = [
  "weight",
  "net_weight",
  "net_wt",
  "NetWeight",
  "netWeight",
  "gross_weight",
  "gross_wt",
  "GrossWeight",
  "grossWeight",
  "Weight",
  "Wt",
  "wt",
  "scale_weight",
  "ScaleWeight",
  "scaleWeight",
  "ticket_weight",
  "TicketWeight",
  "ticketWeight",
  "billing_weight",
  "BillingWeight",
  "billingWeight",
] as const;

const NET_WEIGHT_ALIASES = [
  "net_weight",
  "net_wt",
  "NetWeight",
  "netWeight",
  "Net_Weight",
  "net",
] as const;

// ---------------------------------------------------------------------------
// Mileage field aliases
// ---------------------------------------------------------------------------

const MILEAGE_ALIASES = [
  "mileage",
  "miles",
  "Mileage",
  "Miles",
  "distance",
  "Distance",
  "total_miles",
  "TotalMiles",
  "totalMiles",
  "loaded_miles",
  "empty_miles",
  "deadhead_miles",
  "one_way_miles",
  "round_trip_miles",
] as const;

// ---------------------------------------------------------------------------
// Nested object paths to check when a direct field isn't found
// ---------------------------------------------------------------------------

const NESTED_PATHS = [
  "ticket",
  "scale",
  "billing",
  "details",
  "weights",
  "distances",
] as const;

// ---------------------------------------------------------------------------
// Finalized statuses — loads in these statuses should not be overwritten
// ---------------------------------------------------------------------------

const FINALIZED_STATUSES = new Set([
  "Delivered",
  "Canceled",
  "Cancelled",
  "Transfered",
  "Transferred",
]);

// ---------------------------------------------------------------------------
// Known PropX field names for schema drift detection (lowercase)
// Ported from v1 PropXBillingLoad.js — comprehensive set
// ---------------------------------------------------------------------------

const KNOWN_PROPX_FIELDS = new Set([
  // Identity
  "id",
  "propx_load_id",
  "job_id",
  "load_no",
  "loadno",
  "load_number",
  "order_no",
  "orderno",
  "order_number",
  // Job/customer
  "job_name",
  "customer_name",
  "region_name",
  "district_name",
  "crew_name",
  // Location
  "destination_name",
  "destination_id",
  "terminal_name",
  "terminalname",
  "terminal_id",
  "origin_name",
  "originname",
  "origin_id",
  // Carrier/driver
  "driver_id",
  "driver_name",
  "drivername",
  "carrier_id",
  "carrier_name",
  "carriername",
  "truck_no",
  "truckno",
  "truck_number",
  "trailer_no",
  "trailerno",
  "trailer_number",
  // Product
  "product_id",
  "product_name",
  "productname",
  "product_code",
  "productcode",
  "product_description",
  "quantity",
  "qty",
  "unit",
  "uom",
  // Dates
  "assigned_on",
  "accepted_on",
  "terminal_on",
  "transit_on",
  "destination_on",
  "delivered_on",
  // Status
  "load_status",
  "status",
  "loadstatus",
  // Weight (lbs)
  "weight",
  "net_weight",
  "gross_weight",
  "tare_weight",
  "net_wt",
  "gross_wt",
  "tare_wt",
  "wt",
  "load_weight",
  "qty_weight",
  "quantity_weight",
  "scale_weight",
  "scale_wt",
  "delivered_weight",
  "pickup_weight",
  "billed_weight",
  "actual_weight",
  "netweight",
  "grossweight",
  "tareweight",
  "billing_weight",
  "billingweight",
  "ticket_weight",
  "ticketweight",
  "scaleweight",
  // Weight (tons)
  "net_tons",
  "gross_tons",
  "tons",
  "tonnage",
  "weight_tons",
  // Distance
  "approved_mileage",
  "mileage",
  "distance",
  "miles",
  "mi",
  "total_miles",
  "trip_miles",
  "loaded_miles",
  "empty_miles",
  "deadhead_miles",
  "trip_distance",
  "total_distance",
  "one_way_miles",
  "round_trip_miles",
  "route_miles",
  // Financial
  "rate",
  "rate_type",
  "ratetype",
  "amount",
  "total_amount",
  "totalamount",
  "total_hauling",
  "totalhauling",
  "fuel_surcharge",
  "fuelsurcharge",
  "customer_rate",
  "total_revenue",
  "total_charge",
  // Ticket/BOL/PO
  "ticket_no",
  "ticketno",
  "ticket_number",
  "ticket_image_url",
  "bol_no",
  "bol_url",
  "download_bol_url",
  "carrier_po",
  "carrierpo",
  "carrier_po",
  "po",
  "purchase_order",
  "po_number",
  "po_no",
  "po_name",
  "reference_no",
  "referenceno",
  "reference_number",
  // Attachments
  "attachments",
  "documents",
  "files",
  // Nested objects
  "ticket",
  "scale",
  "billing",
  "details",
  "weights",
  "distances",
  "raw_data",
  // Pagination/meta
  "pagination",
  "data",
  "meta",
  "total",
  "per_page",
  "page_no",
  // Schema drift fields (promoted in v1)
  "load_status_id",
  "ticket_is_missing",
  "ticket_manual_status_name",
  "ticket_manual_status_time",
  "driver_ticket_auto_status_name",
  "driver_ticket_auto_status_by",
  "driver_ticket_auto_status_time",
  "load_last_updated_date",
  "hauling_method",
  "product_unit",
  "customer_id",
  "old_load_uuid",
  "new_load_uuid",
  "stage_no",
  "carrier_address",
  "added_by",
  "last_modified_by",
  "added_date",
  "last_modified_date",
  "load_transfer_to_jobid",
  "load_transfer_from_jobid",
  "new_approved_mileage",
  "approved_unload_time",
  "job_order_no",
  "destination_countryid",
  "ordered_on",
  "assigned_by",
  "accepted_by",
  "declined_on",
  "declined_by",
  "terminal_comment",
  "terminal_by",
  "transit_comment",
  "transit_by",
  "destination_comment",
  "destination_by",
  "delivered_comment",
  "delivered_by",
  "transfer_on",
  "transfer_comment",
  "transfer_by",
  "cancel_on",
  "cancel_comment",
  "cancel_by",
  "load_boxes",
  "total_boxes",
  "silo_number",
  "appt_time",
  "at_terminal_offline",
  "at_transit_offline",
  "at_destination_offline",
  "at_delivered_offline",
  "demurrage_at_loader_hour",
  "demurrage_at_loader_minutes",
  "demurrage_at_loader",
  "loader_override_reason",
  "demurrage_at_destination_hour",
  "demurrage_at_destination_minutes",
  "demurrage_at_destination",
  "destination_override_reason",
  "dispatcher_notes",
  "fuel_surcharge_cost",
  "deadhead_cost",
  "override_cost",
  "override_reason",
  "rate_override_reason",
  "purchase_order_id",
  "po_id",
  "terminal_total_time",
  "terminal_off_time",
  "transit_total_time",
  "transit_off_time",
  "destination_total_time",
  "destination_off_time",
  // PropX added 2026-04 — staging review metadata. Not yet mapped to first-
  // class columns; full payload stays in raw_data jsonb. Listed here so the
  // schema-drift detector stops alerting until/unless we wire dedicated
  // columns. See docs/2026-04-14-feedback-ledger.md (O-17).
  "staging_comment",
  "staging_by",
  "staging_on",
]);

// ---------------------------------------------------------------------------
// Pure functions — extractNumeric, lbsToTons, extractString
// ---------------------------------------------------------------------------

/**
 * Extract a numeric value from an object, checking multiple field name aliases.
 * Checks direct properties first, then nested sub-objects (ticket, scale, etc.).
 * Returns null if no alias yields a valid non-negative number.
 */
export function extractNumeric(
  obj: Record<string, unknown>,
  ...fieldNames: string[]
): number | null {
  if (!obj) return null;

  for (const field of fieldNames) {
    // Check direct field
    const directVal = obj[field];
    if (directVal !== undefined && directVal !== null) {
      const num = Number(directVal);
      if (!isNaN(num) && num >= 0) return num;
    }

    // Check nested sub-objects
    for (const path of NESTED_PATHS) {
      const nested = obj[path];
      if (nested && typeof nested === "object" && nested !== null) {
        const nestedVal = (nested as Record<string, unknown>)[field];
        if (nestedVal !== undefined && nestedVal !== null) {
          const num = Number(nestedVal);
          if (!isNaN(num) && num >= 0) return num;
        }
      }
    }
  }

  return null;
}

/**
 * Extract a string value from an object, checking multiple field name aliases.
 * Returns the first non-empty string found.
 */
function extractString(
  obj: Record<string, unknown>,
  ...fieldNames: string[]
): string | null {
  if (!obj) return null;

  for (const field of fieldNames) {
    const val = obj[field];
    if (val !== undefined && val !== null && val !== "") {
      return String(val);
    }
  }

  return null;
}

/**
 * Convert lbs to tons (short tons), returning a string with 4 decimal places
 * for Drizzle numeric column compatibility.
 */
export function lbsToTons(lbs: number | null): string | null {
  if (lbs === null || lbs === undefined) return null;
  return (lbs / 2000).toFixed(4);
}

/**
 * Convert a numeric value to a string representation for Drizzle numeric columns.
 * Returns null if the input is null.
 */
function numericToString(
  val: number | null,
  decimalPlaces: number,
): string | null {
  if (val === null || val === undefined) return null;
  return val.toFixed(decimalPlaces);
}

// ---------------------------------------------------------------------------
// Schema drift detection
// ---------------------------------------------------------------------------

/**
 * Compare incoming field names against the known PropX field set.
 * Returns an array of unknown field names for logging.
 */
export function detectSchemaDrift(raw: Record<string, unknown>): string[] {
  const incoming = Object.keys(raw);
  return incoming.filter((f) => !KNOWN_PROPX_FIELDS.has(f.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Normalizer — raw PropX → NormalizedLoad
// ---------------------------------------------------------------------------

/**
 * Normalize a raw PropX load record into the shape expected by the `loads` table.
 * Handles field alias resolution, weight conversion (lbs → tons), and date parsing.
 */
export function normalizeFromPropx(
  raw: Record<string, unknown>,
): NormalizedLoad {
  // Weight extraction (lbs) then conversion to tons
  const weightLbs = extractNumeric(raw, ...WEIGHT_ALIASES);
  const netWeightLbs = extractNumeric(raw, ...NET_WEIGHT_ALIASES);

  // Mileage extraction
  const mileageVal = extractNumeric(raw, ...MILEAGE_ALIASES);

  // Rate extraction
  const rateVal = extractNumeric(raw, "rate");

  // Date parsing
  const deliveredOnRaw = raw.delivered_on;
  let deliveredOn: Date | null = null;
  if (deliveredOnRaw) {
    const parsed = new Date(deliveredOnRaw as string);
    if (!isNaN(parsed.getTime())) {
      deliveredOn = parsed;
    }
  }

  return {
    loadNo: String(
      raw.load_no ??
        raw.loadNo ??
        raw.load_number ??
        raw.propx_load_id ??
        raw.id ??
        "",
    ),
    source: "propx",
    sourceId: String(raw.propx_load_id ?? raw.id ?? ""),
    driverName: extractString(raw, "driver_name", "driverName") ?? null,
    driverId: extractString(raw, "driver_id") ?? null,
    truckNo: extractString(raw, "truck_no", "truckNo", "truck_number") ?? null,
    trailerNo:
      extractString(raw, "trailer_no", "trailerNo", "trailer_number") ?? null,
    carrierName: extractString(raw, "carrier_name", "carrierName") ?? null,
    customerName: extractString(raw, "customer_name") ?? null,
    productDescription:
      extractString(
        raw,
        "product_name",
        "productName",
        "product_description",
      ) ?? null,
    originName:
      extractString(
        raw,
        "terminal_name",
        "terminalName",
        "origin_name",
        "originName",
      ) ?? null,
    destinationName: extractString(raw, "destination_name") ?? null,
    weightTons: lbsToTons(weightLbs),
    netWeightTons: lbsToTons(netWeightLbs),
    weightLbs: numericToString(weightLbs, 2),
    rate: numericToString(rateVal, 2),
    mileage: numericToString(mileageVal, 2),
    bolNo: extractString(raw, "bol_no") ?? null,
    orderNo: extractString(raw, "order_no", "orderNo", "order_number") ?? null,
    referenceNo:
      extractString(raw, "reference_no", "referenceNo", "reference_number") ??
      null,
    ticketNo:
      extractString(raw, "ticket_no", "ticketNo", "ticket_number") ?? null,
    status: extractString(raw, "load_status", "status", "loadStatus") ?? null,
    deliveredOn,
    rawData: raw,
  };
}

// ---------------------------------------------------------------------------
// Sync pipeline — fetch, normalize, upsert
// ---------------------------------------------------------------------------

/**
 * Main sync function: fetch loads from PropX API for a date range, normalize,
 * and upsert into the `loads` table.
 *
 * - Skips finalized loads that already exist in DB (prevents overwriting completed records)
 * - Respects the (source, source_id) unique constraint via onConflictDoUpdate
 * - Detects schema drift from PropX API changes
 */
export async function syncPropxLoads(
  db: Database,
  propxClient: PropxClient,
  dateRange: { from: Date; to: Date },
): Promise<SyncResult> {
  const result: SyncResult = {
    fetched: 0,
    inserted: 0,
    updated: 0,
    skippedFinalized: 0,
    errors: [],
    driftWarnings: [],
  };

  // 1. Fetch raw loads from PropX
  const rawLoads = await propxClient.getCompanyLoadsByDates(
    dateRange.from,
    dateRange.to,
  );
  result.fetched = rawLoads.length;

  if (rawLoads.length === 0) return result;

  // 2. Schema drift detection on first load (sample)
  const driftFields = detectSchemaDrift(
    rawLoads[0] as unknown as Record<string, unknown>,
  );
  if (driftFields.length > 0) {
    const warning = `SCHEMA DRIFT: ${driftFields.length} unknown fields: ${driftFields.join(", ")}`;
    result.driftWarnings.push(warning);
    console.warn(`[PropX Sync] ${warning}`);
  }

  // 3. Normalize all loads
  const normalized = rawLoads.map((raw) =>
    normalizeFromPropx(raw as unknown as Record<string, unknown>),
  );

  // 4. Look up existing finalized loads to skip
  const sourceIds = normalized.map((l) => l.sourceId);
  const existingFinalized = await db
    .select({ sourceId: loads.sourceId, status: loads.status })
    .from(loads)
    .where(and(eq(loads.source, "propx"), inArray(loads.sourceId, sourceIds)));

  const finalizedSet = new Set(
    existingFinalized
      .filter((row) => FINALIZED_STATUSES.has(row.status ?? ""))
      .map((row) => row.sourceId),
  );

  // 5. Upsert each load (skip finalized)
  for (const load of normalized) {
    if (finalizedSet.has(load.sourceId)) {
      result.skippedFinalized++;
      continue;
    }

    // Classify as historical-complete if pre-cutoff + has core fields.
    // This keeps already-dispatched loads OUT of the validation queue.
    const classification = classifyHistoricalLoad(load);

    try {
      const [row] = await db
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
          weightLbs: load.weightLbs,
          rate: load.rate,
          mileage: load.mileage,
          bolNo: load.bolNo,
          orderNo: load.orderNo,
          referenceNo: load.referenceNo,
          ticketNo: load.ticketNo,
          status: load.status,
          deliveredOn: load.deliveredOn,
          historicalComplete: classification.isComplete,
          historicalCompleteReason: classification.reason,
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
            weightLbs: load.weightLbs,
            rate: load.rate,
            mileage: load.mileage,
            bolNo: load.bolNo,
            orderNo: load.orderNo,
            referenceNo: load.referenceNo,
            ticketNo: load.ticketNo,
            status: load.status,
            deliveredOn: load.deliveredOn,
            historicalComplete: classification.isComplete,
            historicalCompleteReason: classification.reason,
            rawData: load.rawData,
            updatedAt: new Date(),
          },
        })
        .returning({ id: loads.id });

      // Drizzle returns the row — if id exists, it was either inserted or updated.
      // We can't easily distinguish insert from update with onConflictDoUpdate,
      // so we count based on whether the sourceId was already in our finalized lookup.
      // For accurate counts, check if the sourceId existed before.
      if (existingFinalized.some((e) => e.sourceId === load.sourceId)) {
        result.updated++;
      } else {
        // Could be insert or update of a non-finalized record.
        // Without a separate existence check, we approximate.
        result.inserted++;
      }
    } catch (err: unknown) {
      result.errors.push({
        sourceId: load.sourceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Correct counts: total processed = inserted + updated + skippedFinalized + errors
  // Since we can't perfectly distinguish insert vs update without a full pre-check,
  // recalculate: everything that wasn't skipped or errored was upserted.
  const upserted =
    result.fetched - result.skippedFinalized - result.errors.length;
  const existingNonFinalized = existingFinalized.filter(
    (row) => !FINALIZED_STATUSES.has(row.status ?? ""),
  );
  const existingNonFinalizedIds = new Set(
    existingNonFinalized.map((r) => r.sourceId),
  );

  // Re-count with better accuracy
  let insertCount = 0;
  let updateCount = 0;
  for (const load of normalized) {
    if (finalizedSet.has(load.sourceId)) continue;
    if (result.errors.some((e) => e.sourceId === load.sourceId)) continue;
    if (existingNonFinalizedIds.has(load.sourceId)) {
      updateCount++;
    } else {
      insertCount++;
    }
  }
  result.inserted = insertCount;
  result.updated = updateCount;

  return result;
}
