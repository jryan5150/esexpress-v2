import { HttpError, NetworkError } from "../../../lib/errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogistiqConfig {
  baseUrl?: string;
  email?: string; // required for session auth (searchOrders)
  password?: string; // required for session auth (searchOrders)
  apiKey?: string; // required for carrier export (no session needed)
  carrierId?: number;
  entityId?: number;
  roleId?: number;
  roleTypeId?: number;
}

export interface LogistiqOrder {
  orderId: string;
  loadNo: string;
  orderNo: string;
  driverName: string;
  carrierName: string;
  origin: string;
  destination: string;
  weight: number;
  status: string;
  deliveredOn: string | null;
  [key: string]: unknown;
}

interface TokenState {
  token: string;
  expiresAt: number;
}

interface AuthLoginResponse {
  status: number;
  message?: string;
  data: {
    code: string;
    roles?: Array<{
      entityId: number;
      roleId: number;
      roleTypeId: number;
    }>;
  };
}

interface AuthChooseRoleResponse {
  status: number;
  message?: string;
  data: {
    token: string;
    expiresIn?: number; // seconds
  };
}

interface OrderSearchResponse {
  status: number;
  message?: string;
  data: {
    orders: unknown[];
    count: number;
  };
}

interface CarrierExportResponse {
  downloadUrl: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "https://api.logistixiq.io";
const CARRIER_EXPORT_URL =
  "https://fhll67llek.execute-api.us-east-1.amazonaws.com/prod/carrier-export";
const REQUEST_TIMEOUT_MS = 15_000;
const S3_DOWNLOAD_TIMEOUT_MS = 30_000;
const TOKEN_TTL_SECONDS = 86_400; // 24 hours
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1_000; // 5 minutes before expiry
const MAX_CARRIER_EXPORT_DAYS = 31;

/**
 * Exported for testing — the buffer (in ms) subtracted from token expiry
 * to trigger proactive refresh.
 */
export const LOGISTIQ_TOKEN_REFRESH_BUFFER_MS = TOKEN_REFRESH_BUFFER_MS;

/**
 * Exported for testing — max days per carrier export request.
 */
export const LOGISTIQ_MAX_EXPORT_DAYS = MAX_CARRIER_EXPORT_DAYS;

// ---------------------------------------------------------------------------
// Helpers — date range chunking (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Split a date range into chunks of at most `maxDays` inclusive days.
 * For example, maxDays=31: [Jan 1, Jan 31], [Feb 1, Mar 3], etc.
 * Returns an array of [from, to] pairs where each span <= maxDays.
 */
export function chunkDateRange(
  from: Date,
  to: Date,
  maxDays: number,
): Array<[Date, Date]> {
  if (from > to) return [];
  const chunks: Array<[Date, Date]> = [];
  let cursor = new Date(from);

  while (cursor <= to) {
    const chunkEnd = new Date(cursor);
    // maxDays inclusive: add (maxDays - 1) to get the last day of this chunk
    chunkEnd.setDate(chunkEnd.getDate() + maxDays - 1);
    // Clamp to `to`
    const end = chunkEnd > to ? new Date(to) : chunkEnd;
    chunks.push([new Date(cursor), end]);
    // Next chunk starts day after this chunk ends
    cursor = new Date(end);
    cursor.setDate(cursor.getDate() + 1);
  }

  return chunks;
}

/**
 * Returns true if the token is still valid (not expired, not within
 * the refresh buffer window).
 */
export function isTokenFresh(tokenState: TokenState | null): boolean {
  if (!tokenState) return false;
  return Date.now() < tokenState.expiresAt - TOKEN_REFRESH_BUFFER_MS;
}

// ---------------------------------------------------------------------------
// LogistiqClient
// ---------------------------------------------------------------------------

export class LogistiqClient {
  private readonly baseUrl: string;
  private readonly email: string;
  private readonly password: string;
  private readonly apiKey: string | undefined;
  private readonly carrierId: number;
  private readonly entityId: number;
  private readonly roleId: number;
  private readonly roleTypeId: number;

