/**
 * PCS REST Dispatch Service — Phase 2
 * ===================================
 *
 * Replaces the SOAP dispatch path with a REST call against the updated
 * PCS Load API:
 *   POST {PCS_BASE_URL}/dispatching/v1/load
 *   auth: Bearer {token from pcs-auth.service}
 *
 * Scope: exactly the dispatch push. Status sync, webhooks, photo attachments,
 * and other API families stay on legacy paths until Phase 2 is fully green-lit.
 *
 * The generated load-client (backend/src/generated/pcs/load-client) was built
 * against the PCS Load API v1.0.0.0 Swagger from 2026-03-06. Kyle Puryear
 * confirmed on 2026-04-16 that the base URL moved to /dispatching/v1 and auth
 * moved to OAuth2 client credentials — schema was not called out as changed.
 * We override the base URL at Configuration construction.
 *
 * Gated by PCS_DISPATCH_ENABLED. Default: false (dry-run only).
 */

import { eq } from "drizzle-orm";
import type { AddLoadRequest } from "../../../generated/pcs/load-client/src/models/AddLoadRequest.js";
import { createPcsBreaker } from "../../../lib/circuit-breaker.js";
import { NetworkError } from "../../../lib/errors.js";
import { assignments, loads, wells } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";
import { buildDispatchPackage } from "../lib/dispatch-package.js";
import type { DispatchPackage } from "../lib/dispatch-package.js";
import { NotFoundError } from "../../../lib/errors.js";
import { getAccessToken, getPcsBaseUrl } from "./pcs-auth.service.js";

const { policy: restPolicy } = createPcsBreaker();

/** Gates live PCS dispatch. Same flag as SOAP path. Default: false. */
export const PCS_DISPATCH_ENABLED = process.env.PCS_DISPATCH_ENABLED === "true";

export interface DispatchResult {
  success: boolean;
  /**
   * Which code path produced this result. 'live' = real PCS REST call.
   * 'rehearsal' = no PCS call; assignment was queued locally with
   * pcs_pending_at set. Frontend reads this to swap success-message
   * copy so the dispatcher knows which thing actually happened.
   */
  mode?: "live" | "rehearsal";
  pcsLoadId?: number | string;
  pcsStatus?: string;
  dispatchedAt?: string;
  /** Set in rehearsal mode only — the timestamp the queue marker was
   *  written. Useful for the drain script's audit log. */
  pendingAt?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    pcsRawError?: string;
  };
  latencyMs: number;
}

interface FetchedAssignment {
  assignment: {
    id: number;
    wellId: number;
    loadId: number;
    status: string;
    pcsDispatch: Record<string, unknown> | null;
  };
  load: {
    id: number;
    loadNo: string;
    driverName: string | null;
    truckNo: string | null;
    trailerNo: string | null;
    originName: string | null;
    destinationName: string | null;
    productDescription: string | null;
    weightTons: string | null;
  };
  well: {
    id: number;
    name: string;
  };
}

async function fetchAssignmentData(
  db: Database,
  assignmentId: number,
): Promise<FetchedAssignment> {
  const rows = await db
    .select({
      assignmentId: assignments.id,
      assignmentWellId: assignments.wellId,
      assignmentLoadId: assignments.loadId,
      assignmentStatus: assignments.status,
      assignmentPcsDispatch: assignments.pcsDispatch,
      loadId: loads.id,
      loadNo: loads.loadNo,
      driverName: loads.driverName,
      truckNo: loads.truckNo,
      trailerNo: loads.trailerNo,
      originName: loads.originName,
      destinationName: loads.destinationName,
      productDescription: loads.productDescription,
      weightTons: loads.weightTons,
      wellId: wells.id,
      wellName: wells.name,
    })
    .from(assignments)
    .innerJoin(loads, eq(assignments.loadId, loads.id))
    .innerJoin(wells, eq(assignments.wellId, wells.id))
    .where(eq(assignments.id, assignmentId))
    .limit(1);

  if (rows.length === 0) {
    throw new NotFoundError("Assignment", assignmentId);
  }

  const row = rows[0];
  return {
    assignment: {
      id: row.assignmentId,
      wellId: row.assignmentWellId,
      loadId: row.assignmentLoadId,
      status: row.assignmentStatus,
      pcsDispatch: row.assignmentPcsDispatch,
    },
    load: {
      id: row.loadId,
      loadNo: row.loadNo,
      driverName: row.driverName,
      truckNo: row.truckNo,
      trailerNo: row.trailerNo,
      originName: row.originName,
      destinationName: row.destinationName,
      productDescription: row.productDescription,
      weightTons: row.weightTons,
    },
    well: {
      id: row.wellId,
      name: row.wellName,
    },
  };
}

