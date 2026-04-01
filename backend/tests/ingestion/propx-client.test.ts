import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PropxClient,
  PROPX_CACHE_TTLS,
  type PropxCarrier,
  type PropxDriver,
  type PropxTerminal,
  type PropxDestination,
  type PropxProduct,
  type PropxJob,
  type PropxLoad,
  type CacheCategory,
} from "../../src/plugins/ingestion/services/propx.service.js";

describe("PropX Service", () => {
  // -----------------------------------------------------------------------
  // Exports
  // -----------------------------------------------------------------------

  it("exports PropxClient class", () => {
    expect(PropxClient).toBeDefined();
    expect(typeof PropxClient).toBe("function");
  });

  it("exports PROPX_CACHE_TTLS constant", () => {
    expect(PROPX_CACHE_TTLS).toBeDefined();
    expect(PROPX_CACHE_TTLS.carriers).toBe(3_600_000);
    expect(PROPX_CACHE_TTLS.drivers).toBe(1_800_000);
    expect(PROPX_CACHE_TTLS.terminals).toBe(7_200_000);
    expect(PROPX_CACHE_TTLS.destinations).toBe(7_200_000);
    expect(PROPX_CACHE_TTLS.products).toBe(3_600_000);
    expect(PROPX_CACHE_TTLS.stages).toBe(86_400_000);
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  it("PropxClient constructor requires apiKey", () => {
    expect(() => new PropxClient({ apiKey: "" })).toThrow(
      "PropxClient requires an apiKey",
    );
    expect(
      () => new PropxClient({ apiKey: null as unknown as string }),
    ).toThrow("PropxClient requires an apiKey");
  });

  it("PropxClient constructor accepts valid apiKey", () => {
    const client = new PropxClient({ apiKey: "test-key-123" });
    expect(client).toBeInstanceOf(PropxClient);
  });

  it("PropxClient constructor uses default baseUrl", () => {
    const client = new PropxClient({ apiKey: "test-key-123" });
    // Verify the instance was created successfully — baseUrl is private,
    // but we can verify it doesn't throw with no explicit baseUrl
    expect(client).toBeDefined();
  });

  it("PropxClient constructor accepts custom baseUrl", () => {
    const client = new PropxClient({
      apiKey: "test-key-123",
      baseUrl: "https://custom.propx.com/api/v2",
    });
    expect(client).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Cache behavior (using mock fetch)
  // -----------------------------------------------------------------------

  let client: PropxClient;

  beforeEach(() => {
    client = new PropxClient({ apiKey: "test-api-key" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetchResponse<T>(data: T[], total?: number) {
    const responseData = {
      data,
      pagination: {
        total: total ?? data.length,
        per_page: 200,
        page_no: 1,
      },
    };
    const body = JSON.stringify(responseData);
    // Return a fresh Response for each call (Response body is single-use)
    return vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
  }

  it("cache returns stale data within TTL", async () => {
    const carriers: PropxCarrier[] = [
      { id: "1", name: "Carrier A", status: "active" },
    ];
    const fetchSpy = mockFetchResponse(carriers);

    // First call — should hit the network
    const result1 = await client.getCarriers();
    expect(result1).toEqual(carriers);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call — should come from cache, no additional fetch
    const result2 = await client.getCarriers();
    expect(result2).toEqual(carriers);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("cache clears on forceRefresh", async () => {
    const carriers: PropxCarrier[] = [
      { id: "1", name: "Carrier A", status: "active" },
    ];
    const fetchSpy = mockFetchResponse(carriers);

    // First call
    await client.getCarriers();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Force refresh — should fetch again
    await client.getCarriers(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("cache expires after TTL", async () => {
    const carriers: PropxCarrier[] = [
      { id: "1", name: "Carrier A", status: "active" },
    ];
    const fetchSpy = mockFetchResponse(carriers);

    // First call
    await client.getCarriers();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Advance time past the carriers TTL (1 hour)
    vi.spyOn(Date, "now").mockReturnValueOnce(
      Date.now() + PROPX_CACHE_TTLS.carriers + 1,
    );

    // Should fetch again because cache expired
    await client.getCarriers();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("sends raw API key as authorization header (no Bearer prefix)", async () => {
    const fetchSpy = mockFetchResponse<PropxCarrier>([]);

    await client.getCarriers();

    const [url, init] = fetchSpy.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("test-api-key");
    // Verify there's no "Bearer" prefix
    expect(headers.authorization).not.toMatch(/^Bearer /);
  });

  it("passes query params correctly", async () => {
    const fetchSpy = mockFetchResponse<PropxLoad>([]);

    await client.getCompanyLoadsByDates(
      new Date("2026-01-01"),
      new Date("2026-01-31"),
    );

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("from_date=2026-01-01");
    expect(calledUrl).toContain("to_date=2026-01-31");
  });

  it("throws HttpError on non-200 response", async () => {
    // Use 500 (not 429) — 429 triggers circuit breaker retries with backoff
    // which makes the test slow. 500 is not retried, so it fails immediately.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("Internal Server Error", { status: 500 }),
    );

    await expect(client.getCarriers()).rejects.toThrow("HTTP 500");
  });

  it("getLoadTicketImage returns null on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("Not found", { status: 404 }),
    );

    const result = await client.getLoadTicketImage("load-123");
    expect(result).toBeNull();
  });

  it("diagnostics returns structured status", () => {
    const diag = client.diagnostics();
    expect(diag.name).toBe("propx-client");
    expect(diag.status).toBe("healthy");
    expect(diag.stats).toHaveProperty("cacheEntries");
    expect(diag.stats).toHaveProperty("queueSize");
    expect(diag.stats).toHaveProperty("queuePending");
    expect(diag.checks).toBeInstanceOf(Array);
    expect(diag.checks[0]).toHaveProperty("name", "rate-limiter");
    expect(diag.checks[0]).toHaveProperty("ok", true);
  });

  it("diagnostics reflects cached entries", async () => {
    const fetchSpy = mockFetchResponse<PropxCarrier>([
      { id: "1", name: "Carrier A", status: "active" },
    ]);

    // Before caching
    expect(client.diagnostics().stats.cacheEntries).toBe(0);

    // After caching carriers
    await client.getCarriers();
    const diag = client.diagnostics();
    expect(diag.stats.cacheEntries).toBe(1);
    expect(diag.cache).toHaveProperty("carriers");
    expect(diag.cache.carriers.cached).toBe(true);
    expect(typeof diag.cache.carriers.expiresIn).toBe("number");
  });

  // -----------------------------------------------------------------------
  // Type exports (compile-time verification — these just need to not error)
  // -----------------------------------------------------------------------

  it("exports all PropX type interfaces", () => {
    // These are type-only checks; if they compile, the interfaces exist.
    // We verify by using them in a runtime-observable way.
    const carrier: PropxCarrier = { id: "1", name: "C", status: "active" };
    const driver: PropxDriver = {
      id: "1",
      name: "D",
      carrier_id: "c1",
      carrier_name: "C",
      truck_no: "T1",
      trailer_no: "TR1",
      status: "active",
    };
    const terminal: PropxTerminal = { id: "1", name: "T", address: "123 St" };
    const dest: PropxDestination = { id: "1", name: "D", address: "456 Ave" };
    const product: PropxProduct = {
      id: "1",
      name: "Sand",
      description: "Frac sand",
    };
    const job: PropxJob = {
      id: "1",
      job_name: "J1",
      customer_id: "c1",
      customer_name: "Cust",
      status: "active",
    };
    const load: PropxLoad = {
      propx_load_id: "1",
      job_id: "j1",
      load_no: "L1",
      driver_name: "Driver",
      carrier_name: "Carrier",
      weight: 42000,
    };
    const cat: CacheCategory = "carriers";

    expect(carrier.id).toBeDefined();
    expect(driver.carrier_id).toBeDefined();
    expect(terminal.address).toBeDefined();
    expect(dest.address).toBeDefined();
    expect(product.description).toBeDefined();
    expect(job.job_name).toBeDefined();
    expect(load.propx_load_id).toBeDefined();
    expect(cat).toBe("carriers");
  });

  // -----------------------------------------------------------------------
  // Pagination
  // -----------------------------------------------------------------------

  it("fetches all pages when result spans multiple pages", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      callCount++;
      const url = typeof input === "string" ? input : (input as Request).url;
      const pageNo = new URL(url).searchParams.get("page_no") ?? "1";

      if (pageNo === "1") {
        return new Response(
          JSON.stringify({
            data: [{ id: "1", name: "A", status: "active" }],
            pagination: { total: 3, per_page: 1, page_no: 1 },
          }),
          { status: 200 },
        );
      } else if (pageNo === "2") {
        return new Response(
          JSON.stringify({
            data: [{ id: "2", name: "B", status: "active" }],
            pagination: { total: 3, per_page: 1, page_no: 2 },
          }),
          { status: 200 },
        );
      } else {
        return new Response(
          JSON.stringify({
            data: [{ id: "3", name: "C", status: "active" }],
            pagination: { total: 3, per_page: 1, page_no: 3 },
          }),
          { status: 200 },
        );
      }
    });

    const result = await client.getCarriers();
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.id)).toEqual(["1", "2", "3"]);
    expect(callCount).toBe(3);
  });
});
