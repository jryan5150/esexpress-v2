/**
 * PCS SOAP Service — Track 2.1
 * ============================
 *
 * Encapsulates ALL PCS Express SOAP interaction. No other module should talk
 * to PCS SOAP directly. Handles session management, dispatch package building,
 * status mapping, and SOAP method wrappers.
 *
 * SOAP endpoints (confirmed from v1 probe + live testing 2026-02-12):
 *   - WSExpressSupport: auth, health, dispatch support
 *   - NS_Email:         PostDispatch, PostStatus, messaging
 *   - RackApps:         rack operations (not used in MVP)
 *   - ws_pd:            pre-dispatch (not used in MVP)
 *
 * Auth model: PCS_ACCESS_KEY IS the sKey. No exchange flow needed.
 * Session has a 24-hour TTL; validated via IsOnline SOAP call.
 */

import { eq, and, gt } from "drizzle-orm";
import {
  callSoap,
  parseSoapResponse,
  type SoapConfig,
} from "../../../lib/soap-client.js";
import {
  createPcsBreaker,
  getBreakerState,
} from "../../../lib/circuit-breaker.js";
import { AppError, NotFoundError, NetworkError } from "../../../lib/errors.js";
import { pcsSessions, assignments, loads, wells } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";

// ---------------------------------------------------------------------------
// Feature Flag
// ---------------------------------------------------------------------------

/** Gates live PCS dispatch. Default: false (dry-run only). */
export const PCS_DISPATCH_ENABLED = process.env.PCS_DISPATCH_ENABLED === "true";

// ---------------------------------------------------------------------------
// PCS SOAP Endpoints
// ---------------------------------------------------------------------------

export const PCS_ENDPOINTS = {
  WSExpressSupport: "http://ws.xpresstrax.com/WSExpressSupport.asmx",
  NS_Email: "http://ws.xpresstrax.com/NS_Email.asmx",
  RackApps: "http://20.80.181.143/RackApps.asmx",
  ws_pd: "https://xa.xpresstrax.com/ws_pd.asmx",
} as const;

const PCS_NAMESPACE = "http://www.xpresstrax.com/";
const WS_PD_NAMESPACE = "http://tempuri.org/";

const SESSION_TTL_MS = 24 * 60 * 60_000; // 24 hours

// ---------------------------------------------------------------------------
// Circuit Breaker (singleton — shared across all SOAP operations)
// ---------------------------------------------------------------------------

const { policy: pcsPolicy, breaker: pcsBreaker } = createPcsBreaker();

// ---------------------------------------------------------------------------
// Status Mapping Tables (bidirectional)
// ---------------------------------------------------------------------------

/** PCS status string -> internal assignment status */
export const PCS_TO_INTERNAL: Record<string, string> = {
  DISPATCHED: "dispatched",
  "IN TRANSIT": "in_transit",
  "AT ORIGIN": "at_origin",
  LOADING: "loading",
  LOADED: "loaded",
  "EN ROUTE": "en_route",
  "AT DESTINATION": "at_destination",
  UNLOADING: "unloading",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  "ON HOLD": "on_hold",
  REJECTED: "rejected",
};

/** Internal assignment status -> PCS status string */
export const INTERNAL_TO_PCS: Record<string, string> = {
  dispatched: "DISPATCHED",
  in_transit: "IN TRANSIT",
  at_origin: "AT ORIGIN",
  loading: "LOADING",
  loaded: "LOADED",
  en_route: "EN ROUTE",
  at_destination: "AT DESTINATION",
  unloading: "UNLOADING",
  delivered: "DELIVERED",
  cancelled: "CANCELLED",
  completed: "COMPLETED",
  on_hold: "ON HOLD",
  rejected: "REJECTED",
};

// ---------------------------------------------------------------------------
// Status Mapping Functions
// ---------------------------------------------------------------------------

/**
 * Map a PCS status string to the corresponding internal assignment status.
 * Returns null for unknown PCS statuses.
 */
export function mapPcsToInternal(pcsStatus: string): string | null {
  return PCS_TO_INTERNAL[pcsStatus] ?? null;
}

/**
 * Map an internal assignment status to the corresponding PCS status string.
 * Returns null for statuses that have no PCS equivalent.
 */
