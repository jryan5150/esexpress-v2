/**
 * Manual Load Creation — for JotForm submissions where no PropX/Logistiq
 * load exists. Drivers like Fernando Herrera who run loads dispatched
 * outside both systems still upload photos to JotForm; this service
 * creates a `source='manual'` load record from that submission so the
 * photo, driver, BOL, and date all live in v2 like any other load.
 *
 * Discovered 2026-04-25 morning: ~600 pending JotForm submissions are
 * for loads from a third dispatch source we don't ingest. Operator
 * confirmed these are manual loads. This is the closing-the-loop fix.
 */

import { and, eq, sql } from "drizzle-orm";
import {
  assignments,
  jotformImports,
  loads,
  photos,
} from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";

interface CreateOpts {
  importId: number;
  // Optional overrides — operator can supply them via the UI form,
  // otherwise we use sensible defaults from the JotForm submission.
  loadNo?: string;
  weightTons?: string;
  deliveredOn?: string; // ISO date
  destinationName?: string;
  carrierName?: string;
  actorId: number;
  actorName: string;
  // Force-create even if pre-flight finds a possible match. Operator
  // must explicitly opt in after reviewing the candidates we surface.
  force?: boolean;
}

interface CreateResult {
  loadId: number;
  loadNo: string;
  bolNo: string | null;
  importId: number;
  photoUrls: string[];
}

interface MatchCandidate {
  loadId: number;
  loadNo: string;
  source: string;
  bolNo: string | null;
  ticketNo: string | null;
  driverName: string | null;
  deliveredOn: string | null;
  matchReason: string;
}

interface PreflightResult {
  ok: boolean; // true = safe to create, false = candidates found
  candidates: MatchCandidate[];
}

/**
 * Pre-flight check before creating a manual load. Looks for any
 * existing load that COULD be the same load — exact BOL/ticket
 * match (case-insensitive), raw_data nested matches (PropX
 * sand_ticket_no, Logistiq bol), and same driver+truck+date
 * fuzzy candidates. Returns `ok: true` only when nothing plausible
 * exists. Operator must review candidates and either match-to-existing
 * via ManualMatchPanel OR pass `force: true` to manual-create anyway.
 */
