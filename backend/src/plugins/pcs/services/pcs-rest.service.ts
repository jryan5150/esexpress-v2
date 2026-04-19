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
 * The generated client's AddLoadRequest is a union of TruckLoad | LessThanTruckLoad
 * | IntermodalLoad. We populate a TruckLoad-shaped payload with the fields we
 * know; unknown optional fields are left off.
 *
 * NOTE: This mapping is derived from the 2026-03-06 Load API v1.0.0.0 Swagger
 * plus the SOAP PostDispatch param set. Field names in PCS's actual
 * /dispatching/v1/load endpoint may differ — validate on first real POST.
 */
export function buildAddLoadRequest(pkg: DispatchPackage): AddLoadRequest {
  // Weight in SOAP came through as tons (per-load conversion). The Load API
  // accepts weight as a number; we parse and default to 0 if unparseable.
  const weightNumber = Number.parseFloat(pkg.weight);
  const body = {
    loadClass: "tl",
    loadType: "FS", // Frac Sand — adjust if PCS expects a different code
    billToId: pkg.companyObjectId,
    billToName: pkg.companyName,
    driverName: pkg.driverName,
    truckNumber: pkg.truckNumber,
    trailerNumber: pkg.trailerNumber,
    originName: pkg.originName,
    destinationName: pkg.destinationName,
    commodity: pkg.commodity,
    weight: Number.isFinite(weightNumber) ? weightNumber : 0,
    status: "dispatched",
    // Preserve our internal load number as a reference the PCS side can echo
    customerLoadNumber: pkg.loadNumber,
  };
  return body as unknown as AddLoadRequest;
}

function buildLoadApi(
  accessTokenProvider: () => Promise<string>,
): DevelopersApi {
  const basePath = `${getPcsBaseUrl()}/dispatching/v1`;
  const config = new Configuration({
    basePath,
    accessToken: accessTokenProvider,
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
): Promise<DispatchResult> {
  if (!PCS_DISPATCH_ENABLED) {
    return {
      success: false,
      error: {
        code: "PCS_DISPATCH_DISABLED",
        message:
          "PCS dispatch is disabled. Set PCS_DISPATCH_ENABLED=true to enable.",
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
  const pkg = buildDispatchPackage(assignment, load, well);
  const body = buildAddLoadRequest(pkg);

  const api = buildLoadApi(() => getAccessToken(db));

  try {
    const response = await restPolicy.execute(async () => {
      try {
        return await api.addLoad({ addLoadRequest: body });
      } catch (err: unknown) {
        // Rewrap transport errors for the circuit breaker
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
    });

    const latencyMs = Date.now() - startMs;

    // AddLoad200Response shape varies by PCS version; capture the raw response
    // envelope for observability, and try to pull a loadId if present.
    const pcsLoadId = (response as Record<string, unknown>)?.loadId as
      | number
      | string
      | undefined;

    await db
      .update(assignments)
      .set({
        pcsDispatch: {
          ...((assignment.pcsDispatch as Record<string, unknown>) ?? {}),
          dispatched_at: new Date().toISOString(),
          dispatch_status: "Dispatched",
          pcs_load_id: pcsLoadId ?? null,
          pcs_response: response,
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
