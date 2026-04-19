/**
 * PCS OAuth2 Token Provider — Phase 2
 * ===================================
 *
 * Client-credentials grant against the PCS Authorization API:
 *   POST {PCS_BASE_URL}/authorization/v1/tokens/oauth
 *   body: grant_type=client_credentials, client_id=..., client_secret=...
 *   response: { access_token, expires_in }
 *
 * Token management:
 *   - In-memory cache keyed on client_id
 *   - Refresh when <10% of TTL remains (avoids mid-call expiry)
 *   - Singleflight: concurrent callers share one in-flight refresh
 *   - Persist snapshot to pcs_sessions with sessionType='oauth' for TTL visibility
 *
 * Swap boundary: this service owns ALL token acquisition. Downstream REST
 * clients (pcs-rest.service.ts) call getAccessToken() and never touch the
 * Authorization API directly.
 *
 * Reference: Kyle Puryear (PCS) email 2026-04-16 + Authorization API v1 Swagger.
 */

import { Configuration } from "../../../generated/pcs/auth-client/runtime.js";
import { TokensApi } from "../../../generated/pcs/auth-client/apis/TokensApi.js";
import { createPcsBreaker } from "../../../lib/circuit-breaker.js";
import { AppError, NetworkError } from "../../../lib/errors.js";
import { pcsSessions } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";

const { policy: authPolicy } = createPcsBreaker();

const REFRESH_THRESHOLD_RATIO = 0.1; // refresh when <10% TTL remains

interface TokenCacheEntry {
  accessToken: string;
  expiresAtMs: number; // absolute epoch ms
  issuedAtMs: number;
  expiresInSec: number;
}

/** In-memory token cache keyed on client_id. Process-local. */
const tokenCache = new Map<string, TokenCacheEntry>();

/** In-flight refresh tracker to avoid thundering herd. */
const inFlight = new Map<string, Promise<string>>();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new AppError(
      `PCS OAuth not configured. Set ${key} in environment.`,
      503,
      "PCS_AUTH_MISSING_CREDS",
    );
  }
  return value;
}

/** Returns the PCS API base URL, stripped of trailing slash. */
export function getPcsBaseUrl(): string {
  const raw = process.env.PCS_BASE_URL ?? "https://api.pcssoft.com";
  return raw.replace(/\/+$/, "");
}

function isCacheValid(entry: TokenCacheEntry, nowMs: number): boolean {
  const ttlMs = entry.expiresInSec * 1000;
  const remainingMs = entry.expiresAtMs - nowMs;
  return remainingMs > ttlMs * REFRESH_THRESHOLD_RATIO;
}

function buildAuthApi(): TokensApi {
  const basePath = `${getPcsBaseUrl()}/authorization/v1`;
  const config = new Configuration({ basePath });
  return new TokensApi(config);
}

/**
 * Fetch a new access token via client-credentials grant and update cache + DB.
 * Private — callers use getAccessToken().
 */
async function mintNewToken(
  db: Database,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const api = buildAuthApi();

  const response = await authPolicy.execute(async () => {
    try {
      return await api.tokensOauthPost({
        grantType: "client_credentials",
        clientId,
        clientSecret,
      });
    } catch (err: unknown) {
      // Rewrap fetch / network errors so circuit breaker recognizes them
      const msg = err instanceof Error ? err.message : String(err);
      if (
        err instanceof TypeError ||
        (err instanceof Error && err.name === "AbortError") ||
        (err instanceof Error && err.name === "TimeoutError")
      ) {
        throw new NetworkError(`PCS OAuth request failed: ${msg}`);
      }
      throw err;
    }
  });

  const accessToken = response.accessToken;
  const expiresInSec = response.expiresIn;

  if (!accessToken || typeof expiresInSec !== "number") {
    throw new AppError(
      "PCS OAuth response missing access_token or expires_in",
      502,
      "PCS_AUTH_BAD_RESPONSE",
    );
  }

  const nowMs = Date.now();
  const entry: TokenCacheEntry = {
    accessToken,
    expiresAtMs: nowMs + expiresInSec * 1000,
    issuedAtMs: nowMs,
    expiresInSec,
  };
  tokenCache.set(clientId, entry);

  // Persist a session marker for visibility. Do NOT store the plaintext token
  // long-term; this is a short-lived TTL record. Use ISO strings for the
  // timestamp (postgres.js + prepare:false crashes on Date objects).
  try {
    await db.insert(pcsSessions).values({
      sessionType: "oauth",
      token: accessToken,
      companyId: clientId,
      expiresAt: new Date(entry.expiresAtMs),
    });
  } catch {
    // DB write is observational only — failure here should not block auth.
  }

  return accessToken;
}

/**
 * Return a valid PCS access token, refreshing if near expiry.
 * Singleflight: concurrent callers for the same client_id share a refresh.
 */
export async function getAccessToken(db: Database): Promise<string> {
  const clientId = requireEnv("PCS_CLIENT_ID");
  const clientSecret = requireEnv("PCS_CLIENT_SECRET");
  const nowMs = Date.now();

  const cached = tokenCache.get(clientId);
  if (cached && isCacheValid(cached, nowMs)) {
    return cached.accessToken;
  }

  const pending = inFlight.get(clientId);
  if (pending) return pending;

  const refresh = mintNewToken(db, clientId, clientSecret).finally(() => {
    inFlight.delete(clientId);
  });
  inFlight.set(clientId, refresh);
  return refresh;
}

/**
 * Test-only. Clears the in-memory token cache.
 */
export function __clearTokenCache(): void {
  tokenCache.clear();
  inFlight.clear();
}

/**
 * Diagnostic snapshot — safe for /diag/ surface.
 * Does NOT leak the access token.
 */
export function authDiagnostics(): {
  credentialsConfigured: boolean;
  cacheSize: number;
  cachedClientIds: string[];
  baseUrl: string;
} {
  return {
    credentialsConfigured: Boolean(
      process.env.PCS_CLIENT_ID && process.env.PCS_CLIENT_SECRET,
    ),
    cacheSize: tokenCache.size,
    cachedClientIds: Array.from(tokenCache.keys()),
    baseUrl: getPcsBaseUrl(),
  };
}