/**
 * Build the Load API AddLoad request body from an internal dispatch package.
 *
 * Payload shape validated 2026-04-22 via direct API call against Hairpin —
 * loadId 357468 created successfully and voided. Real Hairpin loads returned
 * by GetLoads have: loadClass="TL", loadType=null, office={code:"1"},
 * billToId="V646" (ES Express customer code), loadReference=<ticket_no>.
 *
 * PCS rejects made-up fields like driverName/truckNumber/originName/commodity
 * (SOAP-era fields). Driver/truck/trailer assignment is a SEPARATE API call
 * against POST /truckload/{loadId}/company/dispatch and is not part of the
 * load-creation payload.
 *
 * Tons → lbs: weight stored as tons in v2, PCS wants lbs. Convert inline.
 */
export function buildAddLoadRequest(pkg: DispatchPackage): AddLoadRequest {
  const weightTons = Number.parseFloat(pkg.weight);
  const totalWeight = Number.isFinite(weightTons) ? weightTons * 2000 : 0;

  const body = {
    loadClass: "TL",
    status: "Dispatched",
    office: { code: "1" },
    billToId: "V646",
    // Reverted 2026-04-23 from "Hairpin" — the test file (pcs-rest.test.ts:48)
    // codifies "ES Express" as the value proven valid by loadId 357468
    // creation on 2026-04-22. The 4/23 change to "Hairpin" was a guess
    // during 500 debugging, never validated.
    billToName: "ES Express",
    totalWeight,
    loadReference: pkg.loadNumber,
    notes: pkg.destinationName
      ? `v2 dispatch → ${pkg.destinationName}`
      : undefined,
  };
  return body as unknown as AddLoadRequest;
}

// 2026-04-28 — buildLoadApi removed. The OpenAPI-generated client's
// AddLoadRequestToJSON serializer converts camelCase keys → PascalCase
// on the wire (see scripts/pcs-shape-probe.mjs results). PCS REST API
// rejects PascalCase with HTTP 500. dispatchLoad now POSTs camelCase
// JSON directly via fetch. The generated client + Configuration import
// are kept around in case other operations (cancelLoad, etc.) want to
// use them later without the AddLoad serializer trap.

/**
 * Rehearsal-mode dispatch — runs when app_settings.pcs_dispatch_mode
 * is 'rehearsal' (the default while Kyle's OAuth is pending). Marks
 * the assignment pcs_pending_at = now() + advances handler_stage to
 * 'entered' so the load visibly leaves the active worksurface and
 * lands on /flagged under "📦 Ready for PCS — awaiting Kyle".
 *
 * No PCS REST call is made. The return shape mirrors a successful
 * dispatch so the frontend can render a success state — only the
 * `mode: 'rehearsal'` field tells the UI to swap copy.
 *
 * Idempotent: if pcs_pending_at is already set, we update the
 * timestamp + stage but don't crash. If pcs_number is already set
 * (load was already pushed for real), we no-op with a clear error.
 */
