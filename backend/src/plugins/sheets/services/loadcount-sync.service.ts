/**
 * Load Count Sheet Sync — Track 4.2
 * ====================================
 *
 * Periodically reads the team's "Load Count Sheet - Daily (Billing)" Google
 * Sheet and snapshots their per-week, per-well counts into v2 so we can
 * compare against v2's own ingest. This is the truth-side feed for the
 * sheet-vs-v2 parity surface.
 *
 * Source sheet:
 *   id  = 1ZBzcSEFRfX8J6x0wj_836xnGwzgCSSVFe7QU2SRgtQM
 *   tabs read on each pass: 'Current' + 'Previous' (rolling 14 days)
 *   tabs read on backfill:  any 'WK of M/D/YY' tab matching the cutoff
 *
 * Tab structure (from 2026-04-25 recon, see docs/2026-04-25-load-count-sheet-analysis.md):
 *   Row 1 (header)  : ['', '', date1..date7, ..., 'Loads left over', ...]
 *   Row 2 (day labels): ['Well Name', 'Bill To', 'Sunday', ..., 'Saturday', ...]
 *   Row 3+ (data rows): per-well per-day load counts + week total + status hint
 *   Bottom row 'Balance Total:': week aggregate with discrepancy
 *
 * Status lives in CELL COLOR not value (see analysis doc §1). Phase 1 reads
 * values only; color reading via includeGridData is Phase 2.
 */

import { eq, and, sql, isNull } from "drizzle-orm";
import { sheetLoadCountSnapshots } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";
import { inspectSheet, type SheetTabInspection } from "./sheets.service.js";

export const LOAD_COUNT_SHEET_ID =
  "1ZBzcSEFRfX8J6x0wj_836xnGwzgCSSVFe7QU2SRgtQM";

const ROLLING_TABS = ["Current", "Previous"] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedLoadCountRow {
  wellName: string | null; // null on the Balance Total aggregate row
  billTo: string | null;
  sunCount: number | null;
  monCount: number | null;
  tueCount: number | null;
  wedCount: number | null;
  thuCount: number | null;
  friCount: number | null;
  satCount: number | null;
  weekTotal: number | null;
  loadsLeftOver: number | null;
  loadsForWeek: number | null;
  missedLoad: number | null;
  totalToBuild: number | null;
  totalBuilt: number | null;
  discrepancy: number | null;
  statusColorHint: string | null; // text echo of legend if present in row
  rawRow: string[];
}

export interface ParsedLoadCountTab {
  tabName: string;
  weekStart: string; // 'YYYY-MM-DD' (Sunday)
  weekEnd: string; // 'YYYY-MM-DD' (Saturday)
  rows: ParsedLoadCountRow[];
}

