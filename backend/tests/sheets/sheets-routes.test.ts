import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let adminToken: string;
let dispatcherToken: string;
let viewerToken: string;

beforeAll(async () => {
  app = buildApp({ logger: false });
  await app.ready();
  adminToken = app.jwt.sign({
    id: 1,
    email: "admin@test.com",
    name: "Admin",
    role: "admin",
  });
  dispatcherToken = app.jwt.sign({
    id: 2,
    email: "dispatcher@test.com",
    name: "Dispatcher",
    role: "dispatcher",
  });
  viewerToken = app.jwt.sign({
    id: 3,
    email: "viewer@test.com",
    name: "Viewer",
    role: "viewer",
  });
});

afterAll(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// Route Registration
// ---------------------------------------------------------------------------

describe("Sheets Plugin — route registration", () => {
  const routes = [
    {
      method: "POST" as const,
      url: "/api/v1/sheets/export/assignments",
      body: {},
    },
    {
      method: "POST" as const,
      url: "/api/v1/sheets/export/wells",
      body: {},
    },
    {
      method: "GET" as const,
      url: "/api/v1/sheets/export/columns",
    },
    {
      method: "POST" as const,
      url: "/api/v1/sheets/import/preview",
      body: {
        spreadsheetId: "test-id",
        sheetName: "Sheet1",
        columnMap: { A: "load_no" },
      },
    },
    {
      method: "POST" as const,
      url: "/api/v1/sheets/import/execute",
      body: { previewData: {} },
    },
    {
      method: "POST" as const,
      url: "/api/v1/sheets/sync/trigger",
    },
    {
      method: "GET" as const,
      url: "/api/v1/sheets/sync/config",
    },
    {
      method: "PUT" as const,
      url: "/api/v1/sheets/sync/config",
      body: { enabled: true },
    },
    {
      method: "GET" as const,
      url: "/api/v1/sheets/drive/list",
    },
    {
      method: "GET" as const,
      url: "/api/v1/sheets/reconciliation",
    },
    {
      method: "GET" as const,
      url: "/api/v1/sheets/health",
    },
  ];

  for (const route of routes) {
    it(`${route.method} ${route.url} is registered (not 404)`, async () => {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        payload: route.body,
      });
      // Route exists — should not be 404
      expect(response.statusCode).not.toBe(404);
    });
  }
});

// ---------------------------------------------------------------------------
// Column Config Endpoint (no auth required)
// ---------------------------------------------------------------------------