async function runRehearsalDispatch(
  db: Database,
  assignmentId: number,
): Promise<DispatchResult> {
  const startedAt = Date.now();
  const { sql } = await import("drizzle-orm");

  // Refuse to queue an already-pushed load — it would put the row in
  // an ambiguous "pushed AND pending" state that the drain script can't
  // safely interpret.
  const existing = (await db.execute(sql`
    SELECT id, pcs_number, pcs_pending_at::text AS pcs_pending_at
    FROM assignments WHERE id = ${assignmentId} LIMIT 1
  `)) as unknown as Array<{
    id: number;
    pcs_number: string | null;
    pcs_pending_at: string | null;
  }>;
  if (existing.length === 0) {
    return {
      success: false,
      mode: "rehearsal",
      latencyMs: Date.now() - startedAt,
      error: {
        code: "ASSIGNMENT_NOT_FOUND",
        message: `Assignment ${assignmentId} not found`,
        retryable: false,
      },
    };
  }
  if (existing[0].pcs_number) {
    return {
      success: false,
      mode: "rehearsal",
      latencyMs: Date.now() - startedAt,
      error: {
        code: "ALREADY_PUSHED",
        message: `Assignment ${assignmentId} already has PCS number ${existing[0].pcs_number} — re-queue not allowed in rehearsal mode.`,
        retryable: false,
      },
    };
  }

  const now = new Date().toISOString();
  await db.execute(sql`
    UPDATE assignments
    SET pcs_pending_at = NOW(),
        handler_stage = 'entered',
        entered_on = COALESCE(entered_on, NOW()),
        updated_at = NOW()
    WHERE id = ${assignmentId}
  `);

  return {
    success: true,
    mode: "rehearsal",
    pendingAt: now,
    pcsStatus: "queued_for_pcs",
    dispatchedAt: now,
    latencyMs: Date.now() - startedAt,
  };
}

/**
 * Dispatch an assignment to PCS via REST Load API.
 * Gated by PCS_DISPATCH_ENABLED. When the flag is off we never make a network
 * call — returns a structured disabled result instead.
 *
 * In rehearsal mode (app_settings.pcs_dispatch_mode = 'rehearsal',
 * default while Kyle's OAuth pending) this short-circuits to
 * runRehearsalDispatch() above. Pass options.forceLive=true from the
 * cutover drain script to bypass the rehearsal check.
 */
