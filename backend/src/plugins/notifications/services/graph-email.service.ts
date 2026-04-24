import { createGraphBreaker } from "../../../lib/circuit-breaker.js";
import { HttpError, NetworkError } from "../../../lib/errors.js";

// Module-level breaker for outbound Graph calls (token + sendMail).
// Retries 5xx + network/timeout. Opens after 3 consecutive transient
// failures with a 60s cooldown.
const { policy: graphPolicy } = createGraphBreaker();
async function graphFetch(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  return graphPolicy.execute(async () => {
    let res: Response;
    try {
      res = await globalThis.fetch(url, init);
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new NetworkError("TIMEOUT", `Graph request timed out: ${url}`);
      }
      throw new NetworkError(
        (err as NodeJS.ErrnoException).code ?? "UNKNOWN",
        `Graph fetch failed: ${(err as Error).message}`,
      );
    }
    if (res.status >= 500) {
      const body = await res.text().catch(() => "");
      throw new HttpError(res.status, body);
    }
    return res;
  });
}

/**
 * Microsoft Graph Email Service
 * =============================
 *
 * Sends outbound email on behalf of a configured sender mailbox via the
 * Graph `/users/{sender}/sendMail` endpoint using client-credentials OAuth2.
 *
 * Auth model (confirmed against MS docs):
 *   1. POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
 *        grant_type=client_credentials, scope=https://graph.microsoft.com/.default
 *   2. Token response includes `access_token` + `expires_in` (seconds).
 *   3. Bearer the access_token on sendMail requests.
 *
 * We cache the token in memory with a safety-margin TTL so concurrent sends
 * share one token. A singleflight promise prevents thundering-herd fetches
 * when the cache is cold.
 *
 * Patterned after pcs-soap.service.ts (session management with TTL refresh).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphSendMailOpts {
  to: string;
  subject: string;
  /** HTML body. Plain text is supported via `contentType: "Text"` but we
   *  standardize on HTML because every template goes through the layout. */
  html: string;
  /** Override the default sender from env. */
  senderOverride?: string;
}

export interface GraphSendResult {
  success: boolean;
  error?: string;
  /** Non-retryable failures (bad credentials, malformed request, etc). */
  fatal?: boolean;
}

interface TokenCacheEntry {
  accessToken: string;
  /** Unix ms when this token should be considered expired (with safety margin). */
  expiresAtMs: number;
}

interface GraphEnvConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  senderEmail: string;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** In-memory token cache, keyed by tenant+client to survive env swaps in tests. */
const tokenCache = new Map<string, TokenCacheEntry>();

/** Singleflight: if a token fetch is in-flight for a key, reuse the promise. */
const inflightTokenFetches = new Map<string, Promise<string>>();

/** 60-second safety margin — expire tokens early so we never bearer a stale one. */
const TOKEN_SAFETY_MARGIN_MS = 60_000;

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

/**
 * Read Graph env vars. Returns null if any required var is missing — the
 * caller logs + records a failed notification_events row rather than throwing
 * so that a misconfigured env doesn't crash auth flow.
 */
export function readGraphConfig(): GraphEnvConfig | null {
  const tenantId = process.env.GRAPH_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;
  const senderEmail = process.env.GRAPH_SENDER_EMAIL ?? "jryan@lexcom.com";

  if (!tenantId || !clientId || !clientSecret) {
    return null;
  }
  return { tenantId, clientId, clientSecret, senderEmail };
}

// ---------------------------------------------------------------------------
// Token acquisition
// ---------------------------------------------------------------------------

/**
 * Acquire an access token (from cache if valid, else fetch). Uses
 * singleflight to dedupe concurrent fetches.
 */
