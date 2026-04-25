/**
 * Master Dispatch Sync — Track 4.3
 * ==================================
 *
 * Reads ES Express's "Copy of Master Dispatch Template++" sheet and ingests
 * two reference tabs:
 *
 *   1. "Driver Codes" (983 rows) → driver_roster
 *      Tractor | Trailer | Driver Code | Driver Name | Company | NOTES
 *
 *   2. "Sand Tracking" (~14 cols) → sand_jobs
 *      PO # | Location Code | Coordinates | Closest City | Sand Type |
 *      Loading Facility | LF Coords | Company | Rate | Mileage | PO Amount |
 *      Delivered | Remaining
 *
 * Both feed the matcher Tier 3 fallback when JotForm submissions or PropX/
 * Logistiq loads can't be bound by the primary cascade.
 *
 * Source spreadsheet ID: 1VFTH6-f-7CvQJElLTs5od_SMiMaaHZ-i69D5Qh-x2Sk
 */

import { eq, and, sql } from "drizzle-orm";
import { driverRoster, sandJobs } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";
import { inspectSheet, type SheetTabInspection } from "./sheets.service.js";

export const MASTER_DISPATCH_SHEET_ID =
  "1VFTH6-f-7CvQJElLTs5od_SMiMaaHZ-i69D5Qh-x2Sk";

const DRIVER_CODES_TAB = "Driver Codes";
const SAND_TRACKING_TAB = "Sand Tracking";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriverRosterSyncResult {
  spreadsheetId: string;
  tabName: string;
  rowsScanned: number;
  rowsUpserted: number;
  rowsSkipped: number;
}