  private tokenState: TokenState | null = null;
  private authPromise: Promise<void> | null = null; // dedup concurrent auth
  private lastAuthAt: number | null = null;
  private authCount = 0;
  private requestCount = 0;
  private lastError: string | null = null;

  constructor(config: LogistiqConfig) {
    // Allow API-key-only mode for carrier export (no session auth needed)
    if (!config.apiKey && !config.email) {
      throw new Error(
        "LogistiqClient requires an email (session auth) or apiKey (carrier export)",
      );
    }
    if (config.email && !config.password) {
      throw new Error(
        "LogistiqClient requires a password when email is provided",
      );
    }

    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.email = config.email ?? "";
    this.password = config.password ?? "";
    this.apiKey = config.apiKey;
    this.carrierId = config.carrierId ?? 413;
    this.entityId = config.entityId ?? 413;
    this.roleId = config.roleId ?? 3;
    this.roleTypeId = config.roleTypeId ?? 1;
  }

  // -------------------------------------------------------------------------
  // Auth — 2-step JWT flow with dedup promise
  // -------------------------------------------------------------------------

  /**
   * Authenticate with Logistiq via the 2-step JWT flow.
   * Concurrent calls share the same in-flight promise (dedup pattern).
   */
  async authenticate(): Promise<void> {
    // If a fresh token exists, skip
    if (isTokenFresh(this.tokenState)) return;

    // Dedup: if auth is already in flight, share that promise
    if (this.authPromise) return this.authPromise;

    this.authPromise = this.doAuthenticate();
    try {
      await this.authPromise;
    } finally {
      this.authPromise = null;
    }
  }

  private async doAuthenticate(): Promise<void> {
    // Step 1: Login
    const loginUrl = `${this.baseUrl}/v2/auth/login`;
    const loginBody = JSON.stringify({
      email: this.email,
      password: this.password,
    });

    let loginRes: Response;
    try {
      loginRes = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err: unknown) {
      this.lastError = `Auth login fetch failed: ${(err as Error).message}`;
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new NetworkError("TIMEOUT", `Logistiq login timed out`);
      }
      throw new NetworkError(
        (err as NodeJS.ErrnoException).code ?? "UNKNOWN",
        `Logistiq login failed: ${(err as Error).message}`,
      );
    }

    if (!loginRes.ok) {
      const body = await loginRes.text().catch(() => "");
      this.lastError = `Auth login HTTP ${loginRes.status}`;
      throw new HttpError(loginRes.status, body);
    }

    const loginData = (await loginRes.json()) as AuthLoginResponse;
    if (loginData.status !== 200) {
      this.lastError = `Auth login rejected: ${loginData.message}`;
      throw new Error(`Logistiq login failed: ${loginData.message}`);
    }

    const code = loginData.data.code;
    const roles = loginData.data.roles ?? [];

    // Pick matching entity role or fall back to first
    const role = roles.find((r) => r.entityId === this.entityId) ?? roles[0];

    // Step 2: Choose role
    const roleUrl = `${this.baseUrl}/v2/auth/choose-role/atmz`;
    const roleBody = JSON.stringify({
      code,
      roleId: role?.roleId ?? this.roleId,
      entityId: role?.entityId ?? this.entityId,
      roleTypeId: role?.roleTypeId ?? this.roleTypeId,
    });

    let roleRes: Response;
    try {
      roleRes = await fetch(roleUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `jwt ${code}`,
        },
        body: roleBody,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err: unknown) {
      this.lastError = `Auth choose-role fetch failed: ${(err as Error).message}`;
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new NetworkError("TIMEOUT", `Logistiq role selection timed out`);
      }
      throw new NetworkError(
        (err as NodeJS.ErrnoException).code ?? "UNKNOWN",
        `Logistiq role selection failed: ${(err as Error).message}`,
      );
    }

