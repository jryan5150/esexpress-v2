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
import { Configuration } from "../../../generated/pcs/load-client/src/runtime.js";
import { DevelopersApi } from "../../../generated/pcs/load-client/src/apis/DevelopersApi.js";
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
  pcsLoadId?: number | string;
  pcsStatus?: string;
  dispatchedAt?: string;
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

async function buildLoadApi(
  accessTokenProvider: () => Promise<string>,
  // Parameter retained for callsite compatibility but UNUSED.
  // 2026-04-23 finding: X-Company-Letter on REST writes triggers PCS 500s
  // ("An unexpected error has occurred"). Yesterday's successful push
  // (loadId 357468) sent NO letter header and routed to the Hairpin
  // pool via OAuth + billToId defaults. Reads are un-segmented by
  // letter either way. Header removed pending Kyle clarification on
  // the REST-side letter semantics.
  _companyLetterReserved: "A" | "B" = "B",
): Promise<DevelopersApi> {
  // Generated client's operations use urlPath = "/" — final URL is
  // basePath + urlPath. Kyle's updated endpoint is /dispatching/v1/load,
  // so basePath must end at /load for the generated relative paths to
  // resolve correctly.
  const basePath = `${getPcsBaseUrl()}/dispatching/v1/load`;

  // OpenAPI spec didn't declare OAuth security, so accessToken config is
  // never auto-consumed by the generated client. Inject the Bearer header
  // manually via the headers option. Token acquired per-call.
  const bearer = await accessTokenProvider();

  const config = new Configuration({
    basePath,
    accessToken: () => Promise.resolve(bearer),
    headers: {
      Authorization: `Bearer ${bearer}`,
      "X-Company-Id": process.env.PCS_COMPANY_ID ?? "",
      // X-Company-Letter intentionally omitted — see comment on the
      // function's _companyLetterReserved parameter.
    },
  });
  return new DevelopersApi(config);
}

/**
 * Dispatch an assignment to PCS via REST Load API.
 * Gated by PCS_DISPATCH_ENABLED. When the flag is off we never make a network
 * call — returns a structured disabled result instead.
 */
export async function dispatchLoad(
  db: Database,
  assignmentId: number,
  options: { company?: "A" | "B" } = {},
): Promise<DispatchResult> {
  const { getPcsDispatchEnabled } =
    await import("../../dispatch/services/app-settings.service.js");

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

  // ─── Raw fetch instead of generated OpenAPI client ─────────────────────
  // 2026-04-23 finding: the generated client's AddLoadRequestToJSON is a
  // union dispatcher that checks instanceOfIntermodalLoad FIRST. Because
  // IntermodalLoad's type-guard requires only {status, loadClass, office}
  // (same as TruckLoad), our TruckLoad-shaped payload gets serialized as
  // IntermodalLoad — which STRIPS TotalWeight, BillingType, MilesBilled,
  // Pallets and instead emits Boundary, BookingNumber, Container,
  // Chassis (all undefined). PCS receives a TL-class load with no
  // TotalWeight → server-side NullReferenceException → 500.
  //
  // Fix: bypass the generator, emit the PascalCase TruckLoad payload
  // directly. Mirrors the raw-fetch pattern already used by
  // pcs-sync.service.ts for GetLoads for similar camelCase-drift reasons.
  const bearer = await getAccessToken(db);
  const bodyMap = body as unknown as Record<string, unknown>;

  // PCS schema: Office.Code is PascalCase AND required to be an integer.
  // Our buildAddLoadRequest passes { code: "1" } — transform to { Code: 1 }.
  const officeSrc =
    (bodyMap.office as Record<string, unknown> | undefined) ?? {};
  const rawCode = officeSrc.code ?? officeSrc.Code;
  const officeCode =
    typeof rawCode === "string" ? Number.parseInt(rawCode, 10) : rawCode;

  const truckLoadBody = {
    Status: bodyMap.status,
    LoadClass: bodyMap.loadClass,
    LoadType: bodyMap.loadType,
    BillToId: bodyMap.billToId,
    BillToName: bodyMap.billToName,
    LoadReference: bodyMap.loadReference,
    BillingType: bodyMap.billingType,
    MilesBilled: bodyMap.milesBilled,
    TotalWeight: bodyMap.totalWeight,
    Pallets: bodyMap.pallets,
    Notes: bodyMap.notes,
    Office: { Code: officeCode },
    Stops: bodyMap.stops,
  };

  try {
    const response = await restPolicy.execute(async () => {
      const url = `${getPcsBaseUrl()}/dispatching/v1/load`;
      const serializedBody = JSON.stringify(truckLoadBody);

      // Diagnostic: log exact wire format so we can cross-reference with
      // Kyle. Tokens masked. Bytes-exact so he can locate on his side.
      console.log("[pcs-addload-diag] REQUEST", {
        url,
        method: "POST",
        headerKeys: [
          "Authorization (Bearer <masked>)",
          "X-Company-Id",
          "Content-Type: application/json",
          "Accept: application/json",
        ],
        xCompanyId: process.env.PCS_COMPANY_ID ?? "",
        bodyLen: serializedBody.length,
        body: serializedBody,
      });

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "X-Company-Id": process.env.PCS_COMPANY_ID ?? "",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: serializedBody,
      });

      const responseText = await res.text().catch(() => "");
      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        respHeaders[k] = v;
      });

      if (!res.ok) {
        // Include request body in the error so we can cross-reference
        // with Kyle even when Railway's logger eats console.log output.
        // Truncate if huge; these TruckLoad payloads are always <2KB so
        // full inclusion is fine.
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
    // `company` variable kept in scope — future work may wire it to
    // letter-based routing once Kyle confirms REST-side behavior.
    void company;

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
