/**
 * PCS Sync — read PCS GetLoads and reconcile against v2 assignments.
 *
 * Pulls PCS's load list (Hairpin or ES Express division per PCS_COMPANY_LTR),
 * matches each by loadReference → v2 ticket_no / load_no / bol_no, and writes
 * the PCS state onto the matching assignment's pcsSequence + pcsDispatch.
 *
 * Enables "Not in PCS yet" filter + PCS-status badges on Load Center without
 * depending on Jessica's Google Sheet — PCS is the authoritative source of
 * loads that have been billed through, so v2 can use it as a source check.
 *
 * Unmatched PCS loads (in PCS but no v2 record) are surfaced as gaps — v2 may
 * have missed ingest. These are "missed by v2" entries in the sync result.
 *
 * Validated payload shape 2026-04-22. See docs/2026-04-17-pcs-bridge-audit.md.
 */

import { eq, or, inArray, sql } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import {
  assignments,
  bolSubmissions,
  loads,
  wells,
} from "../../../db/schema.js";
import { reportError } from "../../../lib/sentry.js";
import { getAccessToken } from "./pcs-auth.service.js";
import {
  computePerLoadDiscrepancies,
  persistDiscrepancies,
  sweepOrphanDestinations,
} from "./pcs-discrepancy.service.js";

const PER_LOAD_DISCREPANCY_TYPES = [
  "status_drift",
  "weight_drift",
  "well_mismatch",
  "rate_drift",
] as const;

interface PcsRating {
  lineHaulRate?: string | number | null;
}

/**
 * Response shape from PCS GetLoads. Verified 2026-04-22 via direct API
 * calls — the generator-produced GetLoads200ResponseInner model uses
 * TitleCase keys (e.g. json['LoadReference']) while the real PCS
 * response uses camelCase (loadReference). Hand-rolled type here to
 * match the actual wire format.
 */
interface PcsLoadRow {
  loadId?: string | number;
  status?: string;
  loadClass?: string;
  loadType?: string | null;
  office?: { code?: string };
  billToId?: string;
  billToName?: string;
  loadReference?: string | null;
  reference1?: string | null;
  milesBilled?: string | number | null;
  totalWeight?: string | number | null;
  notes?: string | null;
}

/**
 * Per-load detail shape from PCS GetLoad({loadId}). Adds the `stops` array
 * which carries the shipper/consignee pair with per-stop referenceNumber
 * (paper ticket), companyName, city/state, and pickup/delivery timestamps.
 * Stops are ordered: order=1 is the Shipper, higher orders are Consignees.
 */
interface PcsStop {
  id?: string | number;
  order?: string | number;
  type?: string; // "Shipper" | "Consignee"
  referenceNumber?: string | null;
  companyName?: string | null;
  availableFrom?: string | null;
  availableTo?: string | null;
  address?: {
    city?: string;
    countrySubDivisionCode?: string;
    postalCode?: string;
    line1?: string;
  };
}
interface PcsLoadDetail extends PcsLoadRow {
  stops?: PcsStop[];
  rating?: PcsRating | null;
}

const getPcsBaseUrl = (): string =>
  process.env.PCS_BASE_URL ?? "https://api.pcssoft.com";

export interface MissedByV2Entry {
  pcsLoadId: number | string;
  loadReference: string | null;
  status: string | null;
  // Enriched from GetLoad({loadId}) stops detail — the fields that make
  // this queue actionable for Jenny. Null when the detail call fails or
  // the stop shape is unexpected.
  shipperCompany?: string | null;
  shipperTicket?: string | null;
  shipperCity?: string | null;
  consigneeCompany?: string | null;
  consigneeCity?: string | null;
  pickupDate?: string | null;
  totalWeight?: string | number | null;
  milesBilled?: string | number | null;
  // Scope-expansion signal: does v2 have a well matching the consignee?
  // When false, the load is pointing at a service line v2 isn't
  // configured for (e.g. the 163-well flywheel-discovery set).
  consigneeInV2Wells?: boolean;
  // Bridgeable signal: did we find a v2 bol_submission with matching
  // OCR-extracted ticketNo? When true, this PCS load COULD link to a
  // specific v2 load (pending a manual or promoted link step).
  matchingBolSubmissionId?: number | null;
}

