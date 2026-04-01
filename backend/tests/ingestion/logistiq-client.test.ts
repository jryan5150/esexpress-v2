import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LogistiqClient,
  chunkDateRange,
  isTokenFresh,
  LOGISTIQ_TOKEN_REFRESH_BUFFER_MS,
  LOGISTIQ_MAX_EXPORT_DAYS,
  type LogistiqConfig,
  type LogistiqOrder,
} from "../../src/plugins/ingestion/services/logistiq.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<LogistiqConfig>): LogistiqConfig {
  return {
    email: "test@example.com",
    password: "test-password",
    apiKey: "test-api-key",
    carrierId: 413,
    ...overrides,
  };
}

/**
 * Builds a mock fetch that handles the 2-step auth flow and returns
 * a configurable response for order search / carrier export.
 */
function mockAuthFetch(options?: {
  loginStatus?: number;
  roleStatus?: number;
  searchOrders?: unknown[];
  searchCount?: number;
  exportDownloadUrl?: string;
  s3Data?: unknown[];
  failLogin?: boolean;
  failRole?: boolean;
}) {
  const opts = {
    loginStatus: 200,
    roleStatus: 200,
    searchOrders: [],
    searchCount: 0,
    exportDownloadUrl: "https://s3.example.com/export.json",
    s3Data: [],
    failLogin: false,
    failRole: false,
    ...options,
  };

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;

    // Step 1: Login
    if (url.includes("/v2/auth/login")) {
      if (opts.failLogin) {
        return new Response("Internal Server Error", { status: 500 });
      }
      return new Response(
        JSON.stringify({
          status: opts.loginStatus,
          message: opts.loginStatus === 200 ? "ok" : "Login failed",
          data: {
            code: "test-login-code",
            roles: [{ entityId: 413, roleId: 3, roleTypeId: 1 }],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Step 2: Choose role
    if (url.includes("/v2/auth/choose-role")) {
      if (opts.failRole) {
        return new Response("Internal Server Error", { status: 500 });
      }
      return new Response(
        JSON.stringify({
          status: opts.roleStatus,
          message: opts.roleStatus === 200 ? "ok" : "Role failed",
          data: {
            token: "test-session-token",
            expiresIn: 86400,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Order search
    if (url.includes("/v2/order/search")) {
      return new Response(
        JSON.stringify({
          status: 200,
          data: {
            orders: opts.searchOrders,
            count: opts.searchCount ?? opts.searchOrders.length,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Carrier export endpoint
    if (url.includes("carrier-export")) {
      return new Response(
        JSON.stringify({ downloadUrl: opts.exportDownloadUrl }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // S3 download
    if (url.includes("s3.example.com")) {
      return new Response(JSON.stringify(opts.s3Data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Logistiq Service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Exports
  // -----------------------------------------------------------------------

  it("exports LogistiqClient class", () => {
    expect(LogistiqClient).toBeDefined();
    expect(typeof LogistiqClient).toBe("function");
  });

  it("exports chunkDateRange helper", () => {
    expect(typeof chunkDateRange).toBe("function");
  });

  it("exports isTokenFresh helper", () => {
    expect(typeof isTokenFresh).toBe("function");
  });

  it("exports LOGISTIQ_TOKEN_REFRESH_BUFFER_MS constant", () => {
    expect(LOGISTIQ_TOKEN_REFRESH_BUFFER_MS).toBe(5 * 60 * 1000);
  });

  it("exports LOGISTIQ_MAX_EXPORT_DAYS constant", () => {
    expect(LOGISTIQ_MAX_EXPORT_DAYS).toBe(31);
  });

  // -----------------------------------------------------------------------
  // Constructor validation
  // -----------------------------------------------------------------------

  it("requires email", () => {
    expect(() => new LogistiqClient({ email: "", password: "pw" })).toThrow(
      "LogistiqClient requires an email",
    );
  });

  it("requires password", () => {
    expect(
      () => new LogistiqClient({ email: "a@b.com", password: "" }),
    ).toThrow("LogistiqClient requires a password");
  });

  it("accepts valid config with defaults", () => {
    const client = new LogistiqClient({
      email: "a@b.com",
      password: "pw",
    });
    expect(client).toBeInstanceOf(LogistiqClient);
  });

  it("accepts full config", () => {
    const client = new LogistiqClient(makeConfig());
    expect(client).toBeInstanceOf(LogistiqClient);
  });

  // -----------------------------------------------------------------------
  // isTokenFresh (pure function)
  // -----------------------------------------------------------------------

  describe("isTokenFresh", () => {
    it("returns false for null token", () => {
      expect(isTokenFresh(null)).toBe(false);
    });

    it("returns false for expired token", () => {
      expect(isTokenFresh({ token: "t", expiresAt: Date.now() - 1000 })).toBe(
        false,
      );
    });

    it("returns false when within refresh buffer", () => {
      // Token expires in 4 minutes — less than the 5-minute buffer
      const expiresAt = Date.now() + 4 * 60 * 1000;
      expect(isTokenFresh({ token: "t", expiresAt })).toBe(false);
    });

    it("returns true when token has plenty of time", () => {
      const expiresAt = Date.now() + 2 * 60 * 60 * 1000; // 2 hours out
      expect(isTokenFresh({ token: "t", expiresAt })).toBe(true);
    });

    it("returns true when exactly at buffer boundary + 1ms", () => {
      const expiresAt = Date.now() + LOGISTIQ_TOKEN_REFRESH_BUFFER_MS + 1;
      expect(isTokenFresh({ token: "t", expiresAt })).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // chunkDateRange (pure function)
  // -----------------------------------------------------------------------

  describe("chunkDateRange", () => {
    it("returns empty array when from > to", () => {
      const chunks = chunkDateRange(
        new Date("2026-02-01"),
        new Date("2026-01-01"),
        31,
      );
      expect(chunks).toEqual([]);
    });

    it("returns single chunk for range within maxDays", () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-01-15");
      const chunks = chunkDateRange(from, to, 31);
      expect(chunks).toHaveLength(1);
      expect(chunks[0][0].toISOString().slice(0, 10)).toBe("2026-01-01");
      expect(chunks[0][1].toISOString().slice(0, 10)).toBe("2026-01-15");
    });

    it("returns single chunk for exactly maxDays inclusive", () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-01-31"); // 31 inclusive days
      const chunks = chunkDateRange(from, to, 31);
      expect(chunks).toHaveLength(1);
      expect(chunks[0][0].toISOString().slice(0, 10)).toBe("2026-01-01");
      expect(chunks[0][1].toISOString().slice(0, 10)).toBe("2026-01-31");
    });

    it("splits at exactly maxDays + 1", () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-02-01"); // 32 inclusive days
      const chunks = chunkDateRange(from, to, 31);
      expect(chunks).toHaveLength(2);
      expect(chunks[0][0].toISOString().slice(0, 10)).toBe("2026-01-01");
      expect(chunks[0][1].toISOString().slice(0, 10)).toBe("2026-01-31");
      expect(chunks[1][0].toISOString().slice(0, 10)).toBe("2026-02-01");
      expect(chunks[1][1].toISOString().slice(0, 10)).toBe("2026-02-01");
    });

    it("splits range exceeding maxDays into multiple chunks", () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-03-15"); // ~73 days
      const chunks = chunkDateRange(from, to, 31);

      expect(chunks.length).toBeGreaterThan(1);

      // First chunk: Jan 1 -> Jan 31 (31 inclusive days)
      expect(chunks[0][0].toISOString().slice(0, 10)).toBe("2026-01-01");
      expect(chunks[0][1].toISOString().slice(0, 10)).toBe("2026-01-31");

      // Each chunk spans at most 31 days
      for (const [chunkFrom, chunkTo] of chunks) {
        const days =
          (chunkTo.getTime() - chunkFrom.getTime()) / (1000 * 60 * 60 * 24);
        expect(days).toBeLessThanOrEqual(31);
      }

      // Last chunk ends at or before the original `to`
      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk[1].toISOString().slice(0, 10)).toBe("2026-03-15");
    });

    it("handles single-day range", () => {
      const date = new Date("2026-06-15");
      const chunks = chunkDateRange(date, date, 31);
      expect(chunks).toHaveLength(1);
      expect(chunks[0][0].toISOString().slice(0, 10)).toBe("2026-06-15");
      expect(chunks[0][1].toISOString().slice(0, 10)).toBe("2026-06-15");
    });

    it("handles 2-day range with maxDays=1", () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-01-03");
      const chunks = chunkDateRange(from, to, 1);
      expect(chunks).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------

  describe("authenticate", () => {
    it("performs 2-step auth flow", async () => {
      const fetchSpy = mockAuthFetch();
      const client = new LogistiqClient(makeConfig());

      await client.authenticate();

      // Should have made 2 fetch calls (login + choose-role)
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      const firstCallUrl = fetchSpy.mock.calls[0][0] as string;
      const secondCallUrl = fetchSpy.mock.calls[1][0] as string;
      expect(firstCallUrl).toContain("/v2/auth/login");
      expect(secondCallUrl).toContain("/v2/auth/choose-role");
    });

    it("sends correct credentials in login request", async () => {
      const fetchSpy = mockAuthFetch();
      const client = new LogistiqClient(makeConfig());

      await client.authenticate();

      const loginInit = fetchSpy.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(loginInit.body as string);
      expect(body.email).toBe("test@example.com");
      expect(body.password).toBe("test-password");
    });

    it("sends jwt code in choose-role authorization header", async () => {
      const fetchSpy = mockAuthFetch();
      const client = new LogistiqClient(makeConfig());

      await client.authenticate();

      const roleInit = fetchSpy.mock.calls[1][1] as RequestInit;
      const headers = roleInit.headers as Record<string, string>;
      expect(headers.Authorization).toBe("jwt test-login-code");
    });

    it("reuses token on second call (no re-auth)", async () => {
      const fetchSpy = mockAuthFetch();
      const client = new LogistiqClient(makeConfig());

      await client.authenticate();
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Second call should be a no-op (token is fresh)
      await client.authenticate();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("throws HttpError when login returns non-OK HTTP status", async () => {
      mockAuthFetch({ failLogin: true });
      const client = new LogistiqClient(makeConfig());

      await expect(client.authenticate()).rejects.toThrow("HTTP 500");
    });

    it("throws when login returns non-200 status in body", async () => {
      mockAuthFetch({ loginStatus: 401 });
      const client = new LogistiqClient(makeConfig());

      await expect(client.authenticate()).rejects.toThrow(
        "Logistiq login failed",
      );
    });

    it("throws HttpError when choose-role returns non-OK HTTP status", async () => {
      mockAuthFetch({ failRole: true });
      const client = new LogistiqClient(makeConfig());

      await expect(client.authenticate()).rejects.toThrow("HTTP 500");
    });

    it("throws when choose-role returns non-200 status in body", async () => {
      mockAuthFetch({ roleStatus: 401 });
      const client = new LogistiqClient(makeConfig());

      await expect(client.authenticate()).rejects.toThrow(
        "Logistiq role selection failed",
      );
    });

    it("dedup: concurrent auth calls share the same promise", async () => {
      const fetchSpy = mockAuthFetch();
      const client = new LogistiqClient(makeConfig());

      // Fire 3 concurrent auth calls
      const results = await Promise.all([
        client.authenticate(),
        client.authenticate(),
        client.authenticate(),
      ]);

      // Should only have made 2 fetch calls total (1 login + 1 role)
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      // All should resolve (no errors)
      expect(results).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // searchOrders
  // -----------------------------------------------------------------------

  describe("searchOrders", () => {
    it("authenticates then fetches orders", async () => {
      const orders = [{ orderId: "1", loadNo: "L1" }];
      const fetchSpy = mockAuthFetch({
        searchOrders: orders,
        searchCount: 1,
      });
      const client = new LogistiqClient(makeConfig());

      const result = await client.searchOrders(
        new Date("2026-01-01"),
        new Date("2026-01-31"),
      );

      // 2 auth calls + 1 search call
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(1);
      expect(result[0].orderId).toBe("1");
    });

    it("sends date range in search body", async () => {
      const fetchSpy = mockAuthFetch();
      const client = new LogistiqClient(makeConfig());

      await client.searchOrders(new Date("2026-03-01"), new Date("2026-03-15"));

      // The 3rd call is the search
      const searchInit = fetchSpy.mock.calls[2][1] as RequestInit;
      const body = JSON.parse(searchInit.body as string);
      expect(body.expectedPickupTimeStart).toContain("2026-03-01");
      expect(body.expectedPickupTimeEnd).toContain("2026-03-15");
      expect(body.page).toBe(1);
      expect(body.limit).toBe(100);
    });

    it("returns empty array when no orders found", async () => {
      mockAuthFetch({ searchOrders: [], searchCount: 0 });
      const client = new LogistiqClient(makeConfig());

      const result = await client.searchOrders(
        new Date("2026-01-01"),
        new Date("2026-01-31"),
      );

      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getCarrierExport
  // -----------------------------------------------------------------------

  describe("getCarrierExport", () => {
    it("throws when apiKey is not configured", async () => {
      const client = new LogistiqClient(makeConfig({ apiKey: undefined }));

      await expect(
        client.getCarrierExport(new Date("2026-01-01"), new Date("2026-01-31")),
      ).rejects.toThrow("apiKey is required for carrier export");
    });

    it("sends carrierId and date range in export request", async () => {
      const fetchSpy = mockAuthFetch({ s3Data: [] });
      const client = new LogistiqClient(makeConfig({ carrierId: 413 }));

      await client.getCarrierExport(
        new Date("2026-01-01"),
        new Date("2026-01-15"),
      );

      // Find the carrier-export call
      const exportCall = fetchSpy.mock.calls.find(([url]) =>
        (url as string).includes("carrier-export"),
      );
      expect(exportCall).toBeDefined();

      const body = JSON.parse(exportCall![1]!.body as string);
      expect(body.carrierId).toBe(413);
      expect(body.startDate).toBe("2026-01-01");
      expect(body.endDate).toBe("2026-01-15");
    });

    it("sends x-api-key header", async () => {
      const fetchSpy = mockAuthFetch({ s3Data: [] });
      const client = new LogistiqClient(
        makeConfig({ apiKey: "my-secret-key" }),
      );

      await client.getCarrierExport(
        new Date("2026-01-01"),
        new Date("2026-01-15"),
      );

      const exportCall = fetchSpy.mock.calls.find(([url]) =>
        (url as string).includes("carrier-export"),
      );
      const headers = exportCall![1]!.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("my-secret-key");
    });

    it("downloads JSON from S3 url", async () => {
      const s3Orders = [
        { orderId: "s3-1", loadNo: "L100" },
        { orderId: "s3-2", loadNo: "L101" },
      ];
      mockAuthFetch({ s3Data: s3Orders });
      const client = new LogistiqClient(makeConfig());

      const result = await client.getCarrierExport(
        new Date("2026-01-01"),
        new Date("2026-01-15"),
      );

      expect(result).toHaveLength(2);
      expect(result[0].orderId).toBe("s3-1");
    });

    it("chunks requests for ranges > 31 days", async () => {
      const fetchSpy = mockAuthFetch({ s3Data: [{ orderId: "chunk" }] });
      const client = new LogistiqClient(makeConfig());

      // 63 days — should need 3 chunks (31 + 31 + 1)
      await client.getCarrierExport(
        new Date("2026-01-01"),
        new Date("2026-03-05"),
      );

      // Count carrier-export calls
      const exportCalls = fetchSpy.mock.calls.filter(([url]) =>
        (url as string).includes("carrier-export"),
      );
      expect(exportCalls.length).toBeGreaterThan(1);
    });
  });

  // -----------------------------------------------------------------------
  // Diagnostics
  // -----------------------------------------------------------------------

  describe("diagnostics", () => {
    it("returns structured diagnostic object", () => {
      const client = new LogistiqClient(makeConfig());
      const diag = client.diagnostics();

      expect(diag.name).toBe("logistiq-client");
      expect(diag.status).toBe("healthy");
      expect(diag.stats).toHaveProperty("authCount", 0);
      expect(diag.stats).toHaveProperty("requestCount", 0);
      expect(diag.stats).toHaveProperty("carrierId", 413);
      expect(diag.checks).toBeInstanceOf(Array);
    });

    it("shows token not present before auth", () => {
      const client = new LogistiqClient(makeConfig());
      const diag = client.diagnostics();

      const tokenCheck = diag.checks.find((c) => c.name === "token");
      expect(tokenCheck?.ok).toBe(false);
      expect(tokenCheck?.detail).toBe("no token");
    });

    it("shows token valid after auth", async () => {
      mockAuthFetch();
      const client = new LogistiqClient(makeConfig());
      await client.authenticate();

      const diag = client.diagnostics();
      const tokenCheck = diag.checks.find((c) => c.name === "token");
      expect(tokenCheck?.ok).toBe(true);
      expect(tokenCheck?.detail).toContain("valid");
    });

    it("shows carrier-export check based on apiKey", () => {
      const withKey = new LogistiqClient(makeConfig({ apiKey: "key" }));
      const withoutKey = new LogistiqClient(makeConfig({ apiKey: undefined }));

      const diagWith = withKey.diagnostics();
      const diagWithout = withoutKey.diagnostics();

      const checkWith = diagWith.checks.find(
        (c) => c.name === "carrier-export",
      );
      const checkWithout = diagWithout.checks.find(
        (c) => c.name === "carrier-export",
      );

      expect(checkWith?.ok).toBe(true);
      expect(checkWithout?.ok).toBe(false);
    });

    it("tracks auth count", async () => {
      mockAuthFetch();
      const client = new LogistiqClient(makeConfig());

      expect(client.diagnostics().stats.authCount).toBe(0);
      await client.authenticate();
      expect(client.diagnostics().stats.authCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Type interface verification
  // -----------------------------------------------------------------------

  it("LogistiqOrder interface matches expected shape", () => {
    const order: LogistiqOrder = {
      orderId: "1",
      loadNo: "L1",
      orderNo: "O1",
      driverName: "John",
      carrierName: "ES Express",
      origin: "Terminal A",
      destination: "Well B",
      weight: 42000,
      status: "delivered",
      deliveredOn: "2026-01-15T00:00:00Z",
      customField: "allowed by index signature",
    };

    expect(order.orderId).toBe("1");
    expect(order.weight).toBe(42000);
    expect(order.customField).toBe("allowed by index signature");
  });
});