    if (!roleRes.ok) {
      const body = await roleRes.text().catch(() => "");
      this.lastError = `Auth choose-role HTTP ${roleRes.status}`;
      throw new HttpError(roleRes.status, body);
    }

    const roleData = (await roleRes.json()) as AuthChooseRoleResponse;
    if (roleData.status !== 200) {
      this.lastError = `Auth choose-role rejected: ${roleData.message}`;
      throw new Error(`Logistiq role selection failed: ${roleData.message}`);
    }

    const expiresInSec = roleData.data.expiresIn ?? TOKEN_TTL_SECONDS;

    this.tokenState = {
      token: roleData.data.token,
      expiresAt: Date.now() + expiresInSec * 1_000,
    };
    this.lastAuthAt = Date.now();
    this.authCount++;
    this.lastError = null;
  }

  /**
   * Ensure a valid token exists, then return it.
   */
  private async getToken(): Promise<string> {
    await this.authenticate();
    if (!this.tokenState) {
      throw new Error("Logistiq: authentication succeeded but no token set");
    }
    return this.tokenState.token;
  }

  // -------------------------------------------------------------------------
  // Orders — POST /v2/order/search with pagination
  // -------------------------------------------------------------------------

  /**
   * Search orders within a date range. Handles pagination automatically.
   */
  async searchOrders(from: Date, to: Date): Promise<LogistiqOrder[]> {
    const token = await this.getToken();
    const allOrders: LogistiqOrder[] = [];
    let page = 1;
    const limit = 100;

    const dateFilter = {
      expectedPickupTimeStart: from.toISOString(),
      expectedPickupTimeEnd: to.toISOString(),
    };

    while (true) {
      const url = `${this.baseUrl}/v2/order/search`;
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `jwt ${token}`,
          },
          body: JSON.stringify({ page, limit, ...dateFilter }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        this.requestCount++;
      } catch (err: unknown) {
        this.lastError = `Order search fetch failed: ${(err as Error).message}`;
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new NetworkError("TIMEOUT", `Logistiq order search timed out`);
        }
        throw new NetworkError(
          (err as NodeJS.ErrnoException).code ?? "UNKNOWN",
          `Logistiq order search failed: ${(err as Error).message}`,
        );
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.lastError = `Order search HTTP ${res.status}`;
        throw new HttpError(res.status, body);
      }

      const data = (await res.json()) as OrderSearchResponse;
      if (data.status !== 200) {
        this.lastError = `Order search rejected: ${data.message}`;
        throw new Error(`Logistiq order search failed: ${data.message}`);
      }

      const orders = data.data?.orders ?? [];
      if (!Array.isArray(orders) || orders.length === 0) break;

      allOrders.push(...(orders as LogistiqOrder[]));
      if (orders.length < limit) break;
      page++;
    }

    return allOrders;
  }

  // -------------------------------------------------------------------------
  // Carrier Export — Lambda endpoint with S3 download
  // -------------------------------------------------------------------------

  /**
   * Fetch orders via the carrier export API. Automatically chunks date
   * ranges exceeding 31 days into sequential requests, then combines results.
   */
  async getCarrierExport(from: Date, to: Date): Promise<LogistiqOrder[]> {
    if (!this.apiKey) {
      throw new Error("LogistiqClient: apiKey is required for carrier export");
    }

    const chunks = chunkDateRange(from, to, MAX_CARRIER_EXPORT_DAYS);
    const allOrders: LogistiqOrder[] = [];

    for (const [chunkFrom, chunkTo] of chunks) {
      const orders = await this.fetchCarrierExportChunk(chunkFrom, chunkTo);
      allOrders.push(...orders);
    }

    return allOrders;
  }

  private async fetchCarrierExportChunk(
    from: Date,
    to: Date,
  ): Promise<LogistiqOrder[]> {
    // API requires GET with query params, dates as "YYYY-MM-DD HH:MM:SS"
    const startDt = `${from.toISOString().slice(0, 10)} 00:00:00`;
    const endDt = `${to.toISOString().slice(0, 10)} 23:59:59`;
    const params = new URLSearchParams({
      start_datetime: startDt,
      end_datetime: endDt,
      CarrierID: String(this.carrierId),
    });

    // Step 1: Request export — returns S3 download URL in export_info
    let res: Response;
    try {
      res = await fetch(`${CARRIER_EXPORT_URL}?${params}`, {
        method: "GET",
        headers: {
          "x-api-key": this.apiKey!,
        },
        signal: AbortSignal.timeout(60_000), // exports can take 30s for large sets
      });
      this.requestCount++;
    } catch (err: unknown) {
      this.lastError = `Carrier export fetch failed: ${(err as Error).message}`;
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new NetworkError("TIMEOUT", `Logistiq carrier export timed out`);
      }
      throw new NetworkError(
        (err as NodeJS.ErrnoException).code ?? "UNKNOWN",
        `Logistiq carrier export failed: ${(err as Error).message}`,
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      this.lastError = `Carrier export HTTP ${res.status}`;
      throw new HttpError(res.status, text);
    }

    const exportData = (await res.json()) as {
      success: boolean;
      export_info?: { download_url: string; record_count: number };
      error?: string;
    };

    const downloadUrl = exportData.export_info?.download_url;
    if (!downloadUrl) {
      throw new Error(
        `Logistiq carrier export: no download_url in response. ${exportData.error ?? ""}`,
      );
    }

    // Step 2: Download the JSON file from S3
    let s3Res: Response;
    try {
      s3Res = await fetch(downloadUrl, {
        method: "GET",
        signal: AbortSignal.timeout(S3_DOWNLOAD_TIMEOUT_MS),
      });
      this.requestCount++;
    } catch (err: unknown) {
      this.lastError = `S3 download failed: ${(err as Error).message}`;
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new NetworkError("TIMEOUT", `Logistiq S3 download timed out`);
      }
      throw new NetworkError(
        (err as NodeJS.ErrnoException).code ?? "UNKNOWN",
        `Logistiq S3 download failed: ${(err as Error).message}`,
      );
    }

    if (!s3Res.ok) {
      const text = await s3Res.text().catch(() => "");
      this.lastError = `S3 download HTTP ${s3Res.status}`;
      throw new HttpError(s3Res.status, text);
    }

    // S3 file has { export_metadata, records: [...] }
    const fileData = (await s3Res.json()) as { records?: LogistiqOrder[] };
    const orders = fileData.records ?? (fileData as unknown as LogistiqOrder[]);
    return Array.isArray(orders) ? orders : [];
  }

  // -------------------------------------------------------------------------
  // Diagnostics
  // -------------------------------------------------------------------------

  diagnostics() {
    const hasToken = this.tokenState !== null;
    const tokenFresh = isTokenFresh(this.tokenState);
    const tokenExpiresIn = this.tokenState
      ? this.tokenState.expiresAt - Date.now()
      : undefined;

    return {
      name: "logistiq-client",
      status: (this.lastError ? "degraded" : "healthy") as
        | "healthy"
        | "degraded"
        | "error",
      stats: {
        authCount: this.authCount,
        requestCount: this.requestCount,
        carrierId: this.carrierId,
      },
      checks: [
        {
          name: "token",
          ok: hasToken && tokenFresh,
          detail: hasToken
            ? tokenFresh
              ? `valid, expires in ${Math.round((tokenExpiresIn ?? 0) / 1_000)}s`
              : "expired or near-expiry"
            : "no token",
        },
        {
          name: "carrier-export",
          ok: !!this.apiKey,
          detail: this.apiKey
            ? "api key configured"
            : "no api key — carrier export unavailable",
        },
        ...(this.lastError
          ? [
              {
                name: "last-error",
                ok: false,
                detail: this.lastError,
              },
            ]
          : []),
      ],
    };
  }
}
