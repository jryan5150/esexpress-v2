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
// Route registration
// ---------------------------------------------------------------------------

describe("Logistiq Routes — route registration", () => {
  const routes = [
    { method: "POST" as const, url: "/api/v1/ingestion/sync/logistiq" },
    { method: "POST" as const, url: "/api/v1/ingestion/logistiq/upload" },
    { method: "POST" as const, url: "/api/v1/ingestion/logistiq/commit" },
    { method: "GET" as const, url: "/api/v1/ingestion/logistiq/conflicts" },
    {
      method: "PUT" as const,
      url: "/api/v1/ingestion/logistiq/conflicts/1/resolve",
    },
    { method: "GET" as const, url: "/api/v1/ingestion/logistiq/stats" },
  ];

  for (const route of routes) {
    it(`${route.method} ${route.url} is registered (not 404)`, async () => {
      const response = await app.inject({
        method: route.method,
        url: route.url,
      });
      // Should not be 404 — route exists, but will be 401 (no auth)
      expect(response.statusCode).not.toBe(404);
    });
  }
});

// ---------------------------------------------------------------------------
// Auth enforcement
// ---------------------------------------------------------------------------

describe("Logistiq Routes — auth enforcement", () => {
  it("rejects unauthenticated request to sync endpoint", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/sync/logistiq",
      payload: { from: "2026-01-01", to: "2026-01-31" },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects unauthenticated request to upload endpoint", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/logistiq/upload",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated request to commit endpoint", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/logistiq/commit",
      payload: { rows: [{ loadNo: "123" }] },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated request to conflicts endpoint", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/ingestion/logistiq/conflicts",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated request to resolve endpoint", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/ingestion/logistiq/conflicts/1/resolve",
      payload: { resolution: "resolved_propx" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated request to stats endpoint", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/ingestion/logistiq/stats",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects viewer role from sync endpoint (admin/dispatcher required)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/sync/logistiq",
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { from: "2026-01-01", to: "2026-01-31" },
    });
    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("rejects viewer role from upload endpoint", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/logistiq/upload",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer role from commit endpoint", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/logistiq/commit",
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { rows: [{ loadNo: "123" }] },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer role from resolve endpoint", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/ingestion/logistiq/conflicts/1/resolve",
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { resolution: "resolved_propx" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("allows viewer to access conflicts list (read-only)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/ingestion/logistiq/conflicts",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    // Viewer is authenticated — should not be 401 or 403
    // Will likely fail with 503 (no DB), but the auth check passes
    expect(response.statusCode).not.toBe(401);
    expect(response.statusCode).not.toBe(403);
  });

  it("allows viewer to access stats (read-only)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/ingestion/logistiq/stats",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).not.toBe(401);
    expect(response.statusCode).not.toBe(403);
  });

  it("allows dispatcher role to access sync endpoint", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/sync/logistiq",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { from: "2026-01-01", to: "2026-01-31" },
    });
    // Dispatcher should pass auth — will fail at service level, not auth
    expect(response.statusCode).not.toBe(401);
    expect(response.statusCode).not.toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Sync endpoint validation
// ---------------------------------------------------------------------------