async function getAccessToken(cfg: GraphEnvConfig): Promise<string> {
  const key = `${cfg.tenantId}:${cfg.clientId}`;
  const now = Date.now();

  const cached = tokenCache.get(key);
  if (cached && cached.expiresAtMs > now) {
    return cached.accessToken;
  }

  const inflight = inflightTokenFetches.get(key);
  if (inflight) {
    return inflight;
  }

  const promise = fetchToken(cfg).finally(() => {
    inflightTokenFetches.delete(key);
  });
  inflightTokenFetches.set(key, promise);
  return promise;
}

async function fetchToken(cfg: GraphEnvConfig): Promise<string> {
  const url = `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await graphFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "<no body>");
    throw new Error(
      `Graph token fetch failed (${res.status}): ${text.slice(0, 400)}`,
    );
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  if (!json.access_token) {
    throw new Error("Graph token response missing access_token");
  }

  const key = `${cfg.tenantId}:${cfg.clientId}`;
  const expiresAtMs =
    Date.now() + Math.max(0, json.expires_in * 1000 - TOKEN_SAFETY_MARGIN_MS);

  tokenCache.set(key, { accessToken: json.access_token, expiresAtMs });
  return json.access_token;
}

/** Test hook — clear the token cache between tests. */
export function __resetTokenCacheForTests(): void {
  tokenCache.clear();
  inflightTokenFetches.clear();
}

// ---------------------------------------------------------------------------
// sendMail
// ---------------------------------------------------------------------------

/**
 * Send an email via Graph. Returns structured success/error — callers are
 * responsible for logging to notification_events and deciding whether to
 * retry.
 *
 * Fatal errors (no env config, 4xx auth errors) set `fatal: true` so the
 * caller skips retry. Transient errors (5xx, network) leave `fatal: false`.
 */
export async function sendMail(
  opts: GraphSendMailOpts,
): Promise<GraphSendResult> {
  const cfg = readGraphConfig();
  if (!cfg) {
    return {
      success: false,
      fatal: true,
      error: "GRAPH_* env vars not configured",
    };
  }

  const sender = opts.senderOverride ?? cfg.senderEmail;

  let accessToken: string;
  try {
    accessToken = await getAccessToken(cfg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Token endpoint 4xx is fatal (bad creds, wrong tenant); 5xx / network is retryable.
    const fatal = /\(4\d\d\)/.test(msg);
    return { success: false, error: `Token fetch: ${msg}`, fatal };
  }

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;
  const payload = {
    message: {
      subject: opts.subject,
      body: { contentType: "HTML", content: opts.html },
      toRecipients: [{ emailAddress: { address: opts.to } }],
    },
    saveToSentItems: "true",
  };

  let res: Response;
  try {
    res = await graphFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Network errors are retryable
    return { success: false, error: `Network: ${msg}`, fatal: false };
  }

  // Graph sendMail returns 202 Accepted on success (no body).
  if (res.status === 202) {
    return { success: true };
  }

  const text = await res.text().catch(() => "<no body>");
  const fatal = res.status >= 400 && res.status < 500;
  return {
    success: false,
    error: `Graph sendMail ${res.status}: ${text.slice(0, 400)}`,
    fatal,
  };
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
  const cfg = readGraphConfig();
  const configured = cfg !== null;

  return {
    name: "graph-email",
    status: configured ? "healthy" : "degraded",
    stats: {
      configured,
      sender: cfg?.senderEmail ?? null,
      cachedTokens: tokenCache.size,
    },
    checks: [
      {
        name: "graph-tenant-id",
        ok: !!process.env.GRAPH_TENANT_ID,
        detail: process.env.GRAPH_TENANT_ID ? "configured" : "missing",
      },
      {
        name: "graph-client-id",
        ok: !!process.env.GRAPH_CLIENT_ID,
        detail: process.env.GRAPH_CLIENT_ID ? "configured" : "missing",
      },
      {
        name: "graph-client-secret",
        ok: !!process.env.GRAPH_CLIENT_SECRET,
        detail: process.env.GRAPH_CLIENT_SECRET ? "configured" : "missing",
      },
    ],
  };
}
