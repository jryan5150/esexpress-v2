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

import { eq, or, inArray } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import { assignments, loads } from "../../../db/schema.js";
import { getAccessToken } from "./pcs-auth.service.js";

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

const getPcsBaseUrl = (): string =>
  process.env.PCS_BASE_URL ?? "https://api.pcssoft.com";

export interface SyncResult {
  ranAt: string;
  fromDate: string;
  division: string; // "A" | "B"
  pcsLoadCount: number;
  matched: number;
  unmatched: number;
  missedByV2: Array<{
    pcsLoadId: number | string;
    loadReference: string | null;
    status: string | null;
  }>;
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

  // TEMP DIAGNOSTIC 2026-04-23: dump full shape of first 3 PCS rows to
  // identify which field carries the v2-bridgeable identifier. Remove
  // after reconciliation strategy is locked.
  console.log("[pcs-sync-diag] Total rows:", pcsLoads.length);
  console.log(
    "[pcs-sync-diag] Sample row 0:",
    JSON.stringify(pcsLoads[0] ?? null, null, 2),
  );
  console.log(
    "[pcs-sync-diag] Sample row 1:",
    JSON.stringify(pcsLoads[1] ?? null, null, 2),
  );
  console.log(
    "[pcs-sync-diag] Sample row 2:",
    JSON.stringify(pcsLoads[2] ?? null, null, 2),
  );
  const allKeys = new Set<string>();
  for (const pl of pcsLoads) for (const k of Object.keys(pl)) allKeys.add(k);
  console.log("[pcs-sync-diag] All keys:", [...allKeys].sort().join(", "));

  const pcsLoadCount = pcsLoads.length;
  let matched = 0;
  let unmatched = 0;
  const missedByV2: SyncResult["missedByV2"] = [];
  const now = new Date();

  for (const pl of pcsLoads) {
    const reference = pl.loadReference ?? null;
    const pcsLoadId = pl.loadId ?? null;
    const status = pl.status ?? null;

    if (!reference || !pcsLoadId) {
      unmatched += 1;
      continue;
    }

    const hits = await findAssignmentByReference(db, reference);
    if (hits.length === 0) {
      missedByV2.push({
        pcsLoadId,
        loadReference: reference,
        status,
      });
      unmatched += 1;
      continue;
    }

    // Update every assignment for this load with PCS state
    const assignmentIds = hits.map((r) => r.assignmentId);
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
          last_status_sync: now.toISOString(),
          transport: "rest",
        },
        updatedAt: now,
      })
      .where(inArray(assignments.id, assignmentIds));

    matched += hits.length;
  }

  return {
    ranAt: now.toISOString(),
    fromDate: fromDate.toISOString(),
    division: companyLetter,
    pcsLoadCount,
    matched,
    unmatched,
    missedByV2,
    latencyMs: Date.now() - startMs,
  };
}