export interface SnapshotSyncResult {
  spreadsheetId: string;
  tabsScanned: number;
  rowsUpserted: number;
  weekStarts: string[];
  errors: Array<{ tab: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Header parsing — extract week start/end from the date row
// ---------------------------------------------------------------------------

const STATUS_LEGEND_HINTS = new Set([
  "missing tickets/ not arrived",
  "missing tickets/not arrived",
  "missing driver",
  "loads being built",
  "loads completed/ load count complete",
  "loads completed/load count complete",
  "loads being cleared",
  "loads cleared",
  "export (transfers) completed",
  "need well rate info / new loading facility rate",
  "invoiced",
]);

/**
 * Parse a "MM/DD" or "M/D" cell value into an ISO date for the given year.
 * Falls back to current year if year is omitted.
 */
function parseShortDate(
  cell: string,
  year = new Date().getFullYear(),
): Date | null {
  const m = cell.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return null;
  const month = parseInt(m[1], 10) - 1;
  const day = parseInt(m[2], 10);
  let y = year;
  if (m[3]) {
    y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
  }
  return new Date(Date.UTC(y, month, day));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIntOrNull(cell: string | undefined): number | null {
  if (cell == null) return null;
  const trimmed = cell.trim();
  if (trimmed === "" || trimmed === "·") return null;
  const n = parseInt(trimmed.replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Find the date columns in the header row. Returns the array index of the
 * Sunday cell (or earliest weekday) and the inferred week start/end dates.
 */
function locateWeekFromHeader(
  headerRow: string[],
): { sundayIndex: number; weekStart: string; weekEnd: string } | null {
  // Scan first 12 cells for date-shaped values
  const dateCells: Array<{ idx: number; date: Date }> = [];
  for (let i = 0; i < Math.min(12, headerRow.length); i++) {
    const d = parseShortDate(headerRow[i] ?? "");
    if (d) dateCells.push({ idx: i, date: d });
  }
  if (dateCells.length < 2) return null;
  const earliest = dateCells[0];
  const latest = dateCells[dateCells.length - 1];
  return {
    sundayIndex: earliest.idx,
    weekStart: isoDate(earliest.date),
    weekEnd: isoDate(latest.date),
  };
}

// ---------------------------------------------------------------------------
// Tab parser — turns raw 2-D row data into structured ParsedLoadCountRow[]
// ---------------------------------------------------------------------------

export function parseLoadCountTab(
  tab: SheetTabInspection,
): ParsedLoadCountTab | null {
  const allRows: string[][] = [tab.headers, ...tab.sampleRows];
  if (allRows.length < 2) return null;

  const headerRow = allRows[0] ?? [];
  const weekInfo = locateWeekFromHeader(headerRow);
  if (!weekInfo) return null;

  const sundayIdx = weekInfo.sundayIndex;
  const wellNameIdx = 0;
  const billToIdx = 1;
  // Status column is typically immediately after the week-total cell at sundayIdx+7
  // and before the trailing summary columns. We search loosely.

  // Locate summary columns by scanning header row for known labels
  const findCol = (label: string): number => {
    const target = label.toLowerCase();
    return headerRow.findIndex(
      (cell) => (cell ?? "").toLowerCase().trim() === target,
    );
  };
  const colLoadsLeftOver = findCol("Loads left over");
  const colLoadsForWeek = findCol("Loads for the work week");
  const colMissedLoad = findCol("Missed load");
  const colTotalToBuild = findCol("Total to build");
  const colTotalBuilt = findCol("Total Built");
  const colDiscrepancy = findCol("Discrepancy");

  const out: ParsedLoadCountRow[] = [];

  // ROW 1 (day-of-week label row) doubles as the WEEKLY SUMMARY row —
  // cols P-U on this row hold Loads left over / Loads for week / Missed
  // load / Total to build / Total Built / Discrepancy. Extract first.
  const dayLabelRow = allRows[1] ?? [];
  const summaryFromDayLabel: ParsedLoadCountRow = {
    wellName: null,
    billTo: null,
    sunCount: null,
    monCount: null,
    tueCount: null,
    wedCount: null,
    thuCount: null,
    friCount: null,
    satCount: null,
    weekTotal: null,
    loadsLeftOver:
      colLoadsLeftOver >= 0
        ? parseIntOrNull(dayLabelRow[colLoadsLeftOver])
        : null,
    loadsForWeek:
      colLoadsForWeek >= 0
        ? parseIntOrNull(dayLabelRow[colLoadsForWeek])
        : null,
    missedLoad:
      colMissedLoad >= 0 ? parseIntOrNull(dayLabelRow[colMissedLoad]) : null,
    totalToBuild:
      colTotalToBuild >= 0
        ? parseIntOrNull(dayLabelRow[colTotalToBuild])
        : null,
    totalBuilt:
      colTotalBuilt >= 0 ? parseIntOrNull(dayLabelRow[colTotalBuilt]) : null,
    discrepancy:
      colDiscrepancy >= 0 ? parseIntOrNull(dayLabelRow[colDiscrepancy]) : null,
    statusColorHint: null,
    rawRow: dayLabelRow,
  };
  // Only emit the weekly summary if it has at least one populated value
  if (
    summaryFromDayLabel.totalBuilt != null ||
    summaryFromDayLabel.totalToBuild != null ||
    summaryFromDayLabel.discrepancy != null
  ) {
    out.push(summaryFromDayLabel);
  }

  // Per-well data rows from row 2 onward
  for (let i = 2; i < allRows.length; i++) {
    const row = allRows[i] ?? [];
    const wellName = (row[wellNameIdx] ?? "").trim() || null;
    if (!wellName) continue;
    // Stop when we hit blank/separator rows or the Jenny queue header
    if (
      wellName.toLowerCase().startsWith("other jobs to be invoiced") ||
      wellName.toLowerCase().startsWith("truck pushers") ||
      wellName.toLowerCase().startsWith("order of invoicing")
    )
      break;

    const billTo = (row[billToIdx] ?? "").trim() || null;
    const sun = parseIntOrNull(row[sundayIdx]);
    const mon = parseIntOrNull(row[sundayIdx + 1]);
    const tue = parseIntOrNull(row[sundayIdx + 2]);
    const wed = parseIntOrNull(row[sundayIdx + 3]);
    const thu = parseIntOrNull(row[sundayIdx + 4]);
    const fri = parseIntOrNull(row[sundayIdx + 5]);
    const sat = parseIntOrNull(row[sundayIdx + 6]);
    const weekTotal = parseIntOrNull(row[sundayIdx + 7]);

    // Look for status hint anywhere right of the week total
    let statusHint: string | null = null;
    for (let c = sundayIdx + 8; c < row.length; c++) {
      const cell = (row[c] ?? "").trim();
      if (cell && STATUS_LEGEND_HINTS.has(cell.toLowerCase())) {
        statusHint = cell;
        break;
      }
    }

    const isBalanceRow =
      wellName.toLowerCase() === "balance" ||
      (billTo ?? "").toLowerCase() === "total:";
    // Skip the per-day "Balance | Total:" row — its summary cols are blank
    // and the truth weekly summary already came from row 1 above.
    if (isBalanceRow) continue;

    out.push({
      wellName,
      billTo,
      sunCount: sun,
      monCount: mon,
      tueCount: tue,
      wedCount: wed,
      thuCount: thu,
      friCount: fri,
      satCount: sat,
      weekTotal,
      loadsLeftOver: null,
      loadsForWeek: null,
      missedLoad: null,
      totalToBuild: null,
      totalBuilt: null,
      discrepancy: null,
      statusColorHint: statusHint,
      rawRow: row,
    });
  }

  return {
    tabName: tab.name,
    weekStart: weekInfo.weekStart,
    weekEnd: weekInfo.weekEnd,
    rows: out,
  };
}

// ---------------------------------------------------------------------------
// Top-level sync — fetch both rolling tabs, parse, upsert
// ---------------------------------------------------------------------------

export async function syncLoadCountSheet(
  db: Database,
  options?: { tabs?: string[]; sampleRows?: number; spreadsheetId?: string },
): Promise<SnapshotSyncResult> {
  const spreadsheetId = options?.spreadsheetId ?? LOAD_COUNT_SHEET_ID;
  const tabsToScan: string[] = options?.tabs ?? [...ROLLING_TABS];
  const sampleRows = options?.sampleRows ?? 50;

  const result: SnapshotSyncResult = {
    spreadsheetId,
    tabsScanned: 0,
    rowsUpserted: 0,
    weekStarts: [],
    errors: [],
  };

  // Pull all tabs in one inspect call (already done via inspectSheet)
  const inspection = await inspectSheet(spreadsheetId, sampleRows);
  const tabsByName = new Map(inspection.tabs.map((t) => [t.name, t]));

  for (const tabName of tabsToScan) {
    const tab = tabsByName.get(tabName);
    if (!tab) {
      result.errors.push({
        tab: tabName,
        error: "tab not found in inspection",
      });
      continue;
    }
    result.tabsScanned++;

    let parsed: ParsedLoadCountTab | null;
    try {
      parsed = parseLoadCountTab(tab);
    } catch (err) {
      result.errors.push({
        tab: tabName,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if (!parsed) {
      result.errors.push({ tab: tabName, error: "could not parse tab" });
      continue;
    }

    if (!result.weekStarts.includes(parsed.weekStart))
      result.weekStarts.push(parsed.weekStart);

    // Upsert each row — unique on (spreadsheet_id, sheet_tab_name, week_start, well_name)
    for (const row of parsed.rows) {
      // Drizzle's onConflictDoUpdate doesn't tolerate a NULL well_name in the
      // unique constraint cleanly. For the Balance row (well_name = null), use
      // a pre-check + delete-then-insert pattern keyed on (sid, tab, week, NULL).
      if (row.wellName == null) {
        await db
          .delete(sheetLoadCountSnapshots)
          .where(
            and(
              eq(sheetLoadCountSnapshots.spreadsheetId, spreadsheetId),
              eq(sheetLoadCountSnapshots.sheetTabName, parsed.tabName),
              eq(sheetLoadCountSnapshots.weekStart, parsed.weekStart),
              sql`${sheetLoadCountSnapshots.wellName} IS NULL`,
            ),
          );
      }
      await db
        .insert(sheetLoadCountSnapshots)
        .values({
          spreadsheetId,
          sheetTabName: parsed.tabName,
          weekStart: parsed.weekStart,
          weekEnd: parsed.weekEnd,
          wellName: row.wellName,
          billTo: row.billTo,
          sunCount: row.sunCount,
          monCount: row.monCount,
          tueCount: row.tueCount,
          wedCount: row.wedCount,
          thuCount: row.thuCount,
          friCount: row.friCount,
          satCount: row.satCount,
          weekTotal: row.weekTotal,
          loadsLeftOver: row.loadsLeftOver,
          loadsForWeek: row.loadsForWeek,
          missedLoad: row.missedLoad,
          totalToBuild: row.totalToBuild,
          totalBuilt: row.totalBuilt,
          discrepancy: row.discrepancy,
          statusColorHint: row.statusColorHint,
          rawRow: row.rawRow,
        })
        .onConflictDoUpdate({
          target: [
            sheetLoadCountSnapshots.spreadsheetId,
            sheetLoadCountSnapshots.sheetTabName,
            sheetLoadCountSnapshots.weekStart,
            sheetLoadCountSnapshots.wellName,
          ],
          set: {
            weekEnd: parsed.weekEnd,
            billTo: row.billTo,
            sunCount: row.sunCount,
            monCount: row.monCount,
            tueCount: row.tueCount,
            wedCount: row.wedCount,
            thuCount: row.thuCount,
            friCount: row.friCount,
            satCount: row.satCount,
            weekTotal: row.weekTotal,
            loadsLeftOver: row.loadsLeftOver,
            loadsForWeek: row.loadsForWeek,
            missedLoad: row.missedLoad,
            totalToBuild: row.totalToBuild,
            totalBuilt: row.totalBuilt,
            discrepancy: row.discrepancy,
            statusColorHint: row.statusColorHint,
            rawRow: row.rawRow,
            capturedAt: new Date(),
          },
        });
      result.rowsUpserted++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Comparison — sheet snapshot vs v2 actual ingest, write discrepancies
// ---------------------------------------------------------------------------

import {
  loads as loadsTable,
  discrepancies as discrepanciesTable,
} from "../../../db/schema.js";

const WEEK_DELTA_THRESHOLD = 5; // |sheet_total_built - v2_unique_count| > 5 -> discrepancy

export interface WeekParityRow {
  spreadsheetId: string;
  sheetTabName: string;
  weekStart: string;
  weekEnd: string;
  sheetTotalBuilt: number | null;
  sheetExpectedToBuild: number | null;
  sheetDiscrepancy: number | null;
  v2RawCount: number;
  v2UniqueCount: number; // dedup-corrected estimate
  delta: number; // v2UniqueCount - sheetTotalBuilt
  withinThreshold: boolean;
  capturedAt: Date | null;
}

/**
 * For each captured snapshot week (Balance row), count v2 loads with
 * delivered_on in that window and compute the delta vs Total Built.
 *
 * Dedup correction uses the same bolNo/ticketNo + driver+15min logic as
 * /diag/week-classify so the sheet-vs-v2 comparison is apples-to-apples.
 */
export async function computeWeekParity(
  db: Database,
  options?: { spreadsheetId?: string },
): Promise<WeekParityRow[]> {
  const spreadsheetId = options?.spreadsheetId ?? LOAD_COUNT_SHEET_ID;

  // Pull every Balance-row snapshot (well_name IS NULL) for this spreadsheet
  const snapshots = await db
    .select()
    .from(sheetLoadCountSnapshots)
    .where(
      and(
        eq(sheetLoadCountSnapshots.spreadsheetId, spreadsheetId),
        sql`${sheetLoadCountSnapshots.wellName} IS NULL`,
      ),
    );

  const out: WeekParityRow[] = [];

  for (const snap of snapshots) {
    const fromTs = `${snap.weekStart}T00:00:00-05:00`;
    const toTs = `${snap.weekEnd}T23:59:59.999-05:00`;

    // Pull all loads in the window — need bolNo/ticketNo/driverName/deliveredOn
    // for the dedup pass.
    const rows = await db
      .select({
        id: loadsTable.id,
        bolNo: loadsTable.bolNo,
        ticketNo: loadsTable.ticketNo,
        driverName: loadsTable.driverName,
        deliveredOn: loadsTable.deliveredOn,
      })
      .from(loadsTable)
      .where(
        sql`${loadsTable.deliveredOn} >= ${fromTs}::timestamptz AND ${loadsTable.deliveredOn} <= ${toTs}::timestamptz`,
      );

    const rawCount = rows.length;

    // Dedup: same bolNo OR ticketNo OR same driver+15min bucket
    const seenKeys = new Set<string>();
    let uniqueCount = 0;
    for (const r of rows) {
      const bol = (r.bolNo ?? "").trim().toLowerCase();
      const ticket = (r.ticketNo ?? "").trim().toLowerCase();
      const driver = (r.driverName ?? "").trim().toLowerCase();
      const ms = r.deliveredOn?.getTime() ?? 0;
      const bucket = Math.floor(ms / (15 * 60 * 1000));

      const keys = [
        bol ? `bol:${bol}` : null,
        ticket ? `tk:${ticket}` : null,
        driver && bucket ? `dt:${driver}|${bucket}` : null,
      ].filter(Boolean) as string[];

      // If ANY key already seen, treat as duplicate
      if (keys.some((k) => seenKeys.has(k))) continue;
      for (const k of keys) seenKeys.add(k);
      uniqueCount++;
    }

    const sheetTotal = snap.totalBuilt ?? null;
    const delta = sheetTotal != null ? uniqueCount - sheetTotal : 0;
    const withinThreshold =
      sheetTotal == null || Math.abs(delta) <= WEEK_DELTA_THRESHOLD;

    out.push({
      spreadsheetId,
      sheetTabName: snap.sheetTabName,
      weekStart: snap.weekStart,
      weekEnd: snap.weekEnd,
      sheetTotalBuilt: sheetTotal,
      sheetExpectedToBuild: snap.totalToBuild ?? null,
      sheetDiscrepancy: snap.discrepancy ?? null,
      v2RawCount: rawCount,
      v2UniqueCount: uniqueCount,
      delta,
      withinThreshold,
      capturedAt: snap.capturedAt,
    });

    // Write discrepancy row if outside threshold and we have a sheet baseline
    if (!withinThreshold && sheetTotal != null) {
      const subjectKey = `sheet-week:${spreadsheetId}:${snap.weekStart}`;
      const severity =
        Math.abs(delta) > 50
          ? "critical"
          : Math.abs(delta) > 20
            ? "warning"
            : "info";
      const message =
        delta > 0
          ? `v2 has ${uniqueCount} unique loads vs sheet's ${sheetTotal} built — v2 may have ${delta} extra (over-ingest, missed cancellations, or sheet under-count).`
          : `v2 has ${uniqueCount} unique loads vs sheet's ${sheetTotal} built — sheet has ${Math.abs(delta)} more (v2 under-ingest, missed sources, or sheet over-count).`;

      await db
        .insert(discrepanciesTable)
        .values({
          subjectKey,
          discrepancyType: "sheet_vs_v2_week_count",
          severity,
          v2Value: String(uniqueCount),
          pcsValue: String(sheetTotal),
          message,
          metadata: {
            weekStart: snap.weekStart,
            weekEnd: snap.weekEnd,
            sheetTab: snap.sheetTabName,
            v2RawCount: rawCount,
            v2UniqueCount: uniqueCount,
            sheetTotalBuilt: sheetTotal,
            sheetExpectedToBuild: snap.totalToBuild,
            sheetDiscrepancyOnTheirSide: snap.discrepancy,
            delta,
            threshold: WEEK_DELTA_THRESHOLD,
          },
        })
        .onConflictDoUpdate({
          target: [
            discrepanciesTable.subjectKey,
            discrepanciesTable.discrepancyType,
          ],
          targetWhere: isNull(discrepanciesTable.resolvedAt),
          set: {
            v2Value: String(uniqueCount),
            pcsValue: String(sheetTotal),
            message,
            severity,
            metadata: {
              weekStart: snap.weekStart,
              weekEnd: snap.weekEnd,
              sheetTab: snap.sheetTabName,
              v2RawCount: rawCount,
              v2UniqueCount: uniqueCount,
              sheetTotalBuilt: sheetTotal,
              sheetExpectedToBuild: snap.totalToBuild,
              sheetDiscrepancyOnTheirSide: snap.discrepancy,
              delta,
              threshold: WEEK_DELTA_THRESHOLD,
            },
            lastSeenAt: new Date(),
          },
        });
    }
  }

  return out;
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
    name: "sheet-loadcount-sync",
    status: "healthy",
    stats: {
      sheetId: LOAD_COUNT_SHEET_ID,
      rollingTabs: [...ROLLING_TABS],
    },
    checks: [
      {
        name: "sheet-id-configured",
        ok: !!LOAD_COUNT_SHEET_ID,
        detail: LOAD_COUNT_SHEET_ID,
      },
    ],
  };
}