export async function preflightManualCreate(
  db: Database,
  importId: number,
): Promise<PreflightResult> {
  const [imp] = await db
    .select()
    .from(jotformImports)
    .where(eq(jotformImports.id, importId))
    .limit(1);
  if (!imp) {
    throw new Error(`JotForm import ${importId} not found`);
  }

  const bol = imp.bolNo;
  const candidates: MatchCandidate[] = [];

  if (bol) {
    // 1. Direct case-insensitive match on bol_no or ticket_no
    const exactRows = await db.execute<{
      id: number;
      load_no: string;
      source: string;
      bol_no: string | null;
      ticket_no: string | null;
      driver_name: string | null;
      delivered_on: string | null;
    }>(sql`
      SELECT id, load_no, source, bol_no, ticket_no, driver_name, delivered_on::text
      FROM loads
      WHERE LOWER(bol_no) = LOWER(${bol})
         OR LOWER(ticket_no) = LOWER(${bol})
      LIMIT 5
    `);
    for (const row of (
      exactRows as unknown as { rows?: Array<Record<string, unknown>> }
    ).rows ?? (exactRows as unknown as Array<Record<string, unknown>>)) {
      candidates.push({
        loadId: row.id as number,
        loadNo: row.load_no as string,
        source: row.source as string,
        bolNo: (row.bol_no as string) ?? null,
        ticketNo: (row.ticket_no as string) ?? null,
        driverName: (row.driver_name as string) ?? null,
        deliveredOn: (row.delivered_on as string) ?? null,
        matchReason: "exact BOL/ticket match",
      });
    }

    // 2. raw_data nested match (PropX sand_ticket_no, Logistiq bol)
    const rawRows = await db.execute<{
      id: number;
      load_no: string;
      source: string;
      bol_no: string | null;
      ticket_no: string | null;
      driver_name: string | null;
      delivered_on: string | null;
    }>(sql`
      SELECT id, load_no, source, bol_no, ticket_no, driver_name, delivered_on::text
      FROM loads
      WHERE raw_data->>'sand_ticket_no' = ${bol}
         OR raw_data->>'bol' = ${bol}
         OR raw_data->>'ticket_no' = ${bol}
      LIMIT 5
    `);
    for (const row of (
      rawRows as unknown as { rows?: Array<Record<string, unknown>> }
    ).rows ?? (rawRows as unknown as Array<Record<string, unknown>>)) {
      const id = row.id as number;
      if (candidates.some((c) => c.loadId === id)) continue; // dedupe
      candidates.push({
        loadId: id,
        loadNo: row.load_no as string,
        source: row.source as string,
        bolNo: (row.bol_no as string) ?? null,
        ticketNo: (row.ticket_no as string) ?? null,
        driverName: (row.driver_name as string) ?? null,
        deliveredOn: (row.delivered_on as string) ?? null,
        matchReason: "BOL found in raw_data (matcher missed it)",
      });
    }

    // 2.5. PCS-known check — if PCS sees this ticket on a load we don't
    //      have, surface that. Operator's pushback 2026-04-25: "the
    //      matcher should check the system that historical loads would
    //      already be in." PCS is that system.
    const pcsRows = await db.execute<{
      pcs_load_id: string;
      shipper_ticket: string | null;
      load_reference: string | null;
      pcs_status: string | null;
      shipper_company: string | null;
      consignee_company: string | null;
      pickup_date: string | null;
      division: string | null;
    }>(sql`
      SELECT pcs_load_id, shipper_ticket, load_reference, pcs_status,
             shipper_company, consignee_company, pickup_date, division
      FROM pcs_known_tickets
      WHERE shipper_ticket = ${bol}
      LIMIT 5
    `);
    for (const row of (
      pcsRows as unknown as { rows?: Array<Record<string, unknown>> }
    ).rows ?? (pcsRows as unknown as Array<Record<string, unknown>>)) {
      // No v2 loadId — this is a PCS-side load. Use negative id as
      // a sentinel so frontend can tell "v2 candidate" from
      // "PCS-only candidate." Operator action differs.
      candidates.push({
        loadId: -1 * Number(row.pcs_load_id),
        loadNo: `PCS#${row.pcs_load_id}`,
        source: `pcs:${row.division ?? "?"}`,
        bolNo: (row.load_reference as string) ?? null,
        ticketNo: (row.shipper_ticket as string) ?? null,
        driverName: null,
        deliveredOn: (row.pickup_date as string) ?? null,
        matchReason: `PCS knows this ticket (${row.shipper_company ?? "?"} → ${row.consignee_company ?? "?"}, status=${row.pcs_status ?? "?"})`,
      });
    }
  }

  // 3. Same driver + same date (±1 day) + no ticket match — possible typo
  if (imp.driverName && imp.submittedAt) {
    const submittedDate = imp.submittedAt.toISOString().slice(0, 10);
    const sameDriverRows = await db.execute<{
      id: number;
      load_no: string;
      source: string;
      bol_no: string | null;
      ticket_no: string | null;
      driver_name: string | null;
      delivered_on: string | null;
    }>(sql`
      SELECT id, load_no, source, bol_no, ticket_no, driver_name, delivered_on::text
      FROM loads
      WHERE driver_name = ${imp.driverName}
        AND delivered_on::date BETWEEN (${submittedDate}::date - INTERVAL '1 day')
                                  AND (${submittedDate}::date + INTERVAL '1 day')
      LIMIT 5
    `);
    for (const row of (
      sameDriverRows as unknown as { rows?: Array<Record<string, unknown>> }
    ).rows ?? (sameDriverRows as unknown as Array<Record<string, unknown>>)) {
      const id = row.id as number;
      if (candidates.some((c) => c.loadId === id)) continue;
      candidates.push({
        loadId: id,
        loadNo: row.load_no as string,
        source: row.source as string,
        bolNo: (row.bol_no as string) ?? null,
        ticketNo: (row.ticket_no as string) ?? null,
        driverName: (row.driver_name as string) ?? null,
        deliveredOn: (row.delivered_on as string) ?? null,
        matchReason: "same driver + ±1 day (possible typo)",
      });
    }
  }

  return {
    ok: candidates.length === 0,
    candidates,
  };
}

/**
 * Build a sensible synthetic load_no for a manual load. Format:
 *   M-{YYYYMMDD}-{importId} → e.g. M-20260424-4915
 * Operator can override via opts.loadNo.
 */
function defaultLoadNo(submittedAt: Date | null, importId: number): string {
  const d = submittedAt ?? new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `M-${y}${m}${day}-${importId}`;
}

/**
 * Custom error type carrying preflight candidates so the route layer
 * can return them as a 409 with structured details.
 */