describe("Logistiq Routes — sync validation", () => {
  it("requires from and to body params", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/sync/logistiq",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires both from and to (missing to)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/sync/logistiq",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { from: "2026-01-01" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("requires both from and to (missing from)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/sync/logistiq",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { to: "2026-01-31" },
    });
    expect(response.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Commit endpoint validation
// ---------------------------------------------------------------------------

describe("Logistiq Routes — commit validation", () => {
  it("requires rows in body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/logistiq/commit",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects empty rows array", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/logistiq/commit",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { rows: [] },
    });
    expect(response.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Resolve endpoint validation
// ---------------------------------------------------------------------------

describe("Logistiq Routes — resolve conflict validation", () => {
  it("requires resolution in body", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/ingestion/logistiq/conflicts/1/resolve",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid resolution value", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/ingestion/logistiq/conflicts/1/resolve",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { resolution: "invalid_value" },
    });
    expect(response.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Upload endpoint validation
// ---------------------------------------------------------------------------

describe("Logistiq Routes — upload validation", () => {
  it("rejects request without multipart content-type", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/logistiq/upload",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    // @fastify/multipart returns 406 when content-type is not multipart
    expect(response.statusCode).toBe(406);
  });

  it("rejects multipart request with no file field", async () => {
    const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="notafile"',
      "",
      "some text value",
      `--${boundary}--`,
    ].join("\r\n");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/logistiq/upload",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    // No file part means request.file() returns undefined -> 400
    expect(response.statusCode).toBe(400);
    const result = response.json();
    expect(result.success).toBe(false);
    expect(result.error.message).toContain("No file");
  });

  it("accepts a valid CSV file upload", async () => {
    const csvContent = [
      "Load #,Driver Name,Destination,Weight (lbs),Status",
      "1001,John Doe,Well Site A,42000,Delivered",
      "1002,Jane Smith,Well Site B,38000,Active",
    ].join("\n");

    const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="logistiq-loads.csv"',
      "Content-Type: text/csv",
      "",
      csvContent,
      `--${boundary}--`,
    ].join("\r\n");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/logistiq/upload",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    const result = response.json();
    expect(result.success).toBe(true);
    expect(result.data.totalRows).toBe(2);
    expect(result.data.parsedRows).toBe(2);
    expect(result.data.filename).toBe("logistiq-loads.csv");
    expect(result.data.columnHeaders).toEqual(
      expect.arrayContaining(["Load #", "Driver Name"]),
    );
    expect(result.data.preview).toHaveLength(2);
    expect(result.data.matchRate).toBeGreaterThanOrEqual(0);
  });

  it("rejects non-CSV file upload", async () => {
    const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="data.xlsx"',
      "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "",
      "binary content here",
      `--${boundary}--`,
    ].join("\r\n");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/logistiq/upload",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
    const result = response.json();
    expect(result.success).toBe(false);
    expect(result.error.message).toContain("CSV");
  });

  it("rejects empty CSV file", async () => {
    const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="empty.csv"',
      "Content-Type: text/csv",
      "",
      "Load #,Driver Name",
      `--${boundary}--`,
    ].join("\r\n");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/logistiq/upload",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
    const result = response.json();
    expect(result.success).toBe(false);
    expect(result.error.message).toContain("empty");
  });

  it("correctly normalizes CSV rows with alias headers", async () => {
    const csvContent = [
      "Load No,Driver,Dest,Weight (lbs),Ticket #",
      "5001,Mike Driver,Sand Well 7,44000,TK-9001",
    ].join("\n");

    const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="test.csv"',
      "Content-Type: text/csv",
      "",
      csvContent,
      `--${boundary}--`,
    ].join("\r\n");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/logistiq/upload",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    const result = response.json();
    const preview = result.data.preview[0];

    // Verify normalizer resolved aliases
    expect(preview.loadNo).toBe("5001");
    expect(preview.driverName).toBe("Mike Driver");
    expect(preview.destinationName).toBe("Sand Well 7");
    expect(preview.ticketNo).toBe("TK-9001");
    expect(preview.source).toBe("logistiq");
    // Weight: 44000 lbs / 2000 = 22.0000 tons
    expect(preview.weightTons).toBe("22.0000");
  });
});

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

describe("Logistiq Routes — response envelope", () => {
  it("returns standard error envelope on auth failure", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/ingestion/logistiq/stats",
    });
    const body = response.json();
    expect(body).toHaveProperty("success");
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
  });

  it("returns standard error envelope on validation failure", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/sync/logistiq",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
  });
});

// ---------------------------------------------------------------------------
// Conflicts list — pagination schema
// ---------------------------------------------------------------------------

describe("Logistiq Routes — conflicts pagination", () => {
  it("accepts page and limit query params without validation error", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/ingestion/logistiq/conflicts?page=1&limit=10",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    // Should not be 400 (validation passes) or 404 (route exists)
    // Likely 503 (no DB), but auth + validation passed
    expect(response.statusCode).not.toBe(400);
    expect(response.statusCode).not.toBe(404);
  });
});