export interface SyncResult {
  ranAt: string;
  fromDate: string;
  division: string; // "A" | "B"
  pcsLoadCount: number;
  matched: number;
  unmatched: number;
  missedByV2: MissedByV2Entry[];
  // Count of missed loads whose consignee company exists in v2 wells —
  // tells us how many are "bridgeable if we enrich" vs "scope gap".
  bridgeable: number;
  // Count of missed loads whose consignee is NOT in v2 wells — direct
  // input to the 163-well review queue.
  scopeGap: number;
  latencyMs: number;
}

/**
 * Match priority order: ticket_no → load_no → bol_no.
 * PCS loadReference is a single string, but v2 has three candidate columns to
 * match against because PropX and Logistiq populate different fields.
 */
async function findAssignmentByReference(
  db: Database,
  reference: string,
): Promise<Array<{ assignmentId: number; loadId: number }>> {
  const rows = await db
    .select({ assignmentId: assignments.id, loadId: loads.id })
    .from(loads)
    .innerJoin(assignments, eq(assignments.loadId, loads.id))
    .where(
      or(
        eq(loads.ticketNo, reference),
        eq(loads.loadNo, reference),
        eq(loads.bolNo, reference),
      ),
    );
  return rows;
}

/**
 * Fetch one PCS load's full detail (stops, rating, addresses). Used to
 * enrich missed-by-v2 entries so Jenny's review queue shows actionable
 * shipper/consignee context instead of an opaque loadId.
 *
 * Returns null on any error — enrichment is best-effort; a failed detail
 * call never breaks the sync.
 */