export interface SandJobsSyncResult {
  spreadsheetId: string;
  tabName: string;
  rowsScanned: number;
  rowsUpserted: number;
  rowsSkipped: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nullIfBlank(s: string | undefined): string | null {
  if (s == null) return null;
  const t = s.trim();
  return t === "" ? null : t;
}

function findColIndex(headers: string[], ...candidates: string[]): number {
  const lcCandidates = candidates.map((c) => c.toLowerCase().trim());
  return headers.findIndex((h) =>
    lcCandidates.includes((h ?? "").toLowerCase().trim()),
  );
}

// ---------------------------------------------------------------------------
// Driver roster sync
// ---------------------------------------------------------------------------

export async function syncDriverRoster(
  db: Database,
  options?: { sampleRows?: number; spreadsheetId?: string },
): Promise<DriverRosterSyncResult> {
  const spreadsheetId = options?.spreadsheetId ?? MASTER_DISPATCH_SHEET_ID;
  const sampleRows = options?.sampleRows ?? 1000;

  // Pull just the Driver Codes tab. We re-inspect with a high sample
  // because the default recon truncated to 2 rows.
  const inspection = await inspectSheet(spreadsheetId, sampleRows);
  const tab = inspection.tabs.find((t) => t.name === DRIVER_CODES_TAB);

  const result: DriverRosterSyncResult = {
    spreadsheetId,
    tabName: DRIVER_CODES_TAB,
    rowsScanned: 0,
    rowsUpserted: 0,
    rowsSkipped: 0,
  };

  if (!tab) {
    throw new Error(`Tab "${DRIVER_CODES_TAB}" not found on ${spreadsheetId}`);
  }

  const headers = tab.headers ?? [];
  const colTractor = findColIndex(headers, "Tractor");
  const colTrailer = findColIndex(headers, "Trailer");
  const colDriverCode = findColIndex(
    headers,
    "Driver Code",
    "Driver #",
    "DriverCode",
  );
  const colDriverName = findColIndex(headers, "Driver Name", "Driver");
  const colCompany = findColIndex(headers, "Company", "Carrier");
  const colNotes = findColIndex(headers, "NOTES", "Notes", "Note");

  if (colDriverCode < 0 && colDriverName < 0) {
    throw new Error(
      "Driver Codes tab missing both Driver Code and Driver Name columns",
    );
  }

  for (const row of tab.sampleRows ?? []) {
    result.rowsScanned++;
    const driverCode = nullIfBlank(row[colDriverCode]);
    const driverName = nullIfBlank(row[colDriverName]);
    if (driverCode == null && driverName == null) {
      result.rowsSkipped++;
      continue;
    }

    await db
      .insert(driverRoster)
      .values({
        tractor: nullIfBlank(row[colTractor]),
        trailer: nullIfBlank(row[colTrailer]),
        driverCode,
        driverName,
        company: nullIfBlank(row[colCompany]),
        notes: nullIfBlank(row[colNotes]),
        sourceSpreadsheetId: spreadsheetId,
        sourceTabName: DRIVER_CODES_TAB,
        rawRow: row,
      })
      .onConflictDoUpdate({
        target: [
          driverRoster.sourceSpreadsheetId,
          driverRoster.sourceTabName,
          driverRoster.driverCode,
          driverRoster.driverName,
        ],
        set: {
          tractor: nullIfBlank(row[colTractor]),
          trailer: nullIfBlank(row[colTrailer]),
          company: nullIfBlank(row[colCompany]),
          notes: nullIfBlank(row[colNotes]),
          rawRow: row,
          lastSeenAt: new Date(),
        },
      });
    result.rowsUpserted++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sand jobs sync
// ---------------------------------------------------------------------------

export async function syncSandJobs(
  db: Database,
  options?: { sampleRows?: number; spreadsheetId?: string },
): Promise<SandJobsSyncResult> {
  const spreadsheetId = options?.spreadsheetId ?? MASTER_DISPATCH_SHEET_ID;
  const sampleRows = options?.sampleRows ?? 1000;

  const inspection = await inspectSheet(spreadsheetId, sampleRows);
  const tab = inspection.tabs.find((t) => t.name === SAND_TRACKING_TAB);

  const result: SandJobsSyncResult = {
    spreadsheetId,
    tabName: SAND_TRACKING_TAB,
    rowsScanned: 0,
    rowsUpserted: 0,
    rowsSkipped: 0,
  };

  if (!tab) {
    throw new Error(`Tab "${SAND_TRACKING_TAB}" not found on ${spreadsheetId}`);
  }

  const headers = tab.headers ?? [];
  const colPo = findColIndex(headers, "PO #", "PO#", "PO Number", "PO");
  const colLocCode = findColIndex(headers, "Location Code");
  const colLocCoords = findColIndex(headers, "Location Coordinates");
  const colCity = findColIndex(headers, "Closest City");
  const colSandType = findColIndex(headers, "Sand Type");
  const colLF = findColIndex(headers, "Loading Facility");
  const colLfCoords = findColIndex(headers, "LF Coordinates");
  const colCompany = findColIndex(headers, "Company", "Customer");
  const colRate = findColIndex(headers, "Rate");
  const colMileage = findColIndex(headers, "Mileage");
  const colAmount = findColIndex(headers, "PO Amount");
  const colDelivered = findColIndex(headers, "Delivered");
  const colRemaining = findColIndex(headers, "Remaining");

  if (colPo < 0 && colLocCode < 0) {
    throw new Error(
      "Sand Tracking tab missing both PO # and Location Code columns",
    );
  }

  for (const row of tab.sampleRows ?? []) {
    result.rowsScanned++;
    const poNumber = nullIfBlank(row[colPo]);
    const locationCode = nullIfBlank(row[colLocCode]);
    if (poNumber == null && locationCode == null) {
      result.rowsSkipped++;
      continue;
    }

    await db
      .insert(sandJobs)
      .values({
        poNumber,
        locationCode,
        locationCoords: nullIfBlank(row[colLocCoords]),
        closestCity: nullIfBlank(row[colCity]),
        sandType: nullIfBlank(row[colSandType]),
        loadingFacility: nullIfBlank(row[colLF]),
        lfCoords: nullIfBlank(row[colLfCoords]),
        company: nullIfBlank(row[colCompany]),
        rate: nullIfBlank(row[colRate]),
        mileage: nullIfBlank(row[colMileage]),
        poAmount: nullIfBlank(row[colAmount]),
        delivered: nullIfBlank(row[colDelivered]),
        remaining: nullIfBlank(row[colRemaining]),
        sourceSpreadsheetId: spreadsheetId,
        sourceTabName: SAND_TRACKING_TAB,
        rawRow: row,
      })
      .onConflictDoUpdate({
        target: [
          sandJobs.sourceSpreadsheetId,
          sandJobs.sourceTabName,
          sandJobs.poNumber,
          sandJobs.locationCode,
        ],
        set: {
          locationCoords: nullIfBlank(row[colLocCoords]),
          closestCity: nullIfBlank(row[colCity]),
          sandType: nullIfBlank(row[colSandType]),
          loadingFacility: nullIfBlank(row[colLF]),
          lfCoords: nullIfBlank(row[colLfCoords]),
          company: nullIfBlank(row[colCompany]),
          rate: nullIfBlank(row[colRate]),
          mileage: nullIfBlank(row[colMileage]),
          poAmount: nullIfBlank(row[colAmount]),
          delivered: nullIfBlank(row[colDelivered]),
          remaining: nullIfBlank(row[colRemaining]),
          rawRow: row,
          lastSeenAt: new Date(),
        },
      });
    result.rowsUpserted++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Combined sync — both tabs in one inspection call (efficiency)
// ---------------------------------------------------------------------------

export async function syncMasterDispatch(
  db: Database,
  options?: { sampleRows?: number; spreadsheetId?: string },
): Promise<{
  driverRoster: DriverRosterSyncResult;
  sandJobs: SandJobsSyncResult;
}> {
  // Run both in sequence to keep memory predictable; both call inspectSheet
  // independently because the sheet API caches at our layer is not yet built
  // and inspectSheet's cost is low for this sheet (~6 tabs, 50KB).
  const drivers = await syncDriverRoster(db, options);
  const sand = await syncSandJobs(db, options);
  return { driverRoster: drivers, sandJobs: sand };
}

// ---------------------------------------------------------------------------
// Roster lookup helpers — used by matcher Tier 3 fallback
// ---------------------------------------------------------------------------

export interface DriverLookupHit {
  driverCode: string | null;
  driverName: string | null;
  company: string | null;
  tractor: string | null;
  trailer: string | null;
}

/**
 * Look up a driver by name (case-insensitive trim) and return company if known.
 * Used by matcher to attribute carrier when only driver_name is available.
 */
export async function lookupDriverByName(
  db: Database,
  driverName: string,
): Promise<DriverLookupHit | null> {
  const lc = driverName.trim().toLowerCase();
  if (!lc) return null;
  const rows = await db
    .select({
      driverCode: driverRoster.driverCode,
      driverName: driverRoster.driverName,
      company: driverRoster.company,
      tractor: driverRoster.tractor,
      trailer: driverRoster.trailer,
    })
    .from(driverRoster)
    .where(sql`LOWER(${driverRoster.driverName}) = ${lc}`)
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Look up a sand job by PO number — gives us locationCode + loadingFacility +
 * company so the auto-mapper can resolve PO → location → well candidate.
 */
export async function lookupSandJobByPo(
  db: Database,
  poNumber: string,
): Promise<{
  poNumber: string | null;
  locationCode: string | null;
  loadingFacility: string | null;
  company: string | null;
  closestCity: string | null;
} | null> {
  const trimmed = poNumber.trim();
  if (!trimmed) return null;
  const rows = await db
    .select({
      poNumber: sandJobs.poNumber,
      locationCode: sandJobs.locationCode,
      loadingFacility: sandJobs.loadingFacility,
      company: sandJobs.company,
      closestCity: sandJobs.closestCity,
    })
    .from(sandJobs)
    .where(eq(sandJobs.poNumber, trimmed))
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export function diagnostics(): {
  name: string;
  status: "healthy" | "degraded" | "error";
  stats: Record<string, unknown>;
  checks: Array<{ name: string; ok: boolean; detail?: string | number }>;
} {
  return {
    name: "master-dispatch-sync",
    status: "healthy",
    stats: { sheetId: MASTER_DISPATCH_SHEET_ID },
    checks: [
      {
        name: "sheet-id-configured",
        ok: !!MASTER_DISPATCH_SHEET_ID,
        detail: MASTER_DISPATCH_SHEET_ID,
      },
    ],
  };
}
