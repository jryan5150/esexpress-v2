/**
 * Google Sheets Service — Track 4.1
 * ===================================
 *
 * Google Sheets integration for importing/exporting dispatch data.
 *
 * Auth: Google service account via env vars:
 *   - GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY
 *   - OR GOOGLE_SERVICE_ACCOUNT_KEY (full JSON key)
 *
 * Scopes:
 *   - https://www.googleapis.com/auth/spreadsheets
 *   - https://www.googleapis.com/auth/drive.file
 *
 * V1 reference: backend/services/googleSheetsService.js
 */

import { google, type Auth } from "googleapis";
import { eq, and, between, inArray, count } from "drizzle-orm";
import {
  wells,
  loads,
  assignments,
  type AssignmentStatus,
} from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportColumn {
  key: string; // field name in DB
  header: string; // display name in Sheet
  width?: number; // column width hint (pixels)
}

export interface ExportFilters {
  dateRange?: { from: Date; to: Date };
  wellIds?: number[];
  statuses?: string[];
}

export interface ExportResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  rowCount: number;
  truncated?: boolean;
}

export interface ColumnMap {
  [sheetColumn: string]: string; // sheet header -> DB field name
}

export interface PreviewRow {
  raw: Record<string, string>;
  mapped: Record<string, string>;
  wellMatch?: { id: number; name: string } | null;
  errors: string[];
}

export interface PreviewResult {
  rows: PreviewRow[];
  totalRows: number;
  mappedColumns: string[];
  unmappedColumns: string[];
  wellMatchRate: number;
  columnMap: ColumnMap;
  spreadsheetId: string;
  sheetName: string;
}

export interface ImportOptions {
  userId: number;
  userName: string;
  defaultWellId?: number;
  dryRun?: boolean;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  totalRows: number;
}

export interface SheetInfo {
  id: string;
  name: string;
  url: string;
  modifiedTime: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_EXPORT_ROWS = 10_000;

/** Characters that trigger formula injection in spreadsheet applications. */
const FORMULA_INJECTION_CHARS = ["=", "+", "-", "@", "\t", "\r", "|"];

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
] as const;

// ---------------------------------------------------------------------------
// Column Configs
// ---------------------------------------------------------------------------

/**
 * Assignment export columns — 19 columns.
 * Maps DB fields from the loads + assignments + wells join to sheet headers.
 */
export const ASSIGNMENT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "load_no", header: "Load #", width: 100 },
  { key: "bol_no", header: "BOL #", width: 100 },
  { key: "driver_name", header: "Driver", width: 140 },
  { key: "truck_no", header: "Truck #", width: 90 },
  { key: "carrier_name", header: "Carrier", width: 140 },
  { key: "well_name", header: "Well", width: 180 },
  { key: "assignment_status", header: "Status", width: 100 },
  { key: "product_description", header: "Product", width: 140 },
  { key: "weight_tons", header: "Weight (tons)", width: 110 },
  { key: "rate", header: "Rate", width: 80 },
  { key: "mileage", header: "Mileage", width: 80 },
  { key: "origin_name", header: "Origin", width: 160 },
  { key: "destination_name", header: "Destination", width: 160 },
  { key: "delivered_on", header: "Delivered On", width: 120 },
  { key: "assigned_date", header: "Assigned Date", width: 120 },
  { key: "assigned_by_name", header: "Dispatcher", width: 120 },
  { key: "pcs_status", header: "PCS Status", width: 100 },
  { key: "photo_status", header: "Photo Status", width: 100 },
  { key: "notes", header: "Notes", width: 200 },
];

/**
 * Well export columns — 15 columns.
 * Maps DB fields from the wells table to sheet headers.
 */
export const WELL_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "name", header: "Name", width: 180 },
  { key: "status", header: "Status", width: 80 },
  { key: "daily_target_loads", header: "Daily Target (Loads)", width: 120 },
  { key: "daily_target_tons", header: "Daily Target (Tons)", width: 120 },
  { key: "latitude", header: "Latitude", width: 100 },
  { key: "longitude", header: "Longitude", width: 100 },
  { key: "propx_job_id", header: "PropX Job ID", width: 100 },
  { key: "propx_destination_id", header: "PropX Destination ID", width: 120 },
  { key: "aliases", header: "Aliases", width: 200 },
  { key: "active_assignments", header: "Active Assignments", width: 120 },
  { key: "total_loads", header: "Total Loads", width: 100 },
  { key: "avg_weight", header: "Avg Weight", width: 100 },
  { key: "customer_name", header: "Customer", width: 140 },
  { key: "created_at", header: "Created", width: 120 },
  { key: "updated_at", header: "Last Updated", width: 120 },
];