describe("Sheets Plugin — column config endpoint", () => {
  it("GET /export/columns responds without authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sheets/export/columns",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("assignment");
    expect(body.data).toHaveProperty("well");
    expect(body.data).toHaveProperty("maxExportRows");
  });

  it("returns assignment columns with correct count", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sheets/export/columns",
    });
    const body = response.json();
    expect(body.data.assignment.total).toBe(19);
    expect(body.data.assignment.columns).toHaveLength(19);
  });

  it("returns well columns with correct count", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sheets/export/columns",
    });
    const body = response.json();
    expect(body.data.well.total).toBe(15);
    expect(body.data.well.columns).toHaveLength(15);
  });

  it("returns maxExportRows as 10000", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sheets/export/columns",
    });
    const body = response.json();
    expect(body.data.maxExportRows).toBe(10_000);
  });

  it("each column has key and header fields", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sheets/export/columns",
    });
    const body = response.json();
    for (const col of body.data.assignment.columns) {
      expect(typeof col.key).toBe("string");
      expect(typeof col.header).toBe("string");
    }
    for (const col of body.data.well.columns) {
      expect(typeof col.key).toBe("string");
      expect(typeof col.header).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// Auth Enforcement
// ---------------------------------------------------------------------------

describe("Sheets Plugin — auth enforcement", () => {
  it("rejects unauthenticated requests to export/assignments", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/export/assignments",
      payload: {},
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects unauthenticated requests to export/wells", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/export/wells",
      payload: {},
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to import/preview", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/import/preview",
      payload: {
        spreadsheetId: "test",
        sheetName: "Sheet1",
        columnMap: {},
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to import/execute", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/import/execute",
      payload: { previewData: {} },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to sync/trigger", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/sync/trigger",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to sync/config GET", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sheets/sync/config",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to sync/config PUT", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/sheets/sync/config",
      payload: { enabled: true },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to drive/list", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sheets/drive/list",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to reconciliation", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sheets/reconciliation",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects viewer role from export/assignments", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/export/assignments",
      payload: {},
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("rejects viewer role from export/wells", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/export/wells",
      payload: {},
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer role from import/preview", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/import/preview",
      payload: {
        spreadsheetId: "test",
        sheetName: "Sheet1",
        columnMap: {},
      },
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer role from import/execute", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/import/execute",
      payload: { previewData: {} },
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer role from sync/trigger", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/sync/trigger",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer role from reconciliation", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sheets/reconciliation",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer and dispatcher from sync/config PUT (admin only)", async () => {
    const viewerResponse = await app.inject({
      method: "PUT",
      url: "/api/v1/sheets/sync/config",
      payload: { enabled: true },
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(viewerResponse.statusCode).toBe(403);

    const dispatcherResponse = await app.inject({
      method: "PUT",
      url: "/api/v1/sheets/sync/config",
      payload: { enabled: true },
      headers: { authorization: `Bearer ${dispatcherToken}` },
    });
    expect(dispatcherResponse.statusCode).toBe(403);
  });

  it("allows dispatcher role on export/assignments (not 403)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/export/assignments",
      payload: {},
      headers: { authorization: `Bearer ${dispatcherToken}` },
    });
    // Should not be 403 (role accepted) — will fail at Google auth level
    expect(response.json().error?.code).not.toBe("FORBIDDEN");
  });

  it("allows dispatcher role on sync/trigger (not 403)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/sync/trigger",
      headers: { authorization: `Bearer ${dispatcherToken}` },
    });
    // Sync trigger is a stub — should succeed
    expect(response.json().error?.code).not.toBe("FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------
// Health Endpoint (no auth required)
// ---------------------------------------------------------------------------

describe("Sheets Plugin — health endpoint", () => {
  it("GET /health responds without authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sheets/health",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("authConfigured");
    expect(body.data).toHaveProperty("googleReachable");
    expect(body.data).toHaveProperty("diagnostics");
    expect(body.data).toHaveProperty("checkedAt");
  });

  it("health reports auth not configured in test environment", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sheets/health",
    });
    const body = response.json();
    // No GOOGLE_* env vars in test
    expect(body.data.authConfigured).toBe(false);
    expect(body.data.googleReachable).toBe(false);
  });

  it("health includes export/import stats", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sheets/health",
    });
    const body = response.json();
    expect(body.data.stats).toHaveProperty("totalExports");
    expect(body.data.stats).toHaveProperty("totalImports");
    expect(typeof body.data.stats.totalExports).toBe("number");
    expect(typeof body.data.stats.totalImports).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Sync Config Endpoint
// ---------------------------------------------------------------------------

describe("Sheets Plugin — sync config", () => {
  it("GET /sync/config returns config for authenticated user", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sheets/sync/config",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("enabled");
    expect(body.data).toHaveProperty("intervalMinutes");
    expect(typeof body.data.enabled).toBe("boolean");
    expect(typeof body.data.intervalMinutes).toBe("number");
  });

  it("PUT /sync/config returns stub response for admin", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/sheets/sync/config",
      payload: { enabled: true, intervalMinutes: 30 },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("message");
    expect(body.data).toHaveProperty("updatedAt");
  });
});

// ---------------------------------------------------------------------------
// Sync Trigger Endpoint
// ---------------------------------------------------------------------------

describe("Sheets Plugin — sync trigger", () => {
  it("POST /sync/trigger returns stub response for admin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/sync/trigger",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("message");
    expect(body.data).toHaveProperty("triggeredAt");
  });
});

// ---------------------------------------------------------------------------
// Reconciliation Endpoint
// ---------------------------------------------------------------------------

describe("Sheets Plugin — reconciliation", () => {
  it("GET /reconciliation returns stub response for admin", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sheets/reconciliation",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("stub");
    expect(body.data).toHaveProperty("comparison");
    expect(Array.isArray(body.data.comparison)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("Sheets Plugin — request validation", () => {
  it("import/preview requires spreadsheetId, sheetName, and columnMap", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/import/preview",
      payload: { spreadsheetId: "test" },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("import/preview rejects empty spreadsheetId", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/import/preview",
      payload: {
        spreadsheetId: "",
        sheetName: "Sheet1",
        columnMap: {},
      },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it("import/execute requires previewData", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/import/execute",
      payload: {},
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Response Envelope
// ---------------------------------------------------------------------------

describe("Sheets Plugin — response envelope", () => {
  it("returns standard error envelope on auth failure", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sheets/export/assignments",
      payload: {},
    });
    const body = response.json();
    expect(body).toHaveProperty("success");
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
  });

  it("returns standard success envelope on columns endpoint", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sheets/export/columns",
    });
    const body = response.json();
    expect(body).toHaveProperty("success");
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("data");
  });

  it("returns standard success envelope on health endpoint", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/sheets/health",
    });
    const body = response.json();
    expect(body).toHaveProperty("success");
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("data");
  });
});