async function fetchPcsLoadDetail(
  bearer: string,
  loadId: string | number,
): Promise<PcsLoadDetail | null> {
  const companyId = process.env.PCS_COMPANY_ID ?? "";
  const companyLetter = process.env.PCS_COMPANY_LTR ?? "B";
  try {
    const res = await fetch(
      `${getPcsBaseUrl()}/dispatching/v1/load/${loadId}`,
      {
        headers: {
          Authorization: `Bearer ${bearer}`,
          "X-Company-Id": companyId,
          "X-Company-Letter": companyLetter,
          Accept: "application/json",
        },
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as PcsLoadDetail;
  } catch {
    return null;
  }
}

/**
 * Path A deterministic bridge: PCS shipper stop's referenceNumber is the
 * paper scale ticket printed at pickup. Our BOL-submission OCR extracts
 * the same ticket number from driver photos (ai_extracted_data.ticketNo).
 * When both sides match, we have a 1:1 link between PCS and v2.
 *
 * Returns the matched_load_id / bol_submission_id if found.
 */
async function findByShipperTicket(
  db: Database,
  shipperTicket: string,
): Promise<{ bolSubmissionId: number; matchedLoadId: number | null } | null> {
  const [row] = await db
    .select({
      bolSubmissionId: bolSubmissions.id,
      matchedLoadId: bolSubmissions.matchedLoadId,
    })
    .from(bolSubmissions)
    .where(
      sql`${bolSubmissions.aiExtractedData}->>'ticketNo' = ${shipperTicket}`,
    )
    .limit(1);
  return row ?? null;
}

/**
 * Scope-expansion signal: does v2 know the consignee company as a well?
 * Matches case-insensitively against wells.name (unique constraint) and
 * wells.aliases (jsonb array of human-curated variants).
 */
async function consigneeExistsAsWell(
  db: Database,
  consignee: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: wells.id })
    .from(wells)
    .where(
      or(
        sql`LOWER(${wells.name}) = LOWER(${consignee})`,
        sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${wells.aliases}) a WHERE LOWER(a) = LOWER(${consignee}))`,
      ),
    )
    .limit(1);
  return !!row;
}

export async function syncPcsLoads(
  db: Database,
  options: {
    fromDate?: Date;
    companyLetter?: string;
  } = {},
): Promise<SyncResult> {
  const startMs = Date.now();
  const fromDate =
    options.fromDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const companyLetter =
    options.companyLetter ?? process.env.PCS_COMPANY_LTR ?? "B";
  const companyId = process.env.PCS_COMPANY_ID ?? "";

  // Raw fetch against GetLoads — the generated OpenAPI client's
  // FromJSON converter expects TitleCase keys but the real PCS response
  // is camelCase, so typed deserialization drops fields like
  // loadReference silently. Raw JSON + hand-rolled type is reliable.
  const bearer = await getAccessToken(db);
  const fromDateParam = fromDate.toISOString().substring(0, 10);
  const url = `${getPcsBaseUrl()}/dispatching/v1/load?from=${fromDateParam}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      "X-Company-Id": companyId,
      "X-Company-Letter": companyLetter,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`PCS ${res.status}: ${bodyText || res.statusText}`);
  }

  const pcsLoads = (await res.json()) as PcsLoadRow[];

  const pcsLoadCount = pcsLoads.length;
  let matched = 0;
  let unmatched = 0;
  const missedByV2: MissedByV2Entry[] = [];
  let bridgeable = 0;
  let scopeGap = 0;
  const now = new Date();

  for (const pl of pcsLoads) {
    const reference = pl.loadReference ?? null;
    const pcsLoadId = pl.loadId ?? null;
    const status = pl.status ?? null;

    if (!pcsLoadId) {
      unmatched += 1;
      continue;
    }

    // Path 1: loadReference → v2 ticket_no / load_no / bol_no. Direct
    // match — cheap, works when Scout typed a v2-known identifier in
    // the PCS loadReference field.
    let hits: Array<{ assignmentId: number; loadId: number }> = [];
    let matchedVia: string = "load_reference";
    if (reference) {
      hits = await findAssignmentByReference(db, reference);
    }

    // Path A (tried when loadReference didn't match): fetch the full PCS
    // detail and bridge via shipper ticket or consignee well. Detail
    // call is one extra request per missed load — acceptable overhead
    // for a 15-min cron.
    let detail: PcsLoadDetail | null = null;
    let shipperStop: PcsStop | null = null;
    let consigneeStop: PcsStop | null = null;
    if (hits.length === 0) {
      detail = await fetchPcsLoadDetail(bearer, pcsLoadId);
      const stops = detail?.stops ?? [];
      shipperStop =
        stops.find((s) => s.type?.toLowerCase() === "shipper") ?? null;
      consigneeStop =
        stops.find((s) => s.type?.toLowerCase() === "consignee") ?? null;

      // Shipper-ticket bridge: PCS shipper stop's referenceNumber is the
      // loader scale ticket; our OCR extracts the same string.
      const shipperTicket = shipperStop?.referenceNumber ?? null;
      if (shipperTicket) {
        const bolHit = await findByShipperTicket(db, shipperTicket);
        if (bolHit?.matchedLoadId) {
          const linkedHits = await db
            .select({ assignmentId: assignments.id, loadId: loads.id })
            .from(loads)
            .innerJoin(assignments, eq(assignments.loadId, loads.id))
            .where(eq(loads.id, bolHit.matchedLoadId));
          if (linkedHits.length > 0) {
            hits = linkedHits;
            matchedVia = "shipper_ticket";
          }
        }
      }
    }

    if (hits.length === 0) {
      // Not bridgeable yet — enrich the missed entry with context so
      // Jenny's review queue is actionable rather than opaque.
      const consigneeCompany = consigneeStop?.companyName ?? null;
      const consigneeInV2 = consigneeCompany
        ? await consigneeExistsAsWell(db, consigneeCompany)
        : false;
      const shipperTicket = shipperStop?.referenceNumber ?? null;
      const matchingBol =
        shipperTicket && !consigneeInV2
          ? await findByShipperTicket(db, shipperTicket)
          : null;

      missedByV2.push({
        pcsLoadId,
        loadReference: reference,
        status,
        shipperCompany: shipperStop?.companyName ?? null,
        shipperTicket,
        shipperCity: shipperStop?.address?.city ?? null,
        consigneeCompany,
        consigneeCity: consigneeStop?.address?.city ?? null,
        pickupDate: shipperStop?.availableFrom ?? null,
        totalWeight: detail?.totalWeight ?? pl.totalWeight ?? null,
        milesBilled: detail?.milesBilled ?? pl.milesBilled ?? null,
        consigneeInV2Wells: consigneeInV2,
        matchingBolSubmissionId: matchingBol?.bolSubmissionId ?? null,
      });
      if (consigneeInV2) bridgeable += 1;
      else scopeGap += 1;
      unmatched += 1;
      continue;
    }

    // Update every matched assignment with PCS state. `matched_via`
    // records which bridge strategy resolved this pair so the
    // reconciliation audit trail stays honest.
    //
    // Auto-promote handler_stage: a load PCS confirms it has IS by
    // definition "entered" — Jess shouldn't have to manually walk the
    // stage strip for loads we already know are over the wall. Only
    // advance from earlier stages; never downgrade `cleared`. PCS
    // "Cancelled" is left alone so the discrepancy surfaces instead of
    // silently advancing.
    const assignmentIds = hits.map((r) => r.assignmentId);
    const shouldAutoEnter = status?.trim() !== "Cancelled";
    await db
      .update(assignments)
      .set({
        pcsSequence:
          typeof pcsLoadId === "string"
            ? Number.parseInt(pcsLoadId, 10)
            : pcsLoadId,
        pcsDispatch: {
          pcs_load_id: pcsLoadId,
          pcs_status: status,
          pcs_load_reference: reference,
          matched_via: matchedVia,
          last_status_sync: now.toISOString(),
          transport: "rest",
        },
        ...(shouldAutoEnter
          ? {
              handlerStage: sql`CASE
                WHEN ${assignments.handlerStage} IN ('uncertain', 'ready_to_build', 'building')
                  THEN 'entered'
                ELSE ${assignments.handlerStage}
              END` as unknown as typeof assignments.handlerStage._.data,
            }
          : {}),
        updatedAt: now,
      })
      .where(inArray(assignments.id, assignmentIds));

    // Cross-check compute. Fetch detail if not already (load_reference path
    // skipped it). Cheap — adds one API call per matched load on the
    // 15-min cron.
    if (detail === null) {
      detail = await fetchPcsLoadDetail(bearer, pcsLoadId);
      consigneeStop =
        detail?.stops?.find((s) => s.type?.toLowerCase() === "consignee") ??
        null;
    }
    const consigneeCompany = consigneeStop?.companyName ?? null;
    const pcsRating = detail?.rating ?? null;

    for (const hit of hits) {
      const [v2] = await db
        .select({
          handlerStage: assignments.handlerStage,
          weightLbs: loads.weightLbs,
          weightTons: loads.weightTons,
          wellName: wells.name,
          wellAliases: wells.aliases,
          wellRatePerTon: wells.ratePerTon,
        })
        .from(assignments)
        .innerJoin(loads, eq(assignments.loadId, loads.id))
        .leftJoin(wells, eq(assignments.wellId, wells.id))
        .where(eq(assignments.id, hit.assignmentId))
        .limit(1);
      if (!v2) continue;

      const v2WeightLbs =
        v2.weightLbs != null
          ? Number(v2.weightLbs)
          : v2.weightTons != null
            ? Number(v2.weightTons) * 2000
            : null;
      const v2RatePerTon =
        v2.wellRatePerTon != null ? Number(v2.wellRatePerTon) : null;

      const computed = computePerLoadDiscrepancies({
        assignmentId: hit.assignmentId,
        loadId: hit.loadId,
        v2HandlerStage: v2.handlerStage,
        v2WeightLbs:
          v2WeightLbs != null && Number.isFinite(v2WeightLbs)
            ? v2WeightLbs
            : null,
        v2WellName: v2.wellName,
        v2WellAliases: Array.isArray(v2.wellAliases) ? v2.wellAliases : null,
        v2WellRatePerTon:
          v2RatePerTon != null && Number.isFinite(v2RatePerTon)
            ? v2RatePerTon
            : null,
        pcs: pl,
        pcsConsigneeCompany: consigneeCompany,
        pcsRating: pcsRating,
      });

      try {
        await persistDiscrepancies(
          db,
          `assignment:${hit.assignmentId}`,
          computed,
          PER_LOAD_DISCREPANCY_TYPES,
        );
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        console.error(
          `[pcs-sync] persistDiscrepancies failed for assignment:${hit.assignmentId} pcsLoad:${pcsLoadId}`,
          e,
        );
        reportError(e, {
          source: "pcs-sync",
          op: "persistDiscrepancies",
          assignmentId: hit.assignmentId,
          pcsLoadId,
        });
      }
    }

    matched += hits.length;
  }

  // Post-loop sweep — orphan_destination is a v2-internal aggregate,
  // independent of PCS sync but runs on the same cadence.
  try {
    await sweepOrphanDestinations(db);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("[pcs-sync] sweepOrphanDestinations failed", e);
    reportError(e, {
      source: "pcs-sync",
      op: "sweepOrphanDestinations",
    });
  }

  // Persist missed-by-v2 to pcs_known_tickets so the JotForm matcher
  // (and other downstream consumers) can query PCS as a 4th match
  // source. Each sync upserts on pcs_load_id; rows from prior syncs
  // that aren't seen this run stay (PCS keeps "Arrived" loads around
  // for a long time — historical_complete loads are still legitimate
  // matches for old JotForm submissions). Refresh-period semantics
  // surface via last_seen_at.
  if (missedByV2.length > 0) {
    try {
      const { pcsKnownTickets } = await import("../../../db/schema.js");
      const { sql: sqlOp } = await import("drizzle-orm");
      const rows = missedByV2.map((m) => ({
        pcsLoadId: String(m.pcsLoadId),
        shipperTicket: m.shipperTicket ?? null,
        loadReference: m.loadReference ?? null,
        pcsStatus: m.status ?? null,
        shipperCompany: m.shipperCompany ?? null,
        consigneeCompany: m.consigneeCompany ?? null,
        pickupDate: m.pickupDate ?? null,
        totalWeight: m.totalWeight != null ? String(m.totalWeight) : null,
        division: companyLetter,
        lastSeenAt: now,
      }));
      await db
        .insert(pcsKnownTickets)
        .values(rows)
        .onConflictDoUpdate({
          target: pcsKnownTickets.pcsLoadId,
          set: {
            shipperTicket: sqlOp`excluded.shipper_ticket`,
            loadReference: sqlOp`excluded.load_reference`,
            pcsStatus: sqlOp`excluded.pcs_status`,
            shipperCompany: sqlOp`excluded.shipper_company`,
            consigneeCompany: sqlOp`excluded.consignee_company`,
            pickupDate: sqlOp`excluded.pickup_date`,
            totalWeight: sqlOp`excluded.total_weight`,
            division: sqlOp`excluded.division`,
            lastSeenAt: sqlOp`excluded.last_seen_at`,
          },
        });
    } catch (err) {
      // Best-effort persistence — don't fail the sync if upsert errors.
      console.error(
        `[pcs-sync] pcs_known_tickets upsert failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    ranAt: now.toISOString(),
    fromDate: fromDate.toISOString(),
    division: companyLetter,
    pcsLoadCount,
    matched,
    unmatched,
    missedByV2,
    bridgeable,
    scopeGap,
    latencyMs: Date.now() - startMs,
  };
}