// ---------------------------------------------------------------------------
// Module state (for diagnostics)
// ---------------------------------------------------------------------------

let lastAuthAttempt: Date | null = null;
let lastAuthSuccess: boolean | null = null;
let lastExportAt: Date | null = null;
let lastImportAt: Date | null = null;
let totalExports = 0;
let totalImports = 0;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Build a GoogleAuth instance from environment variables.
 *
 * Supports two config shapes:
 *   1. GOOGLE_SERVICE_ACCOUNT_KEY — full JSON key (takes precedence)
 *   2. GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY — individual fields
 */
export async function getGoogleAuth(): Promise<Auth.GoogleAuth> {
  lastAuthAttempt = new Date();

  const fullKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (fullKey) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(fullKey);
    } catch {
      lastAuthSuccess = false;
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON. Check the env var.",
      );
    }

    lastAuthSuccess = true;
    return new google.auth.GoogleAuth({
      credentials,
      scopes: [...GOOGLE_SCOPES],
    });
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey) {
    lastAuthSuccess = false;
    throw new Error(
      "Google Sheets integration requires GOOGLE_SERVICE_ACCOUNT_KEY (JSON) " +
        "or both GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.",
    );
  }

  // Private key may come with escaped newlines from env
  const resolvedKey = privateKey.replace(/\\n/g, "\n");

  lastAuthSuccess = true;
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: resolvedKey,
    },
    scopes: [...GOOGLE_SCOPES],
  });
}

// ---------------------------------------------------------------------------
// Formula injection protection
// ---------------------------------------------------------------------------

/**
 * Sanitize a cell value to prevent formula injection.
 *
 * If the string starts with any of: = + - @ \t \r |
 * it gets prefixed with a single quote to neutralize formula execution.
 *
 * Non-string values are returned as-is.
 */