export async function dispatchLoad(
  db: Database,
  assignmentId: number,
  options: { company?: "A" | "B"; forceLive?: boolean } = {},
): Promise<DispatchResult> {
  const { getPcsDispatchEnabled, getPcsDispatchMode } =
    await import("../../dispatch/services/app-settings.service.js");

  // Rehearsal-mode short-circuit. While Kyle's OAuth credentials are
  // pending, every Push to PCS click should advance the workflow but
  // not actually call PCS REST. Frontend reads the response.mode field
  // to swap the success message ("Saved as ready — Kyle's PCS will pick
  // this up when it goes live"). When OAuth lands, flip the setting
  // (UPDATE app_settings ... 'live') and run the drain script.
  //
  // forceLive=true overrides — used by the cutover drain script.
  if (!options.forceLive) {
    const mode = await getPcsDispatchMode(db);
    if (mode === "rehearsal") {
      return runRehearsalDispatch(db, assignmentId);
    }
  }

  // Auto-company inference: when the caller doesn't specify a company
  // explicitly, pick based on which toggle is on. This makes the Friday-
  // drop self-demo work naturally — team toggles A (Hairpin test) on,
  // pushes a test load, push routes to A automatically with no extra
  // UI wiring.
  //
  // Rules (checked only when caller didn't pass company):
  //   A on,  B off → route to A (test-drive mode)
  //   A off, B on  → route to B (normal production)
  //   A on,  B on  → route to B (production takes priority — preserves
  //                  Scout's normal workflow even while testing)
  //   A off, B off → will fall through to the disabled error below
  let company: "A" | "B" = options.company ?? "B";
  if (options.company === undefined) {
    const [aOn, bOn] = await Promise.all([
      getPcsDispatchEnabled(db, "A"),
      getPcsDispatchEnabled(db, "B"),
    ]);
    if (aOn && !bOn) company = "A";
    else if (bOn) company = "B";
    // else both off → company stays "B" and the disabled check below
    // returns a clear error.
  }

  const enabled = await getPcsDispatchEnabled(db, company);
  if (!enabled) {
    const divisionLabel = company === "A" ? "Hairpin (A)" : "ES Express (B)";
    return {
      success: false,
      error: {
        code: "PCS_DISPATCH_DISABLED",
        message: `PCS dispatch is disabled for ${divisionLabel}. Flip the toggle in Admin → Settings to enable.`,
        retryable: false,
      },
      latencyMs: 0,
    };
  }

  const startMs = Date.now();
  const { assignment, load, well } = await fetchAssignmentData(
    db,
    assignmentId,
  );

  // ─── Idempotency guard (2026-04-28) ─────────────────────────────────
  // Refuse to live-push an assignment that already has a PCS loadId on
  // pcs_dispatch. Mirrors the rehearsal-mode ALREADY_PUSHED guard
  // (runRehearsalDispatch line ~238). Without this, a UI double-click
  // creates two real PCS loads — the second one orphaned in v2 because
  // we only persist the latest pcs_load_id back to assignments.
  const existingPcsLoadId =
    assignment.pcsDispatch &&
    typeof assignment.pcsDispatch === "object" &&
    "pcs_load_id" in assignment.pcsDispatch
      ? (assignment.pcsDispatch as { pcs_load_id?: number | string | null })
          .pcs_load_id
      : null;
  if (existingPcsLoadId != null) {
    return {
      success: false,
      mode: "live",
      latencyMs: Date.now() - startMs,
      error: {
        code: "ALREADY_PUSHED",
        message: `Assignment ${assignmentId} already has PCS loadId ${existingPcsLoadId}. Refusing to create a duplicate.`,
        retryable: false,
      },
    };
  }

  // ─── Photo gate — hard requirement per client (no photo, no PCS push) ───
  // Jessica Apr 6 / Apr 17: "100% + photo → ready_to_build". We run this
  // check BEFORE touching PCS so no load ever lands there without a BOL.
  const {
    photoGateCheck,
    fetchAndNormalizePhoto,
    uploadPhotoToPcs,
    cancelPcsLoad,
  } = await import("./pcs-file.service.js");

  const gate = await photoGateCheck(db, assignmentId, load.id);
  if (!gate.ok || !gate.photoUrl) {
    return {
      success: false,
      error: {
        code: "PHOTO_REQUIRED",
        message:
          "Cannot push to PCS: no BOL photo attached to this assignment. Photos are a hard requirement — attach one and retry.",
        retryable: false,
      },
      latencyMs: Date.now() - startMs,
    };
  }

  // Pre-fetch + normalize BEFORE creating the load in PCS. If this fails,
  // we abort without ever touching PCS — nothing to roll back.
  let photoBuffer: Buffer;
  let photoFilename: string;
  let photoWasRotated = false;
  try {
    const normalized = await fetchAndNormalizePhoto(gate.photoUrl);
    photoBuffer = normalized.buffer;
    photoFilename = normalized.filename;
    photoWasRotated = normalized.wasRotated;
  } catch (err) {
    return {
      success: false,
      error: {
        code: "PHOTO_FETCH_FAILED",
        message: `Photo fetch/normalize failed: ${err instanceof Error ? err.message : String(err)}`,
        retryable: true,
      },
      latencyMs: Date.now() - startMs,
    };
  }

  const pkg = buildDispatchPackage(assignment, load, well);
  const body = buildAddLoadRequest(pkg);

  // ─── Direct fetch with camelCase body (2026-04-28) ──────────────────
  // Definitively isolated via 5-variant shape probe (scripts/pcs-shape-probe.mjs):
  //   - camelCase wire body  → 200 OK + loadId returned (✅ proven 357470)
  //   - PascalCase wire body → 500 "An unexpected error has occurred"
  //
  // The OpenAPI generated client (api.addLoad → IntermodalLoadToJSON) emits
  // PascalCase keys on the wire, which PCS rejects. The post-4/23 explicit
  // PascalCase transform also got rejected for the same reason. Both paths
  // were sending the wrong shape — PCS REST API expects camelCase
  // (matches what GetLoad returns on read).
  //
  // Fix: bypass the generator entirely. JSON.stringify the camelCase body
  // from buildAddLoadRequest() and POST it directly. Same headers as the
  // working probe variant: Authorization + X-Company-Id + X-Company-Letter.
  const bearer = await getAccessToken(db);
  const url = `${getPcsBaseUrl()}/dispatching/v1/load`;
  const serializedBody = JSON.stringify(body);

  try {
    const response = await restPolicy.execute(async () => {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${bearer}`,
            "X-Company-Id": process.env.PCS_COMPANY_ID ?? "",
            "X-Company-Letter": company,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: serializedBody,
        });
      } catch (err: unknown) {
        if (
          err instanceof TypeError ||
          (err instanceof Error && err.name === "AbortError") ||
          (err instanceof Error && err.name === "TimeoutError")
        ) {
          throw new NetworkError(
            `PCS Load API request failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        throw err;
      }

      const responseText = await res.text().catch(() => "");
      if (!res.ok) {
        // Surface the full PCS error body + the request we sent so any
        // future regression has a tight diagnostic loop. Wire bodies are
        // <2KB so full inclusion is fine.
        const respHeaders: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          respHeaders[k] = v;
        });
        throw new Error(
          `PCS ${res.status}: resp=${responseText || res.statusText} | req=${serializedBody} | respHeaders=${JSON.stringify(respHeaders)}`,
        );
      }

      try {
        return JSON.parse(responseText) as Record<string, unknown>;
      } catch {
        return { raw: responseText } as Record<string, unknown>;
      }
    });

    // AddLoad200Response shape varies by PCS version; capture the raw response
    // envelope for observability, and try to pull a loadId if present.
    const pcsLoadId = (response as Record<string, unknown>)?.loadId as
      | number
      | string
      | undefined;

    if (pcsLoadId == null) {
      throw new Error(
        `PCS AddLoad returned 200 without loadId — cannot attach photo. Response: ${JSON.stringify(response)}`,
      );
    }

    // ─── Photo upload — atomic with load creation ─────────────────────
    // If this fails we roll back the just-created PCS load so the client
    // never ends up with a BOL-less orphan. The photo requirement is
    // non-negotiable per Jessica's Apr 6 / Apr 17 asks.
    let attachmentName: string;
    try {
      const uploaded = await uploadPhotoToPcs(
        db,
        pcsLoadId,
        photoBuffer,
        photoFilename,
        company,
      );
      attachmentName = uploaded.attachmentName;
    } catch (uploadErr) {
      // Rollback — best-effort; log but don't let rollback failure mask
      // the real upload error.
      try {
        await cancelPcsLoad(db, pcsLoadId, company);
      } catch {
        // swallow — the upload error is the load-bearing signal
      }
      return {
        success: false,
        error: {
          code: "PHOTO_UPLOAD_FAILED",
          message: `Photo upload to PCS failed: ${uploadErr instanceof Error ? uploadErr.message : String(uploadErr)} — load ${pcsLoadId} rolled back.`,
          retryable: true,
        },
        latencyMs: Date.now() - startMs,
      };
    }

    const latencyMs = Date.now() - startMs;

    await db
      .update(assignments)
      .set({
        pcsDispatch: {
          ...((assignment.pcsDispatch as Record<string, unknown>) ?? {}),
          dispatched_at: new Date().toISOString(),
          dispatch_status: "Dispatched",
          pcs_load_id: pcsLoadId ?? null,
          pcs_response: response,
          pcs_attachment_name: attachmentName,
          photo_was_rotated: photoWasRotated,
          last_status_sync: new Date().toISOString(),
          transport: "rest",
        },
        status: "dispatched",
        updatedAt: new Date(),
      })
      .where(eq(assignments.id, assignmentId));

    return {
      success: true,
      pcsLoadId,
      pcsStatus: "Dispatched",
      dispatchedAt: new Date().toISOString(),
      latencyMs,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startMs;
    const message = err instanceof Error ? err.message : String(err);
    const retryable =
      err instanceof NetworkError ||
      (err instanceof Error && err.name === "TimeoutError");

    // Best-effort annotate the assignment with the failure reason
    await db
      .update(assignments)
      .set({
        pcsDispatch: {
          ...((assignment.pcsDispatch as Record<string, unknown>) ?? {}),
          error: message,
          last_attempt_at: new Date().toISOString(),
          transport: "rest",
        },
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(assignments.id, assignmentId))
      .catch(() => {
        /* swallow — REST error is more important than the DB annotation */
      });

    return {
      success: false,
      error: {
        code: "PCS_REST_ERROR",
        message,
        retryable,
      },
      latencyMs,
    };
  }
}

/** Diagnostic snapshot for /diag/ surface. */
export function restDiagnostics(): {
  dispatchEnabled: boolean;
  baseUrl: string;
  loadEndpoint: string;
} {
  return {
    dispatchEnabled: PCS_DISPATCH_ENABLED,
    baseUrl: getPcsBaseUrl(),
    loadEndpoint: `${getPcsBaseUrl()}/dispatching/v1/load`,
  };
}