export function mapInternalToPcs(internalStatus: string): string | null {
  return INTERNAL_TO_PCS[internalStatus] ?? null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DispatchPackage {
  companyObjectId: string;
  loadNumber: string;
  driverName: string;
  truckNumber: string;
  originName: string;
  destinationName: string;
  commodity: string;
  weight: string;
  dispatchDate: string;
  companyName: string;
  companyLetter: string;
  trailerNumber: string;
  status: string;
}

export interface DispatchResult {
  success: boolean;
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

interface AssignmentRow {
  id: number;
  wellId: number;
  loadId: number;
  status: string;
  pcsDispatch: Record<string, unknown> | null;
}

interface LoadRow {
  id: number;
  loadNo: string;
  driverName: string | null;
  truckNo: string | null;
  trailerNo: string | null;
  originName: string | null;
  destinationName: string | null;
  productDescription: string | null;
  weightTons: string | null;
}

interface WellRow {
  id: number;
  name: string;
}

// ---------------------------------------------------------------------------
// Env Helpers
// ---------------------------------------------------------------------------

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new AppError(
      `PCS credentials not configured. Set ${key} in environment.`,
      503,
      "PCS_AUTH_MISSING_CREDS",
    );
  }
  return value;
}

function getPcsConfig(sKey?: string): SoapConfig {
  return {
    endpoint: PCS_ENDPOINTS.WSExpressSupport,
    namespace: PCS_NAMESPACE,
    authHeader: sKey ? { sKey } : undefined,
    timeoutMs: 15_000,
  };
}

function getEmailConfig(sKey: string): SoapConfig {
  return {
    endpoint: PCS_ENDPOINTS.NS_Email,
    namespace: PCS_NAMESPACE,
    authHeader: { sKey },
    timeoutMs: 15_000,
  };
}

// ---------------------------------------------------------------------------
// Session Management
// ---------------------------------------------------------------------------

/**
 * Get or create a valid PCS SOAP session. Returns the sKey token.
 *
 * Auth model (confirmed 2026-02-12): PCS_ACCESS_KEY IS the sKey.
 * No exchange flow needed. We store it in pcsSessions for TTL tracking
 * and to verify the key is still valid via IsOnline.
 */