export function sanitizeCell(value: string): string {
  if (typeof value !== "string") return value;
  if (value.length === 0) return value;

  if (FORMULA_INJECTION_CHARS.some((ch) => value.startsWith(ch))) {
    return `'${value}`;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCellValue(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function buildAssignmentRow(
  row: Record<string, unknown>,
  columns: ExportColumn[],
): string[] {
  return columns.map((col) => formatCellValue(row[col.key]));
}

function buildWellRow(
  row: Record<string, unknown>,
  columns: ExportColumn[],
): string[] {
  return columns.map((col) => formatCellValue(row[col.key]));
}

// ---------------------------------------------------------------------------
// Export — Assignments
// ---------------------------------------------------------------------------

/**
 * Export assignments to a new Google Sheet.
 *
 * Joins assignments -> loads -> wells and writes up to MAX_EXPORT_ROWS rows.
 */
export async function exportAssignments(
  db: Database,
  filters: ExportFilters,
): Promise<ExportResult> {
  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Build query conditions
  const conditions = [];
  if (filters.dateRange) {
    conditions.push(
      between(
        assignments.createdAt,
        filters.dateRange.from,
        filters.dateRange.to,
      ),
    );
  }
  if (filters.wellIds && filters.wellIds.length > 0) {
    conditions.push(inArray(assignments.wellId, filters.wellIds));
  }
  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(
      inArray(assignments.status, filters.statuses as AssignmentStatus[]),
    );
  }

  // Query with joins — project only what we need for the sheet
  const rows = await db
    .select({
      load_no: loads.loadNo,
      bol_no: loads.bolNo,
      driver_name: loads.driverName,
      truck_no: loads.truckNo,
      carrier_name: loads.carrierName,
      well_name: wells.name,
      assignment_status: assignments.status,
      product_description: loads.productDescription,
      weight_tons: loads.weightTons,
      rate: loads.rate,
      mileage: loads.mileage,
      origin_name: loads.originName,
      destination_name: loads.destinationName,
      delivered_on: loads.deliveredOn,
      assigned_date: assignments.createdAt,
      assigned_by: assignments.assignedBy,
      pcs_dispatch: assignments.pcsDispatch,
      photo_status: assignments.photoStatus,
      status_history: assignments.statusHistory,
    })
    .from(assignments)
    .innerJoin(loads, eq(assignments.loadId, loads.id))
    .innerJoin(wells, eq(assignments.wellId, wells.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(assignments.createdAt)
    .limit(MAX_EXPORT_ROWS + 1);

  const truncated = rows.length > MAX_EXPORT_ROWS;
  const exportRows = truncated ? rows.slice(0, MAX_EXPORT_ROWS) : rows;

  // Transform rows into flat records for the sheet
  const sheetData = exportRows.map((r) => ({
    load_no: r.load_no,
    bol_no: r.bol_no,
    driver_name: r.driver_name,
    truck_no: r.truck_no,
    carrier_name: r.carrier_name,
    well_name: r.well_name,
    assignment_status: r.assignment_status,
    product_description: r.product_description,
    weight_tons: r.weight_tons,
    rate: r.rate,
    mileage: r.mileage,
    origin_name: r.origin_name,
    destination_name: r.destination_name,
    delivered_on: r.delivered_on,
    assigned_date: r.assigned_date,
    assigned_by_name: "", // would need user join — TODO: Track 4.2
    pcs_status: (r.pcs_dispatch as Record<string, unknown>)?.status ?? "",
    photo_status: r.photo_status,
    notes: "", // placeholder for notes column
  }));

  // Build sheet values
  const headerRow = ASSIGNMENT_EXPORT_COLUMNS.map((c) => c.header);
  const dataRows = sheetData.map((row) =>
    buildAssignmentRow(row, ASSIGNMENT_EXPORT_COLUMNS),
  );

  // Create spreadsheet
  const title = `Assignments Export - ${new Date().toISOString().split("T")[0]}`;
  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: "Assignments" } }],
    },
  });

  const spreadsheetId = spreadsheet.data.spreadsheetId!;

  // Write data
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: "Assignments!A1",
          values: [headerRow, ...dataRows],
        },
      ],
    },
  });

  // Update module state
  lastExportAt = new Date();
  totalExports++;

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    rowCount: exportRows.length,
    truncated,
  };
}

// ---------------------------------------------------------------------------
// Export — Wells
// ---------------------------------------------------------------------------

/**
 * Export wells to a new Google Sheet.
 *
 * Includes computed aggregate columns (active assignments, total loads, avg weight).
 */
