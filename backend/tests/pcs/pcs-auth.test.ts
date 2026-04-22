import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getAccessToken,
  getPcsBaseUrl,
  authDiagnostics,
  __clearTokenCache,
} from "../../src/plugins/pcs/services/pcs-auth.service.js";

// ---------------------------------------------------------------------------
// Minimal fake Database — the auth service only uses it for an observational
// INSERT into pcs_sessions. We record the call but don't simulate real SQL.
// ---------------------------------------------------------------------------

type InsertCall = { table: unknown; values: unknown };

function makeFakeDb(): {
  db: {
    insert: (t: unknown) => { values: (v: unknown) => Promise<void> };
  };
  inserts: InsertCall[];
} {
  const inserts: InsertCall[] = [];
  const db = {
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        inserts.push({ table, values });
      },
    }),
  };
  return { db, inserts };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockOauthResponse(accessToken: string, expiresInSec: number) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({
      access_token: accessToken,
      expires_in: expiresInSec,
    }),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  __clearTokenCache();
  process.env.PCS_CLIENT_ID = "test-client-id";
  process.env.PCS_CLIENT_SECRET = "test-client-secret";
  process.env.PCS_BASE_URL = "https://api.pcssoft.com";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PCS Auth — getPcsBaseUrl", () => {
  it("returns env PCS_BASE_URL with trailing slash stripped", () => {
    process.env.PCS_BASE_URL = "https://api.pcssoft.com/";
    expect(getPcsBaseUrl()).toBe("https://api.pcssoft.com");
  });

  it("falls back to api.pcssoft.com when unset", () => {
    delete process.env.PCS_BASE_URL;
    expect(getPcsBaseUrl()).toBe("https://api.pcssoft.com");
  });
});

describe("PCS Auth — authDiagnostics", () => {
  it("reports credentials configured when both vars are set", () => {
    const diag = authDiagnostics();
    expect(diag.credentialsConfigured).toBe(true);
    expect(diag.cacheSize).toBe(0);
    expect(diag.baseUrl).toBe("https://api.pcssoft.com");
  });

  it("reports credentials NOT configured when secret missing", () => {
    delete process.env.PCS_CLIENT_SECRET;
    const diag = authDiagnostics();
    expect(diag.credentialsConfigured).toBe(false);
  });
});

describe("PCS Auth — getAccessToken", () => {
  it("POSTs client-credentials to /authorization/v1/tokens/oauth", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockOauthResponse("tok-123", 3600));
    vi.stubGlobal("fetch", fetchMock);

    const { db } = makeFakeDb();
    const token = await getAccessToken(db as never);

    expect(token).toBe("tok-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toBe(
      "https://api.pcssoft.com/authorization/v1/tokens/oauth",
    );
    expect(init?.method).toBe("POST");

    // Body is URLSearchParams (application/x-www-form-urlencoded)
    const body =
      init?.body instanceof URLSearchParams
        ? init.body
        : new URLSearchParams(String(init?.body ?? ""));
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_id")).toBe("test-client-id");
    expect(body.get("client_secret")).toBe("test-client-secret");
  });

  it("caches the token and skips the network on the second call", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockOauthResponse("tok-abc", 3600));
    vi.stubGlobal("fetch", fetchMock);
    const { db } = makeFakeDb();

    const first = await getAccessToken(db as never);
    const second = await getAccessToken(db as never);

    expect(first).toBe("tok-abc");
    expect(second).toBe("tok-abc");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes when the cached token is near expiry", async () => {
    // Short TTL — isCacheValid requires >10% remaining.
    // After 95% of TTL we should refresh.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockOauthResponse("tok-first", 100))
      .mockResolvedValueOnce(mockOauthResponse("tok-second", 100));
    vi.stubGlobal("fetch", fetchMock);
    const { db } = makeFakeDb();

    const first = await getAccessToken(db as never);
    expect(first).toBe("tok-first");

    // Fast-forward wall clock by 95 seconds (>90% of TTL)
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 95_000);

    const second = await getAccessToken(db as never);
    expect(second).toBe("tok-second");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("singleflight — concurrent callers share one in-flight refresh", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pendingResponse);
    vi.stubGlobal("fetch", fetchMock);

    const { db } = makeFakeDb();
    const promises = [
      getAccessToken(db as never),
      getAccessToken(db as never),
      getAccessToken(db as never),
    ];
    // Resolve the shared fetch
    resolveFetch(mockOauthResponse("tok-shared", 3600));
    const tokens = await Promise.all(promises);

    expect(tokens).toEqual(["tok-shared", "tok-shared", "tok-shared"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws PCS_AUTH_MISSING_CREDS when env is not set", async () => {
    delete process.env.PCS_CLIENT_ID;
    const { db } = makeFakeDb();

    await expect(getAccessToken(db as never)).rejects.toThrow(
      /PCS OAuth not configured/,
    );
  });

  it("throws when the response body lacks access_token", async () => {
    const bad = {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ expires_in: 3600 }), // missing access_token
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(bad));

    const { db } = makeFakeDb();
    await expect(getAccessToken(db as never)).rejects.toThrow(
      /PCS OAuth response missing/,
    );
  });

  it("persists a pcs_sessions row on successful refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockOauthResponse("tok-persist", 3600)),
    );
    const { db, inserts } = makeFakeDb();

    await getAccessToken(db as never);

    expect(inserts).toHaveLength(1);
    const values = inserts[0].values as {
      sessionType: string;
      token: string;
      companyId: string;
      expiresAt: Date;
    };
    expect(values.sessionType).toBe("oauth");
    expect(values.token).toBe("tok-persist");
    expect(values.companyId).toBe("test-client-id");
    expect(values.expiresAt).toBeInstanceOf(Date);
  });
});