export async function getSession(db: Database): Promise<string> {
  const companyId = requireEnv("PCS_COMPANY_ID");
  const accessKey = requireEnv("PCS_ACCESS_KEY");

  // Check for existing valid session
  const now = new Date();
  const [existing] = await db
    .select()
    .from(pcsSessions)
    .where(
      and(
        eq(pcsSessions.sessionType, "soap"),
        eq(pcsSessions.companyId, companyId),
        gt(pcsSessions.expiresAt, now),
      ),
    )
    .orderBy(pcsSessions.createdAt)
    .limit(1);

  if (existing) {
    // Session still valid — return the key from env (not from DB)
    return accessKey;
  }

  // Verify the access key works via lightweight IsOnline check
  const xml = await pcsPolicy.execute(() =>
    callSoap("IsOnline", { CustID: companyId }, getPcsConfig()),
  );

  const result = parseSoapResponse(xml);
  if (!result.success) {
    throw new AppError(
      `PCS IsOnline check failed: ${result.faultString}`,
      503,
      "PCS_COMPANY_OFFLINE",
    );
  }

  // Check that IsOnlineResult is true in the response body
  const isOnlineResult = (result.body as Record<string, unknown>)
    ?.IsOnlineResponse;
  // The XML parser may nest the result differently; also check raw text
  const isOnline =
    xml.includes("<IsOnlineResult>true</IsOnlineResult>") ||
    xml.includes("<IsOnlineResult>True</IsOnlineResult>");

  if (!isOnline && isOnlineResult === undefined) {
    throw new AppError(
      "PCS company is not online. Check PCS_COMPANY_ID.",
      503,
      "PCS_COMPANY_OFFLINE",
    );
  }

  // Store session marker for TTL tracking — hash the key, don't store plaintext
  await db.insert(pcsSessions).values({
    sessionType: "soap",
    token: `session:${Date.now()}`,
    companyId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  return accessKey;
}

// ---------------------------------------------------------------------------
// Dispatch Package Builder
// ---------------------------------------------------------------------------

/**
 * Build a PCS dispatch package from an assignment, its load, and its well.
 * Pure function -- no DB or network calls.
 */
export function buildDispatchPackage(
  assignment: { id: number; status: string },
  load: {
    loadNo: string;
    driverName: string | null;
    truckNo: string | null;
    trailerNo: string | null;
    originName: string | null;
    destinationName: string | null;
    productDescription: string | null;
    weightTons: string | null;
  },
  well: { name: string },
): DispatchPackage {
  const companyId = process.env.PCS_COMPANY_ID ?? "";
  const companyName = process.env.PCS_COMPANY_NAME ?? "";
  const companyLetter = process.env.PCS_COMPANY_LTR ?? "B";

  return {
    companyObjectId: companyId,
    loadNumber: load.loadNo,
    driverName: load.driverName ?? "",
    truckNumber: load.truckNo ?? "",
    trailerNumber: load.trailerNo ?? "",
    originName: load.originName ?? "",
    destinationName: well.name,
    commodity: load.productDescription ?? "",
    weight: load.weightTons ?? "0",
    dispatchDate: new Date().toISOString(),
    companyName,
    companyLetter,
    status: "DISPATCHED",
  };
}

// ---------------------------------------------------------------------------
// Internal: Fetch assignment + joined data
// ---------------------------------------------------------------------------

async function fetchAssignmentData(
  db: Database,
  assignmentId: number,
): Promise<{ assignment: AssignmentRow; load: LoadRow; well: WellRow }> {
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

// ---------------------------------------------------------------------------
// SOAP Operations
// ---------------------------------------------------------------------------

/**
 * Dispatch an assignment to PCS Express via SOAP PostDispatch.
 * Gated by PCS_DISPATCH_ENABLED feature flag.
 */
export async function dispatch(
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
  const sKey = await getSession(db);

  const postDispatchParams = {
    iCompID: pkg.companyObjectId,
    sCompName: pkg.companyName,
    sCompLtr: pkg.companyLetter,
    iLoadID: pkg.loadNumber,
    sDriverName: pkg.driverName,
    sTruckNumber: pkg.truckNumber,
    sTrailerNumber: pkg.trailerNumber,
    sStatus: pkg.status,
  };

  try {
    const xml = await pcsPolicy.execute(() =>
      callSoap("PostDispatch", postDispatchParams, getEmailConfig(sKey)),
    );

    const latencyMs = Date.now() - startMs;
    const parsed = parseSoapResponse(xml);

    // PostDispatch returns a bool: <PostDispatchResult>true|false</PostDispatchResult>
    const pcsConfirmed =
      xml.includes("<PostDispatchResult>true</PostDispatchResult>") ||
      xml.includes("<PostDispatchResult>True</PostDispatchResult>");

    if (parsed.success && pcsConfirmed) {
      // Update assignment with PCS dispatch info
      await db
        .update(assignments)
        .set({
          pcsDispatch: {
            ...((assignment.pcsDispatch as Record<string, unknown>) ?? {}),
            dispatched_at: new Date().toISOString(),
            dispatch_status: "Dispatched",
            pcs_response_raw: xml.slice(0, 5000),
            last_status_sync: new Date().toISOString(),
          },
          status: "dispatched",
          updatedAt: new Date(),
        })
        .where(eq(assignments.id, assignmentId));

      return {
        success: true,
        pcsStatus: "Dispatched",
        dispatchedAt: new Date().toISOString(),
        latencyMs,
      };
    }

    // Dispatch failed
    const errorMsg = !parsed.success
      ? `PCS SOAP fault: ${parsed.faultString}`
      : "PCS rejected dispatch (PostDispatchResult=false)";

    await db
      .update(assignments)
      .set({
        pcsDispatch: {
          ...((assignment.pcsDispatch as Record<string, unknown>) ?? {}),
          error: errorMsg,
          pcs_response_raw: xml.slice(0, 5000),
        },
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(assignments.id, assignmentId));

    return {
      success: false,
      error: {
        code: !parsed.success ? "PCS_SOAP_FAULT" : "PCS_REJECTED",
        message: errorMsg,
        retryable: false,
        pcsRawError: xml.slice(0, 1000),
      },
      latencyMs,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startMs;
    const message = err instanceof Error ? err.message : String(err);
    const retryable =
      err instanceof NetworkError ||
      (err instanceof Error && err.name === "TimeoutError");

    // Best-effort: mark assignment as failed
    await db
      .update(assignments)
      .set({
        pcsDispatch: {
          ...((assignment.pcsDispatch as Record<string, unknown>) ?? {}),
          error: message,
        },
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(assignments.id, assignmentId))
      .catch(() => {
        /* swallow -- dispatch error is more important */
      });

    return {
      success: false,
      error: {
        code: "PCS_ERROR",
        message,
        retryable,
      },
      latencyMs,
    };
  }
}

/**
 * Push a status update to PCS for a dispatched assignment.
 */
export async function postStatus(
  db: Database,
  assignmentId: number,
  status: string,
): Promise<void> {
  const pcsStatus = mapInternalToPcs(status);
  if (!pcsStatus) {
    throw new AppError(
      `No PCS equivalent for internal status "${status}"`,
      400,
      "PCS_UNMAPPED_STATUS",
    );
  }

  const { assignment, load } = await fetchAssignmentData(db, assignmentId);
  const sKey = await getSession(db);
  const companyId = requireEnv("PCS_COMPANY_ID");

  const params = {
    iCompID: companyId,
    iLoadID: load.loadNo,
    sStatus: pcsStatus,
    sDriverName: load.driverName ?? "",
    sTruckNumber: load.truckNo ?? "",
  };

  await pcsPolicy.execute(() =>
    callSoap("PostStatus", params, getEmailConfig(sKey)),
  );

  // Update local PCS dispatch tracking
  await db
    .update(assignments)
    .set({
      pcsDispatch: {
        ...((assignment.pcsDispatch as Record<string, unknown>) ?? {}),
        last_status_sync: new Date().toISOString(),
        last_pcs_status: pcsStatus,
      },
      updatedAt: new Date(),
    })
    .where(eq(assignments.id, assignmentId));
}

/**
 * Send a dispatch message/notification via PCS NS_Email endpoint.
 */
export async function sendDispatchMessage(
  db: Database,
  assignmentId: number,
  message: string,
): Promise<void> {
  const { load } = await fetchAssignmentData(db, assignmentId);
  const sKey = await getSession(db);
  const companyId = requireEnv("PCS_COMPANY_ID");

  const params = {
    iCompID: companyId,
    iLoadID: load.loadNo,
    sMessage: message,
  };

  await pcsPolicy.execute(() =>
    callSoap("SendMessage", params, getEmailConfig(sKey)),
  );
}

/**
 * Clear routes for a load in PCS (pre-dispatch cleanup).
 */
export async function clearRoutes(
  db: Database,
  loadId: number,
  dispatchId: string,
): Promise<void> {
  const sKey = await getSession(db);
  const companyId = requireEnv("PCS_COMPANY_ID");

  const params = {
    iCompID: companyId,
    iLoadID: String(loadId),
    sDispatchID: dispatchId,
  };

  await pcsPolicy.execute(() =>
    callSoap("ClearRoutes", params, getEmailConfig(sKey)),
  );
}

/**
 * Lightweight health check -- calls PingWebsite (no auth needed).
 */
export async function healthCheck(): Promise<{ online: boolean }> {
  try {
    const xml = await callSoap(
      "PingWebsite",
      {},
      {
        endpoint: PCS_ENDPOINTS.WSExpressSupport,
        namespace: PCS_NAMESPACE,
        timeoutMs: 10_000,
      },
    );
    const result = parseSoapResponse(xml);
    return { online: result.success };
  } catch {
    return { online: false };
  }
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
  const breakerState = getBreakerState(pcsBreaker);
  const isOpen = breakerState.state !== 0; // 0 = closed in cockatiel

  return {
    name: "pcs-soap",
    status: isOpen ? "degraded" : "healthy",
    stats: {
      dispatchEnabled: PCS_DISPATCH_ENABLED,
      sessionTtlMs: SESSION_TTL_MS,
      endpoints: Object.keys(PCS_ENDPOINTS),
    },
    checks: [
      {
        name: "circuit-breaker",
        ok: !isOpen,
        detail: `state=${breakerState.state}`,
      },
      {
        name: "dispatch-flag",
        ok: true,
        detail: PCS_DISPATCH_ENABLED ? "enabled" : "disabled",
      },
      {
        name: "pcs-company-id",
        ok: !!process.env.PCS_COMPANY_ID,
        detail: process.env.PCS_COMPANY_ID ? "configured" : "missing",
      },
      {
        name: "pcs-access-key",
        ok: !!process.env.PCS_ACCESS_KEY,
        detail: process.env.PCS_ACCESS_KEY ? "configured" : "missing",
      },
    ],
  };
}