export async function exportWells(
  db: Database,
  filters: ExportFilters,
): Promise<ExportResult> {
  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Build query conditions
  const conditions = [];
  if (filters.wellIds && filters.wellIds.length > 0) {
    conditions.push(inArray(wells.id, filters.wellIds));
  }
  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(
      inArray(
        wells.status,
        filters.statuses as ("active" | "standby" | "completed" | "closed")[],
      ),
    );
  }

  // Fetch wells
  const wellRows = await db
    .select()
    .from(wells)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(wells.name);

  // Batch-fetch aggregate stats per well to avoid N+1
  const wellIds = wellRows.map((w) => w.id);

  // Active assignment counts per well
  const activeCountsByWell = new Map<number, number>();
  // Total load counts per well
  const totalCountsByWell = new Map<number, number>();

  if (wellIds.length > 0) {
    const activeCounts = await db
      .select({
        wellId: assignments.wellId,
        cnt: count(),
      })
      .from(assignments)
      .where(
        and(
          inArray(assignments.wellId, wellIds),
          inArray(assignments.status, [
            "pending",
            "assigned",
            "dispatch_ready",
            "dispatching",
            "in_transit",
          ]),
        ),
      )
      .groupBy(assignments.wellId);

    for (const row of activeCounts) {
      activeCountsByWell.set(row.wellId, Number(row.cnt));
    }

    const totalCounts = await db
      .select({
        wellId: assignments.wellId,
        cnt: count(),
      })
      .from(assignments)
      .where(inArray(assignments.wellId, wellIds))
      .groupBy(assignments.wellId);

    for (const row of totalCounts) {
      totalCountsByWell.set(row.wellId, Number(row.cnt));
    }
  }

  // Transform into flat records
  const sheetData = wellRows.map((w) => ({
    name: w.name,
    status: w.status,
    daily_target_loads: w.dailyTargetLoads,
    daily_target_tons: w.dailyTargetTons,
    latitude: w.latitude,
    longitude: w.longitude,
    propx_job_id: w.propxJobId,
    propx_destination_id: w.propxDestinationId,
    aliases: (w.aliases as string[]) ?? [],
    active_assignments: activeCountsByWell.get(w.id) ?? 0,
    total_loads: totalCountsByWell.get(w.id) ?? 0,
    avg_weight: "", // would need a sub-query on loads — TODO: Track 4.2
    customer_name: "", // not yet on wells table — TODO
    created_at: w.createdAt,
    updated_at: w.updatedAt,
  }));

  // Build sheet values
  const headerRow = WELL_EXPORT_COLUMNS.map((c) => c.header);
  const dataRows = sheetData.map((row) =>
    buildWellRow(row, WELL_EXPORT_COLUMNS),
  );

  // Create spreadsheet
  const title = `Wells Export - ${new Date().toISOString().split("T")[0]}`;
  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: "Wells" } }],
    },
  });

  const spreadsheetId = spreadsheet.data.spreadsheetId!;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: "Wells!A1",
          values: [headerRow, ...dataRows],
        },
      ],
    },
  });

  lastExportAt = new Date();
  totalExports++;

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    rowCount: wellRows.length,
  };
}

// ---------------------------------------------------------------------------
// Import — Preview
// ---------------------------------------------------------------------------

/**
 * Preview an import from a Google Sheet.
 *
 * Reads the sheet, applies the column mapping, resolves well names
 * against the wells table (name + aliases), and returns preview rows
 * with match rates. Does NOT write to the database.
 */
