import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildAddLoadRequest,
  restDiagnostics,
} from "../../src/plugins/pcs/services/pcs-rest.service.js";
import { buildDispatchPackage } from "../../src/plugins/pcs/lib/dispatch-package.js";

// ---------------------------------------------------------------------------
// buildAddLoadRequest — pure-function mapping
// ---------------------------------------------------------------------------

describe("PCS REST — buildAddLoadRequest", () => {
  beforeEach(() => {
    process.env.PCS_COMPANY_ID = "company-123";
    process.env.PCS_COMPANY_NAME = "ES Express";
    process.env.PCS_COMPANY_LTR = "E";
  });

  afterEach(() => {
    delete process.env.PCS_COMPANY_ID;
    delete process.env.PCS_COMPANY_NAME;
    delete process.env.PCS_COMPANY_LTR;
  });

  it("maps the DispatchPackage fields onto an AddLoadRequest shape", () => {
    const pkg = buildDispatchPackage(
      { id: 1, status: "pending" },
      {
        loadNo: "L-555",
        driverName: "John Doe",
        truckNo: "T-99",
        trailerNo: "TR-77",
        originName: "Sandplant A",
        destinationName: "ignored",
        productDescription: "Frac Sand",
        weightTons: "42.5",
      },
      { name: "Well-Alpha" },
    );

    const body = buildAddLoadRequest(pkg) as Record<string, unknown>;

    expect(body.billToId).toBe("company-123");
    expect(body.billToName).toBe("ES Express");
    expect(body.driverName).toBe("John Doe");
    expect(body.truckNumber).toBe("T-99");
    expect(body.trailerNumber).toBe("TR-77");
    expect(body.originName).toBe("Sandplant A");
    expect(body.destinationName).toBe("Well-Alpha");
    expect(body.commodity).toBe("Frac Sand");
    expect(body.weight).toBe(42.5);
    expect(body.customerLoadNumber).toBe("L-555");
    expect(body.loadClass).toBe("tl");
    expect(body.status).toBe("dispatched");
  });

  it("defaults weight to 0 when tonnage is unparseable", () => {
    const pkg = buildDispatchPackage(
      { id: 2, status: "pending" },
      {
        loadNo: "L-1",
        driverName: null,
        truckNo: null,
        trailerNo: null,
        originName: null,
        destinationName: null,
        productDescription: null,
        weightTons: "not-a-number",
      },
      { name: "Well" },
    );
    const body = buildAddLoadRequest(pkg) as Record<string, unknown>;
    expect(body.weight).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// restDiagnostics — exposed config surface
// ---------------------------------------------------------------------------

describe("PCS REST — restDiagnostics", () => {
  it("surfaces the Load endpoint URL derived from PCS_BASE_URL", () => {
    process.env.PCS_BASE_URL = "https://sandbox.pcssoft.com";
    const diag = restDiagnostics();
    expect(diag.loadEndpoint).toBe(
      "https://sandbox.pcssoft.com/dispatching/v1/load",
    );
    expect(diag.baseUrl).toBe("https://sandbox.pcssoft.com");
    delete process.env.PCS_BASE_URL;
  });

  it("carries the PCS_DISPATCH_ENABLED flag through", () => {
    // Flag is captured at module load (process.env.PCS_DISPATCH_ENABLED === "true").
    // We don't re-evaluate here — just assert the field is a boolean.
    const diag = restDiagnostics();
    expect(typeof diag.dispatchEnabled).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// dispatchLoad (disabled path) — verifies feature flag gating without DB
// ---------------------------------------------------------------------------
// dispatchLoad() when PCS_DISPATCH_ENABLED=false returns early before any
// DB or network call. Full happy-path tests need a Drizzle test fixture and
// a wired DB; those are out-of-scope for this unit file and covered at the
// route layer in pcs-routes.test.ts.

describe("PCS REST — dispatchLoad feature flag", () => {
  it("short-circuits with PCS_DISPATCH_DISABLED when flag is off", async () => {
    // Force a fresh import with the flag explicitly off
    const prevFlag = process.env.PCS_DISPATCH_ENABLED;
    process.env.PCS_DISPATCH_ENABLED = "false";

    // Module cache holds the captured flag. Use a dynamic import with a
    // cache-buster so the module re-reads the env var.
    vi.resetModules();
    const mod = await import(
      "../../src/plugins/pcs/services/pcs-rest.service.js?t=" + Date.now()
    ).catch(async () => {
      // fall back if the query-string trick doesn't work for the bundler
      return await import("../../src/plugins/pcs/services/pcs-rest.service.js");
    });

    const result = await mod.dispatchLoad(undefined as never, 1);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PCS_DISPATCH_DISABLED");
    expect(result.error?.retryable).toBe(false);
    expect(result.latencyMs).toBe(0);

    if (prevFlag === undefined) delete process.env.PCS_DISPATCH_ENABLED;
    else process.env.PCS_DISPATCH_ENABLED = prevFlag;
  });
});
