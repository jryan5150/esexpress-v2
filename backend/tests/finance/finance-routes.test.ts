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
// Route Registration (18 endpoints)
// ---------------------------------------------------------------------------

describe("Finance Plugin — route registration", () => {
  const routes = [
    {
      method: "GET" as const,
      url: "/api/v1/finance/batches",
    },
    {
      method: "POST" as const,
      url: "/api/v1/finance/batches",
      body: {
        driverId: "D-001",
        driverName: "Test Driver",
        weekStart: "2026-01-01",
        weekEnd: "2026-01-07",
      },
    },
    {
      method: "POST" as const,
      url: "/api/v1/finance/batches/create-all",
      body: { weekStart: "2026-01-01", weekEnd: "2026-01-07" },
    },
    {
      method: "GET" as const,
      url: "/api/v1/finance/batches/1",
    },
    {
      method: "PUT" as const,
      url: "/api/v1/finance/batches/1",
      body: { ratePerTon: 5.5 },
    },
    {
      method: "POST" as const,
      url: "/api/v1/finance/batches/1/deductions",
      body: { type: "fuel", amount: 50, description: "Fuel advance" },
    },
    {
      method: "DELETE" as const,
      url: "/api/v1/finance/batches/1/deductions/0",
    },
    {
      method: "POST" as const,
      url: "/api/v1/finance/batches/1/submit",
    },
    {
      method: "POST" as const,
      url: "/api/v1/finance/batches/1/approve",
    },
    {
      method: "POST" as const,
      url: "/api/v1/finance/batches/1/reject",
      body: {},
    },
    {
      method: "POST" as const,
      url: "/api/v1/finance/batches/1/paid",
    },
    {
      method: "POST" as const,
      url: "/api/v1/finance/batches/1/export",
    },
    {
      method: "POST" as const,
      url: "/api/v1/finance/batches/1/notify",
    },
    {
      method: "GET" as const,
      url: "/api/v1/finance/summary",
    },
    {
      method: "GET" as const,
      url: "/api/v1/finance/drivers/D-001/history",
    },
    {
      method: "GET" as const,
      url: "/api/v1/finance/pending-review",
    },
    {
      method: "GET" as const,
      url: "/api/v1/finance/status-summary",
    },
    {
      method: "GET" as const,
      url: "/api/v1/finance/drivers",
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
// Auth Enforcement
// ---------------------------------------------------------------------------

describe("Finance Plugin — auth enforcement", () => {
  it("rejects unauthenticated requests to GET /batches", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/finance/batches",
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects unauthenticated requests to POST /batches", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches",
      payload: {
        driverId: "D-001",
        driverName: "Test",
        weekStart: "2026-01-01",
        weekEnd: "2026-01-07",
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to POST /batches/create-all", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/create-all",
      payload: { weekStart: "2026-01-01", weekEnd: "2026-01-07" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to GET /batches/:id", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/finance/batches/1",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to PUT /batches/:id", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/finance/batches/1",
      payload: { ratePerTon: 5.5 },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to POST /batches/:id/deductions", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/deductions",
      payload: { type: "fuel", amount: 50, description: "Fuel" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to DELETE /batches/:id/deductions/:idx", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/finance/batches/1/deductions/0",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to POST /batches/:id/submit", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/submit",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to POST /batches/:id/approve", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/approve",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to POST /batches/:id/reject", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/reject",
      payload: {},
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to POST /batches/:id/paid", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/paid",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to POST /batches/:id/export", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/export",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to POST /batches/:id/notify", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/notify",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to GET /summary", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/finance/summary",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to GET /driver/:id/history", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/finance/drivers/D-001/history",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to GET /pending-review", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/finance/pending-review",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to GET /status-summary", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/finance/status-summary",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to GET /drivers", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/finance/drivers",
    });
    expect(response.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Role-Based Access — admin-only routes
// ---------------------------------------------------------------------------

describe("Finance Plugin — admin-only endpoints", () => {
  it("approve rejects dispatcher role (admin only)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/approve",
      headers: { authorization: `Bearer ${dispatcherToken}` },
    });
    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("approve rejects viewer role (admin only)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/approve",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("paid rejects dispatcher role (admin only)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/paid",
      headers: { authorization: `Bearer ${dispatcherToken}` },
    });
    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("paid rejects viewer role (admin only)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/paid",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Role-Based Access — viewer restrictions
// ---------------------------------------------------------------------------

describe("Finance Plugin — viewer restrictions on write endpoints", () => {
  it("rejects viewer from POST /batches (create)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches",
      payload: {
        driverId: "D-001",
        driverName: "Test",
        weekStart: "2026-01-01",
        weekEnd: "2026-01-07",
      },
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer from POST /batches/create-all", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/create-all",
      payload: { weekStart: "2026-01-01", weekEnd: "2026-01-07" },
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer from PUT /batches/:id (update)", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/finance/batches/1",
      payload: { ratePerTon: 5.5 },
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer from POST /batches/:id/deductions", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/deductions",
      payload: { type: "fuel", amount: 50, description: "Fuel" },
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer from DELETE /batches/:id/deductions/:idx", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/finance/batches/1/deductions/0",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer from POST /batches/:id/submit", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/submit",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer from POST /batches/:id/reject", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/reject",
      payload: {},
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer from POST /batches/:id/export", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/export",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer from POST /batches/:id/notify", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/notify",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Role-Based Access — dispatcher allowed
// ---------------------------------------------------------------------------

describe("Finance Plugin — dispatcher allowed on non-admin routes", () => {
  it("allows dispatcher on POST /batches (not 403)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches",
      payload: {
        driverId: "D-001",
        driverName: "Test",
        weekStart: "2026-01-01",
        weekEnd: "2026-01-07",
      },
      headers: { authorization: `Bearer ${dispatcherToken}` },
    });
    // Should not be 403 — role is accepted; may fail at DB level
    expect(response.json().error?.code).not.toBe("FORBIDDEN");
  });

  it("allows dispatcher on POST /batches/create-all (not 403)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/create-all",
      payload: { weekStart: "2026-01-01", weekEnd: "2026-01-07" },
      headers: { authorization: `Bearer ${dispatcherToken}` },
    });
    expect(response.json().error?.code).not.toBe("FORBIDDEN");
  });

  it("allows dispatcher on POST /batches/:id/submit (not 403)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/submit",
      headers: { authorization: `Bearer ${dispatcherToken}` },
    });
    expect(response.json().error?.code).not.toBe("FORBIDDEN");
  });

  it("allows dispatcher on POST /batches/:id/reject (not 403)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/reject",
      payload: {},
      headers: { authorization: `Bearer ${dispatcherToken}` },
    });
    expect(response.json().error?.code).not.toBe("FORBIDDEN");
  });

  it("allows dispatcher on POST /batches/:id/export (not 403)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/export",
      headers: { authorization: `Bearer ${dispatcherToken}` },
    });
    expect(response.json().error?.code).not.toBe("FORBIDDEN");
  });

  it("allows dispatcher on POST /batches/:id/notify (not 403)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/notify",
      headers: { authorization: `Bearer ${dispatcherToken}` },
    });
    expect(response.json().error?.code).not.toBe("FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------
// Stub Endpoints
// ---------------------------------------------------------------------------

describe("Finance Plugin — stub endpoints", () => {
  it("POST /batches/:id/export returns stub response", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/export",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("stub");
    expect(body.data).toHaveProperty("batchId");
    expect(body.data).toHaveProperty("message");
    expect(body.data).toHaveProperty("requestedAt");
  });

  it("POST /batches/:id/notify returns stub response", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/notify",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("stub");
    expect(body.data).toHaveProperty("batchId");
    expect(body.data).toHaveProperty("message");
    expect(body.data).toHaveProperty("requestedAt");
  });
});