export async function previewImport(
  db: Database,
  spreadsheetId: string,
  sheetName: string,
  columnMap: ColumnMap,
): Promise<PreviewResult> {
  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Read header + data rows
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:ZZ`,
  });

  const allRows = result.data.values ?? [];
  if (allRows.length < 2) {
    return {
      rows: [],
      totalRows: 0,
      mappedColumns: [],
      unmappedColumns: [],
      wellMatchRate: 0,
      columnMap,
      spreadsheetId,
      sheetName,
    };
  }

  const headers = allRows[0];
  const dataRows = allRows.slice(1);

  // Determine mapped vs unmapped columns
  const mappedColumns = headers.filter((h: string) => columnMap[h]);
  const unmappedColumns = headers.filter((h: string) => !columnMap[h]);

  // Pre-load all wells for matching (avoid N+1)
  const allWells = await db
    .select({ id: wells.id, name: wells.name, aliases: wells.aliases })
    .from(wells);

  // Build preview rows (cap at 100 for preview)
  const previewLimit = Math.min(dataRows.length, 100);
  const previewRows: PreviewRow[] = [];
  let wellMatches = 0;

  for (let i = 0; i < previewLimit; i++) {
    const row = dataRows[i];
    const raw: Record<string, string> = {};
    const mapped: Record<string, string> = {};
    const errors: string[] = [];

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const cellValue = sanitizeCell(row[j] ?? "");
      raw[header] = cellValue;

      const dbField = columnMap[header];
      if (dbField && dbField !== "skip") {
        mapped[dbField] = cellValue;
      }
    }

    // Resolve well name if mapped
    let wellMatch: { id: number; name: string } | null = null;
    const wellNameValue = mapped["well_name"] ?? mapped["name"];
    if (wellNameValue) {
      const lowerWellName = wellNameValue.toLowerCase().trim();
      const match = allWells.find(
        (w) =>
          w.name.toLowerCase() === lowerWellName ||
          ((w.aliases as string[]) ?? []).some(
            (a) => a.toLowerCase() === lowerWellName,
          ),
      );
      if (match) {
        wellMatch = { id: match.id, name: match.name };
        wellMatches++;
      } else {
        errors.push(`Well not found: "${wellNameValue}"`);
      }
    }

    previewRows.push({ raw, mapped, wellMatch, errors });
  }

  return {
    rows: previewRows,
    totalRows: dataRows.length,
    mappedColumns,
    unmappedColumns,
    wellMatchRate: previewLimit > 0 ? (wellMatches / previewLimit) * 100 : 0,
    columnMap,
    spreadsheetId,
    sheetName,
  };
}

// ---------------------------------------------------------------------------
// Import — Execute
// ---------------------------------------------------------------------------

/**
 * Execute an import based on preview data.
 *
 * Creates or updates loads from the sheet data. Well resolution uses
 * name + aliases (case-insensitive) from the wells table.
 */
export async function executeImport(
  db: Database,
  previewData: PreviewResult,
  options: ImportOptions,
): Promise<ImportResult> {
  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Re-read the full sheet (preview may have been capped)
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: previewData.spreadsheetId,
    range: `${previewData.sheetName}!A1:ZZ`,
  });

  const allRows = result.data.values ?? [];
  if (allRows.length < 2) {
    return { created: 0, updated: 0, skipped: 0, errors: [], totalRows: 0 };
  }

  const headers = allRows[0];
  const dataRows = allRows.slice(1);
  const { columnMap } = previewData;

  // Pre-load wells for matching
  const allWells = await db
    .select({ id: wells.id, name: wells.name, aliases: wells.aliases })
    .from(wells);

  const importResult: ImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    totalRows: dataRows.length,
  };

  if (options.dryRun) {
    // Dry run — just count what would happen
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const mapped: Record<string, string> = {};

      for (let j = 0; j < headers.length; j++) {
        const dbField = columnMap[headers[j]];
        if (dbField && dbField !== "skip") {
          mapped[dbField] = sanitizeCell(row[j] ?? "");
        }
      }

      const wellNameValue = mapped["well_name"] ?? mapped["name"];
      if (wellNameValue) {
        const lowerName = wellNameValue.toLowerCase().trim();
        const match = allWells.find(
          (w) =>
            w.name.toLowerCase() === lowerName ||
            ((w.aliases as string[]) ?? []).some(
              (a) => a.toLowerCase() === lowerName,
            ),
        );
        if (match) {
          importResult.created++;
        } else {
          importResult.skipped++;
          importResult.errors.push({
            row: i + 2,
            message: `Well not found: "${wellNameValue}"`,
          });
        }
      } else if (options.defaultWellId) {
        importResult.created++;
      } else {
        importResult.skipped++;
        importResult.errors.push({
          row: i + 2,
          message: "No well_name column mapped and no default well specified",
        });
      }
    }
    return importResult;
  }

  // Real import — write to loads table
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNum = i + 2; // 1-based + header row

    try {
      const mapped: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        const dbField = columnMap[headers[j]];
        if (dbField && dbField !== "skip") {
          mapped[dbField] = sanitizeCell(row[j] ?? "");
        }
      }

      // Resolve well
      let wellId = options.defaultWellId ?? null;
      const wellNameValue = mapped["well_name"] ?? mapped["name"];
      if (wellNameValue) {
        const lowerName = wellNameValue.toLowerCase().trim();
        const match = allWells.find(
          (w) =>
            w.name.toLowerCase() === lowerName ||
            ((w.aliases as string[]) ?? []).some(
              (a) => a.toLowerCase() === lowerName,
            ),
        );
        if (match) {
          wellId = match.id;
        } else {
          importResult.skipped++;
          importResult.errors.push({
            row: rowNum,
            message: `Well not found: "${wellNameValue}"`,
          });
          continue;
        }
      }

      if (!wellId) {
        importResult.skipped++;
        importResult.errors.push({
          row: rowNum,
          message: "No well_name column mapped and no default well specified",
        });
        continue;
      }

      // Build load record
      const loadNo = mapped["load_no"] || `SHEET-${Date.now()}-${i}`;
      const sourceId = `sheet-${previewData.spreadsheetId}-${i}`;

      // Check for existing load by source + sourceId
      const existing = await db
        .select({ id: loads.id })
        .from(loads)
        .where(and(eq(loads.source, "manual"), eq(loads.sourceId, sourceId)))
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        await db
          .update(loads)
          .set({
            loadNo,
            driverName: mapped["driver_name"] || null,
            truckNo: mapped["truck_no"] || null,
            carrierName: mapped["carrier_name"] || null,
            productDescription: mapped["product_description"] || null,
            originName: mapped["origin_name"] || null,
            destinationName:
              mapped["destination_name"] || wellNameValue || null,
            weightTons: mapped["weight_tons"] || null,
            netWeightTons: mapped["net_weight_tons"] || null,
            rate: mapped["rate"] || null,
            mileage: mapped["mileage"] || null,
            bolNo: mapped["bol_no"] || null,
            orderNo: mapped["order_no"] || null,
            ticketNo: mapped["ticket_no"] || null,
            updatedAt: new Date(),
          })
          .where(eq(loads.id, existing[0].id));

        importResult.updated++;
      } else {
        // Insert new load
        const [newLoad] = await db
          .insert(loads)
          .values({
            loadNo,
            source: "manual",
            sourceId,
            driverName: mapped["driver_name"] || null,
            truckNo: mapped["truck_no"] || null,
            carrierName: mapped["carrier_name"] || null,
            productDescription: mapped["product_description"] || null,
            originName: mapped["origin_name"] || null,
            destinationName:
              mapped["destination_name"] || wellNameValue || null,
            weightTons: mapped["weight_tons"] || null,
            netWeightTons: mapped["net_weight_tons"] || null,
            rate: mapped["rate"] || null,
            mileage: mapped["mileage"] || null,
            bolNo: mapped["bol_no"] || null,
            orderNo: mapped["order_no"] || null,
            ticketNo: mapped["ticket_no"] || null,
            rawData: {
              importedFrom: "sheets",
              spreadsheetId: previewData.spreadsheetId,
              row: rowNum,
            },
          })
          .returning({ id: loads.id });

        // Create assignment linking load to well
        await db.insert(assignments).values({
          wellId,
          loadId: newLoad.id,
          status: "pending",
          assignedBy: options.userId,
          statusHistory: [
            {
              status: "pending",
              changedAt: new Date().toISOString(),
              changedBy: options.userId,
              changedByName: options.userName,
              notes: "Imported from Google Sheets",
            },
          ],
        });

        importResult.created++;
      }
    } catch (err) {
      importResult.skipped++;
      importResult.errors.push({
        row: rowNum,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Update module state
  lastImportAt = new Date();
  totalImports++;

  return importResult;
}

// ---------------------------------------------------------------------------
// Drive — List accessible sheets
// ---------------------------------------------------------------------------

/**
 * List Google Sheets files accessible to the service account via Drive API.
 * Sorted by last modified time, newest first.
 */
export async function listAccessibleSheets(
  auth: Auth.GoogleAuth,
): Promise<SheetInfo[]> {
  const drive = google.drive({ version: "v3", auth });
  const response = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: "files(id,name,modifiedTime,webViewLink)",
    orderBy: "modifiedTime desc",
    pageSize: 50,
  });

  return (response.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name!,
    url: f.webViewLink!,
    modifiedTime: f.modifiedTime!,
  }));
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sheet-Based Validation — cross-reference Google Sheet against v2 loads
// ---------------------------------------------------------------------------

export interface SheetValidationResult {
  matched: number;
  unmatched: number;
  alreadyValidated: number;
  errors: string[];
  details: Array<{
    row: number;
    loadNo: string;
    wellName: string;
    status: "validated" | "already_validated" | "not_found" | "error";
  }>;
}

export async function validateFromSheet(
  db: Database,
  spreadsheetId: string,
  sheetName: string,
  columnMap: ColumnMap,
  userId: number,
): Promise<SheetValidationResult> {
  const auth = await getGoogleAuth();
  const sheetsApi = google.sheets({ version: "v4", auth });

  const result = await sheetsApi.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:ZZ`,
  });

  const allRows = result.data.values ?? [];
  if (allRows.length < 2) {
    return {
      matched: 0,
      unmatched: 0,
      alreadyValidated: 0,
      errors: ["Sheet has no data rows"],
      details: [],
    };
  }

  const headers = allRows[0] as string[];
  const dataRows = allRows.slice(1);

  // Pre-load all wells for matching
  const allWells = await db
    .select({ id: wells.id, name: wells.name, aliases: wells.aliases })
    .from(wells);

  const stats: SheetValidationResult = {
    matched: 0,
    unmatched: 0,
    alreadyValidated: 0,
    errors: [],
    details: [],
  };

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const mapped: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const dbField = columnMap[header];
      if (dbField && dbField !== "skip") {
        mapped[dbField] = sanitizeCell(row[j] ?? "");
      }
    }

    const loadNo = mapped["load_no"] ?? mapped["loadNo"] ?? "";
    const wellName = mapped["well_name"] ?? mapped["name"] ?? "";

    if (!loadNo) {
      stats.details.push({ row: i + 2, loadNo: "", wellName, status: "error" });
      continue;
    }

    // Resolve well
    const lowerWellName = wellName.toLowerCase().trim();
    const wellMatch = allWells.find(
      (w) =>
        w.name.toLowerCase() === lowerWellName ||
        ((w.aliases as string[]) ?? []).some(
          (a) => a.toLowerCase() === lowerWellName,
        ),
    );

    if (!wellMatch) {
      stats.unmatched++;
      stats.details.push({ row: i + 2, loadNo, wellName, status: "not_found" });
      continue;
    }

    // Find load by loadNo in this well
    const loadRows = await db
      .select({
        assignmentId: assignments.id,
        photoStatus: assignments.photoStatus,
      })
      .from(assignments)
      .innerJoin(loads, eq(assignments.loadId, loads.id))
      .where(
        and(eq(loads.loadNo, loadNo), eq(assignments.wellId, wellMatch.id)),
      )
      .limit(1);

    if (loadRows.length === 0) {
      stats.unmatched++;
      stats.details.push({ row: i + 2, loadNo, wellName, status: "not_found" });
      continue;
    }

    const assignment = loadRows[0];

    if (assignment.photoStatus === "attached") {
      stats.alreadyValidated++;
      stats.details.push({
        row: i + 2,
        loadNo,
        wellName,
        status: "already_validated",
      });
      continue;
    }

    // Validate: set photoStatus to 'attached' (sheet-verified)
    await db
      .update(assignments)
      .set({ photoStatus: "attached" })
      .where(eq(assignments.id, assignment.assignmentId));

    stats.matched++;
    stats.details.push({ row: i + 2, loadNo, wellName, status: "validated" });
  }

  return stats;
}

