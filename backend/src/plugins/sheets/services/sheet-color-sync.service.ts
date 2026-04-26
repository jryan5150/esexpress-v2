/**
 * Sheet Color Sync — reads the Load Count Sheet's Current/Previous tabs
 * with cell background colors, maps each colored cell to its canonical
 * workflow status via the legend (Color Key tab), and persists per-cell
 * snapshots into sheet_well_status.
 *
 * Captured 2026-04-25 from the live legend (/diag/sheet-color-key).
 * Hex values may drift slightly when team paints by hand; the matcher
 * tolerates near-misses via RGB distance.
 */

import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import { sheetWellStatus, type WorkflowStatus } from "../../../db/schema.js";
import { readColoredGrid, type ColoredCell } from "./sheets.service.js";

// Captured live from the Color Key tab on 2026-04-25.
// Order matters for tie-break only — exact-hex match short-circuits.
const HEX_TO_STATUS: Array<{
  hex: string;
  rgb: [number, number, number];
  status: WorkflowStatus;
  label: string;
}> = [
  {
    hex: "#00ff00",
    rgb: [0, 255, 0],
    status: "loads_being_built",
    label: "Loads being built",
  },
  {
    hex: "#ff00ff",
    rgb: [255, 0, 255],
    status: "loads_completed",
    label: "Loads Completed/ Load Count complete",
  },
  {
    hex: "#f46fa2",
    rgb: [244, 111, 162],
    status: "loads_being_cleared",
    label: "Loads Being cleared",
  },
  {
    hex: "#da3876",
    rgb: [218, 56, 118],
    status: "loads_cleared",
    label: "Loads cleared",
  },
  {
    hex: "#ffff00",
    rgb: [255, 255, 0],
    status: "export_transfers_completed",
    label: "Export (Transfers) Completed",
  },
  {
    hex: "#4a86e8",
    rgb: [74, 134, 232],
    status: "invoiced",
    label: "Invoiced",
  },
  {
    hex: "#9900ff",
    rgb: [153, 0, 255],
    status: "missing_tickets",
    label: "Missing Tickets/ Not Arrived",
  },
  {
    hex: "#00ffff",
    rgb: [0, 255, 255],
    status: "missing_driver",
    label: "Missing Driver",
  },
  {
    hex: "#e69138",
    rgb: [230, 145, 56],
    status: "need_rate_info",
    label: "Need Well Rate Info / New Loading Facility Rate",
  },
  // Near-miss for the "Need Rate" exception — sheet sometimes uses pure orange
  {
    hex: "#ff9900",
    rgb: [255, 153, 0],
    status: "need_rate_info",
    label: "Need Well Rate Info (orange variant)",
  },
];

// Maximum RGB distance for fuzzy fallback. Beyond this, label as 'unknown'.
const FUZZY_THRESHOLD = 50;

function rgbDistance(
  a: [number, number, number],
  b: [number, number, number],
): number {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2,
  );
}

export function classifyColor(cell: ColoredCell): WorkflowStatus {
  if (!cell.hex || !cell.rgb) return "unknown";
  const target: [number, number, number] = [cell.rgb.r, cell.rgb.g, cell.rgb.b];
  // Exact hex first (cheapest)
  for (const entry of HEX_TO_STATUS) {
    if (entry.hex.toLowerCase() === cell.hex.toLowerCase()) return entry.status;
  }
  // Fuzzy nearest-neighbor for hand-paint drift
  let best: { status: WorkflowStatus; dist: number } = {
    status: "unknown",
    dist: Infinity,
  };
  for (const entry of HEX_TO_STATUS) {
    const d = rgbDistance(target, entry.rgb);
    if (d < best.dist) best = { status: entry.status, dist: d };
  }
  return best.dist <= FUZZY_THRESHOLD ? best.status : "unknown";
}

interface SyncOptions {
  spreadsheetId: string;
  tabName: string;
  weekStart: string; // 'YYYY-MM-DD' Sunday
  range?: string;
}

export interface SheetColorSyncResult {
  rowsScanned: number;
  cellsScanned: number;
  cellsPainted: number;
  byStatus: Record<string, number>;
  rowsUpserted: number;
}

/**
 * Sync workflow-status from one tab of the Load Count Sheet for one
 * week. Reads cells A1:U80 (well-grid + day cols + total/discrepancy
 * cols), classifies background colors, persists per-cell.
 *
 * Idempotent: existing rows for (spreadsheet, tab, week, row, col) get
 * upserted on each call.
 */
export async function syncSheetColorStatus(
  db: Database,
  opts: SyncOptions,
): Promise<SheetColorSyncResult> {
  const range = opts.range ?? "A1:U80";
  const grid = await readColoredGrid(opts.spreadsheetId, opts.tabName, range);

  const byStatus: Record<string, number> = {};
  const rowsToUpsert: Array<{
    spreadsheetId: string;
    sheetTabName: string;
    weekStart: string;
    rowIndex: number;
    wellName: string | null;
    billTo: string | null;
    colIndex: number;
    cellValue: string | null;
    cellHex: string | null;
    status: WorkflowStatus;
  }> = [];

  let cellsScanned = 0;
  let cellsPainted = 0;

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const wellName = row[0]?.value?.trim() || null;
    const billTo = row[1]?.value?.trim() || null;
    // Skip rows that don't look like a well row (no well name AND no bill_to)
    if (!wellName && !billTo) continue;
    for (let c = 0; c < row.length; c++) {
      cellsScanned++;
      const cell = row[c];
      if (!cell?.hex) continue;
      cellsPainted++;
      const status = classifyColor(cell);
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      rowsToUpsert.push({
        spreadsheetId: opts.spreadsheetId,
        sheetTabName: opts.tabName,
        weekStart: opts.weekStart,
        rowIndex: r,
        wellName,
        billTo,
        colIndex: c,
        cellValue: cell.value,
        cellHex: cell.hex,
        status,
      });
    }
  }

  // Replace existing rows for this (spreadsheet, tab, week) — clean state
  await db
    .delete(sheetWellStatus)
    .where(
      and(
        eq(sheetWellStatus.spreadsheetId, opts.spreadsheetId),
        eq(sheetWellStatus.sheetTabName, opts.tabName),
        eq(sheetWellStatus.weekStart, opts.weekStart),
      ),
    );

  if (rowsToUpsert.length > 0) {
    // Chunk inserts so a single huge call doesn't blow the param limit
    const CHUNK = 500;
    for (let i = 0; i < rowsToUpsert.length; i += CHUNK) {
      const slice = rowsToUpsert.slice(i, i + CHUNK);
      await db.insert(sheetWellStatus).values(slice);
    }
  }

  return {
    rowsScanned: grid.length,
    cellsScanned,
    cellsPainted,
    byStatus,
    rowsUpserted: rowsToUpsert.length,
  };
}

// Static export of the legend so the UI can render the painted-key panel
// using the exact hex values v2 ingests against.
export function getColorLegend(): Array<{
  hex: string;
  status: WorkflowStatus;
  label: string;
}> {
  return HEX_TO_STATUS.map((e) => ({
    hex: e.hex,
    status: e.status,
    label: e.label,
  }));
}