export class ManualCreateBlockedError extends Error {
  candidates: MatchCandidate[];
  constructor(candidates: MatchCandidate[]) {
    super(
      `Cannot manual-create — ${candidates.length} possible match(es) exist; pass force=true to override after review`,
    );
    this.name = "ManualCreateBlockedError";
    this.candidates = candidates;
  }
}

export async function createManualLoadFromJotform(
  db: Database,
  opts: CreateOpts,
): Promise<CreateResult> {
  // 0. Pre-flight — refuse to create if a possible existing match exists,
  //    UNLESS the operator has explicitly passed force=true after reviewing
  //    the candidates surfaced. Trust contract: never silently mint a
  //    duplicate load over an existing one.
  if (!opts.force) {
    const pre = await preflightManualCreate(db, opts.importId);
    if (!pre.ok) {
      throw new ManualCreateBlockedError(pre.candidates);
    }
  }

  // 1. Fetch the JotForm submission
  const [imp] = await db
    .select()
    .from(jotformImports)
    .where(eq(jotformImports.id, opts.importId))
    .limit(1);
  if (!imp) {
    throw new Error(`JotForm import ${opts.importId} not found`);
  }
  if (imp.matchedLoadId) {
    throw new Error(
      `JotForm import ${opts.importId} is already matched to load ${imp.matchedLoadId}`,
    );
  }

  // 2. Build the manual load
  const loadNo = opts.loadNo ?? defaultLoadNo(imp.submittedAt, imp.id);
  const sourceId = `jotform-import-${imp.id}`;
  const deliveredOn = opts.deliveredOn
    ? new Date(opts.deliveredOn).toISOString()
    : (imp.submittedAt?.toISOString() ?? new Date().toISOString());

  const [newLoad] = await db
    .insert(loads)
    .values({
      loadNo,
      source: "manual",
      sourceId,
      driverName: imp.driverName,
      truckNo: imp.truckNo,
      bolNo: imp.bolNo,
      ticketNo: imp.bolNo, // ticket# = BOL on JotForm — they're the same value
      weightTons: opts.weightTons ?? imp.weight ?? null,
      destinationName: opts.destinationName ?? null,
      carrierName: opts.carrierName ?? "ES Express LLC",
      deliveredOn: sql`${deliveredOn}::timestamptz`,
      historicalComplete: false,
      rawData: {
        manualSource: "jotform-orphan",
        importedFrom: imp.id,
        createdBy: opts.actorName,
        createdById: opts.actorId,
        originalSubmission: {
          submissionId: imp.jotformSubmissionId,
          submittedAt: imp.submittedAt?.toISOString() ?? null,
          driverName: imp.driverName,
          truckNo: imp.truckNo,
          bolNo: imp.bolNo,
        },
      },
    })
    .returning({
      id: loads.id,
      loadNo: loads.loadNo,
      bolNo: loads.bolNo,
    });

  if (!newLoad) {
    throw new Error("Failed to create manual load (no row returned)");
  }

  // 3. Attach the JotForm photo(s) to the new load
  const photoUrls: string[] = [];
  if (imp.photoUrl) photoUrls.push(imp.photoUrl);
  for (const u of imp.imageUrls ?? []) {
    if (u && !photoUrls.includes(u)) photoUrls.push(u);
  }
  if (photoUrls.length > 0) {
    await db.insert(photos).values(
      photoUrls.map((url) => ({
        loadId: newLoad.id,
        source: "jotform" as const,
        sourceUrl: url,
        type: "weight_ticket" as const,
        ticketNo: imp.bolNo ?? null,
        driverName: imp.driverName,
      })),
    );
  }

  // 4. Mark the JotForm submission as matched
  await db
    .update(jotformImports)
    .set({
      matchedLoadId: newLoad.id,
      matchMethod: "manual_create",
      matchedAt: sql`now()`,
      status: "matched",
    })
    .where(eq(jotformImports.id, opts.importId));

  // 5. If an unassigned assignment exists for this load, mark its
  //    photoStatus='attached'. Manual loads typically don't have an
  //    assignment yet (no auto-mapper run), but if one was created
  //    inline (e.g. via WellPicker) we still want to flip it.
  await db
    .update(assignments)
    .set({ photoStatus: "attached" })
    .where(
      and(
        eq(assignments.loadId, newLoad.id),
        sql`${assignments.photoStatus} IN ('pending','missing') OR ${assignments.photoStatus} IS NULL`,
      ),
    );

  return {
    loadId: newLoad.id,
    loadNo: newLoad.loadNo,
    bolNo: newLoad.bolNo,
    importId: opts.importId,
    photoUrls,
  };
}