// ---------------------------------------------------------------------------
// Health / Diagnostics Endpoint
// ---------------------------------------------------------------------------

describe("Finance Plugin — health endpoint", () => {
  it("GET /health responds without authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/finance/health",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("name");
    expect(body.data.name).toBe("payment");
    expect(body.data).toHaveProperty("status");
    expect(body.data).toHaveProperty("stats");
    expect(body.data).toHaveProperty("checks");
    expect(body.data).toHaveProperty("checkedAt");
  });

  it("health includes supported status machine info", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/finance/health",
    });
    const body = response.json();
    expect(body.data.stats).toHaveProperty("supportedStatuses");
    expect(Array.isArray(body.data.stats.supportedStatuses)).toBe(true);
    expect(body.data.stats.supportedStatuses.length).toBe(7);
  });

  it("health includes rate type info", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/finance/health",
    });
    const body = response.json();
    expect(body.data.stats).toHaveProperty("rateTypes");
    expect(body.data.stats.rateTypes).toEqual(["per_ton", "per_mile"]);
  });
});

// ---------------------------------------------------------------------------
// Request Validation
// ---------------------------------------------------------------------------

describe("Finance Plugin — request validation", () => {
  it("POST /batches requires driverId, driverName, weekStart, weekEnd", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches",
      payload: { driverId: "D-001" },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /batches rejects empty driverId", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches",
      payload: {
        driverId: "",
        driverName: "Test",
        weekStart: "2026-01-01",
        weekEnd: "2026-01-07",
      },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it("POST /batches/create-all requires weekStart and weekEnd", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/create-all",
      payload: { weekStart: "2026-01-01" },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it("POST /batches/:id/deductions requires type, amount, description", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/deductions",
      payload: { type: "fuel" },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it("POST /batches/:id/deductions rejects negative amount", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/deductions",
      payload: { type: "fuel", amount: -50, description: "Fuel" },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Response Envelope
// ---------------------------------------------------------------------------

describe("Finance Plugin — response envelope", () => {
  it("returns standard error envelope on auth failure", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches",
      payload: {
        driverId: "D-001",
        driverName: "Test",
        weekStart: "2026-01-01",
        weekEnd: "2026-01-07",
      },
    });
    const body = response.json();
    expect(body).toHaveProperty("success");
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
  });

  it("returns standard success envelope on health endpoint", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/finance/health",
    });
    const body = response.json();
    expect(body).toHaveProperty("success");
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("data");
  });

  it("returns standard success envelope on stub endpoints", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/export",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = response.json();
    expect(body).toHaveProperty("success");
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("data");
  });

  it("returns standard error envelope on role rejection", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/finance/batches/1/approve",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code");
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error).toHaveProperty("message");
  });
});
