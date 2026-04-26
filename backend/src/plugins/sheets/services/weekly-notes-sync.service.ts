/**
 * Weekly Notes Sync — pulls per-week human metadata from the Load Count
 * Sheet's Notes section. The team writes these at the bottom of each
 * weekly tab on Friday/Saturday explaining anomalies (e.g., "Bulk loads
 * finalize Monday", "Equipment moves waiting on ATMZ billing").
 *
 * Detection heuristic: walk down the tab until we find a row whose first
 * non-empty cell starts with "Notes" or "Note:" or contains "Notes:".
 * Subsequent non-blank rows below that header are the notes body until
 * either: blank-row run of 3+, or end of tab.
 *
 * Idempotent on (spreadsheet, tab, week_start).
 */

import { eq, and } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import { weeklyNotes } from "../../../db/schema.js";
import { google } from "googleapis";
import { getGoogleAuth } from "./sheets.service.js";

interface SyncOptions {
  spreadsheetId: string;
  tabName: string;
  weekStart: string;
}

export interface WeeklyNotesSyncResult {
  found: boolean;
  rowIndex: number | null;
  body: string | null;
  upserted: boolean;
}

const NOTES_HEADER_RE = /^\s*notes?\s*[:\-]?\s*$/i;

export async function syncWeeklyNotes(
  db: Database,
  opts: SyncOptions,
): Promise<WeeklyNotesSyncResult> {
  const auth = await getGoogleAuth();
  const sheetsApi = google.sheets({ version: "v4", auth });

  // Pull the full tab as values; notes can be anywhere from row 30 down.
  const range = `'${opts.tabName.replace(/'/g, "''")}'!A1:F200`;
  const data = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: opts.spreadsheetId,
    range,
  });
  const rows = data.data.values ?? [];

  // Find the Notes header row
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const firstCell = (rows[i]?.[0] ?? "").toString().trim();
    if (NOTES_HEADER_RE.test(firstCell)) {
      headerIdx = i;
      break;
    }
    // Also tolerate "Notes:" inline at the start of a longer string
    if (firstCell.toLowerCase().startsWith("notes:")) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) {
    return { found: false, rowIndex: null, body: null, upserted: false };
  }

  // Collect lines until 3-blank-row gap or end
  const lines: string[] = [];
  let blankRun = 0;
  // If the header row itself contains content after "Notes:", grab it
  const headerRow = rows[headerIdx] ?? [];
  const headerInline = (headerRow.join(" ") ?? "")
    .replace(/^\s*notes?\s*[:\-]?\s*/i, "")
    .trim();
  if (headerInline) lines.push(headerInline);

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const joined = row.join(" ").trim();
    if (!joined) {
      blankRun++;
      if (blankRun >= 3) break;
      continue;
    }
    blankRun = 0;
    lines.push(joined);
  }

  const body = lines.join("\n").trim();
  if (!body) {
    return { found: true, rowIndex: headerIdx, body: null, upserted: false };
  }

  // Upsert
  const existing = await db
    .select({ id: weeklyNotes.id })
    .from(weeklyNotes)
    .where(
      and(
        eq(weeklyNotes.spreadsheetId, opts.spreadsheetId),
        eq(weeklyNotes.sheetTabName, opts.tabName),
        eq(weeklyNotes.weekStart, opts.weekStart),
      ),
    );

  if (existing.length > 0) {
    await db
      .update(weeklyNotes)
      .set({ body, rowIndex: headerIdx, capturedAt: new Date() })
      .where(eq(weeklyNotes.id, existing[0].id));
  } else {
    await db.insert(weeklyNotes).values({
      spreadsheetId: opts.spreadsheetId,
      sheetTabName: opts.tabName,
      weekStart: opts.weekStart,
      body,
      rowIndex: headerIdx,
    });
  }

  return { found: true, rowIndex: headerIdx, body, upserted: true };
}
