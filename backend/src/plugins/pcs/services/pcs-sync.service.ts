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
import { Configuration } from "../../../generated/pcs/load-client/src/runtime.js";
import { DevelopersApi } from "../../../generated/pcs/load-client/src/apis/DevelopersApi.js";
import type { GetLoads200ResponseInner } from "../../../generated/pcs/load-client/src/models/GetLoads200ResponseInner.js";
import { getAccessToken } from "./pcs-auth.service.js";

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

  const basePath = `${getPcsBaseUrl()}/dispatching/v1`;
  const config = new Configuration({
    basePath,
    accessToken: () => getAccessToken(db),
    headers: {
      "X-Company-Id": companyId,
      "X-Company-Letter": companyLetter,
    },
  });
  const api = new DevelopersApi(config);

  // Pull PCS loads
  const pcsLoads: GetLoads200ResponseInner[] = await api.getLoads({
    from: fromDate,
  });

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