export function diagnostics(): {
  name: string;
  status: "healthy" | "degraded" | "error";
  stats: Record<string, unknown>;
  checks: Array<{ name: string; ok: boolean; detail?: string | number }>;
} {
  const hasFullKey = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const hasEmailKey =
    !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    !!process.env.GOOGLE_PRIVATE_KEY;
  const authConfigured = hasFullKey || hasEmailKey;

  return {
    name: "google-sheets",
    status: authConfigured ? "healthy" : "error",
    stats: {
      maxExportRows: MAX_EXPORT_ROWS,
      assignmentColumns: ASSIGNMENT_EXPORT_COLUMNS.length,
      wellColumns: WELL_EXPORT_COLUMNS.length,
      totalExports,
      totalImports,
      lastExportAt: lastExportAt?.toISOString() ?? null,
      lastImportAt: lastImportAt?.toISOString() ?? null,
    },
    checks: [
      {
        name: "auth-configured",
        ok: authConfigured,
        detail: hasFullKey
          ? "json-key"
          : hasEmailKey
            ? "email+private-key"
            : "missing",
      },
      {
        name: "last-auth-attempt",
        ok: lastAuthSuccess !== false,
        detail: lastAuthAttempt
          ? `${lastAuthSuccess ? "ok" : "failed"} at ${lastAuthAttempt.toISOString()}`
          : "none",
      },
      {
        name: "assignment-columns",
        ok: ASSIGNMENT_EXPORT_COLUMNS.length === 19,
        detail: ASSIGNMENT_EXPORT_COLUMNS.length,
      },
      {
        name: "well-columns",
        ok: WELL_EXPORT_COLUMNS.length === 15,
        detail: WELL_EXPORT_COLUMNS.length,
      },
    ],
  };
}
