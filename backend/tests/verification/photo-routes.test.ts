import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";
import { isAllowedPhotoHost } from "../../src/plugins/verification/services/photo.service.js";

let app: FastifyInstance;
let adminToken: string;
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
  viewerToken = app.jwt.sign({
    id: 2,
    email: "viewer@test.com",
    name: "Viewer",
    role: "viewer",
  });
});

afterAll(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// isAllowedPhotoHost — synchronous URL validation
// ---------------------------------------------------------------------------

describe("isAllowedPhotoHost", () => {
  it("allows HTTPS URLs from files.propx.com", () => {
    expect(isAllowedPhotoHost("https://files.propx.com/photos/abc.jpg")).toBe(
      true,
    );
  });

  it("allows HTTPS URLs from hairpintrucking.jotform.com", () => {
    expect(
      isAllowedPhotoHost(
        "https://hairpintrucking.jotform.com/uploads/photo.png",
      ),
    ).toBe(true);
  });

  it("allows HTTPS URLs from www.jotform.com", () => {
    expect(
      isAllowedPhotoHost("https://www.jotform.com/uploads/ticket.jpg"),
    ).toBe(true);
  });

  it("allows HTTPS URLs from storage.googleapis.com", () => {
    expect(
      isAllowedPhotoHost("https://storage.googleapis.com/bucket/file.jpg"),
    ).toBe(true);
  });

  it("allows HTTP URLs from JotForm hosts (exception)", () => {
    expect(
      isAllowedPhotoHost(
        "http://hairpintrucking.jotform.com/uploads/photo.png",
      ),
    ).toBe(true);
    expect(
      isAllowedPhotoHost("http://www.jotform.com/uploads/ticket.jpg"),
    ).toBe(true);
  });

  it("blocks HTTP for non-JotForm hosts", () => {
    expect(isAllowedPhotoHost("http://files.propx.com/photos/abc.jpg")).toBe(
      false,
    );
    expect(
      isAllowedPhotoHost("http://storage.googleapis.com/bucket/file.jpg"),
    ).toBe(false);
  });

  it("blocks URLs from unknown hosts", () => {
    expect(isAllowedPhotoHost("https://evil.com/malware.jpg")).toBe(false);
    expect(isAllowedPhotoHost("https://attacker.example.com/photo.png")).toBe(
      false,
    );
  });

  it("blocks file:// protocol", () => {
    expect(isAllowedPhotoHost("file:///etc/passwd")).toBe(false);
  });

  it("blocks ftp:// protocol", () => {
    expect(isAllowedPhotoHost("ftp://files.propx.com/photo.jpg")).toBe(false);
  });

  it("blocks data: URLs", () => {
    expect(isAllowedPhotoHost("data:image/png;base64,abc")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isAllowedPhotoHost("")).toBe(false);
  });

  it("returns false for invalid URL", () => {
    expect(isAllowedPhotoHost("not-a-url")).toBe(false);
  });

  it("blocks localhost", () => {
    expect(isAllowedPhotoHost("https://localhost/photo.jpg")).toBe(false);
    expect(isAllowedPhotoHost("http://localhost:3000/photo.jpg")).toBe(false);
  });

  it("blocks RFC-1918 IPs in URL", () => {
    expect(isAllowedPhotoHost("http://10.0.0.1/photo.jpg")).toBe(false);
    expect(isAllowedPhotoHost("http://172.16.0.1/photo.jpg")).toBe(false);
    expect(isAllowedPhotoHost("http://192.168.1.1/photo.jpg")).toBe(false);
  });

  it("blocks 127.x.x.x in URL", () => {
    expect(isAllowedPhotoHost("http://127.0.0.1/photo.jpg")).toBe(false);
    expect(isAllowedPhotoHost("https://127.0.0.1:8080/photo.jpg")).toBe(false);
  });

  it("blocks link-local IPs in URL", () => {
    expect(isAllowedPhotoHost("http://169.254.1.1/photo.jpg")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Route registration — routes respond (not 404)
// ---------------------------------------------------------------------------

describe("Verification Plugin — route registration", () => {
  const routes = [
    {
      method: "GET" as const,
      url: "/api/v1/verification/photos/load/1",
    },
    {
      method: "GET" as const,
      url: "/api/v1/verification/photos/proxy?url=https://files.propx.com/test.jpg",
    },
    {
      method: "POST" as const,
      url: "/api/v1/verification/photos/zip",
    },
    {
      method: "POST" as const,
      url: "/api/v1/verification/jotform/sync",
    },
    {
      method: "GET" as const,
      url: "/api/v1/verification/jotform/stats",
    },
  ];

  for (const route of routes) {
    it(`${route.method} ${route.url.split("?")[0]} is registered (not 404)`, async () => {
      const response = await app.inject({
        method: route.method,
        url: route.url,
      });
      // Route exists — should not be 404. Will be 401 (no auth token)
      expect(response.statusCode).not.toBe(404);
    });
  }
});

// ---------------------------------------------------------------------------
// Auth enforcement
// ---------------------------------------------------------------------------

describe("Verification Plugin — auth enforcement", () => {
  it("rejects unauthenticated requests to photos/load", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/photos/load/1",
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects unauthenticated requests to photos/proxy", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/photos/proxy?url=https://files.propx.com/test.jpg",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to jotform/stats", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/jotform/stats",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects viewer role from jotform/sync (requires admin/dispatcher)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/verification/jotform/sync",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("rejects viewer role from photos/zip (requires admin/dispatcher)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/verification/photos/zip",
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { assignmentIds: [1] },
    });
    expect(response.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Proxy — SSRF protection
// ---------------------------------------------------------------------------

describe("Verification Plugin — proxy SSRF protection", () => {
  it("returns 400 for disallowed URL host", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/photos/proxy?url=https://evil.com/malware.jpg",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INVALID_URL");
  });

  it("returns 400 for file:// URL", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/photos/proxy?url=file:///etc/passwd",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe("INVALID_URL");
  });

  it("returns 400 for RFC-1918 IP URL", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/photos/proxy?url=http://192.168.1.1/photo.jpg",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe("INVALID_URL");
  });

  it("returns 400 for localhost URL", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/photos/proxy?url=http://localhost:3000/secret",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it("requires url query parameter", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/photos/proxy",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// JotForm sync endpoint
// ---------------------------------------------------------------------------

describe("Verification Plugin — JotForm sync", () => {
  it("returns 503 when JOTFORM_API_KEY is not set", async () => {
    // Ensure the key is not set for this test
    const originalKey = process.env.JOTFORM_API_KEY;
    delete process.env.JOTFORM_API_KEY;

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/verification/jotform/sync",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(response.statusCode).toBe(503);
      const body = response.json();
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(body.error.message).toContain("JOTFORM_API_KEY");
    } finally {
      // Restore
      if (originalKey) process.env.JOTFORM_API_KEY = originalKey;
    }
  });
});

// ---------------------------------------------------------------------------
// ZIP endpoint validation
// ---------------------------------------------------------------------------

describe("Verification Plugin — ZIP endpoint", () => {
  it("requires assignmentIds in body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/verification/photos/zip",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it("requires at least 1 assignmentId", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/verification/photos/zip",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentIds: [] },
    });
    expect(response.statusCode).toBe(400);
  });

  it("limits to 50 assignmentIds", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/verification/photos/zip",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentIds: Array.from({ length: 51 }, (_, i) => i + 1) },
    });
    expect(response.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

describe("Verification Plugin — response envelope", () => {
  it("returns standard error envelope on auth failure", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/photos/load/1",
    });
    const body = response.json();
    expect(body).toHaveProperty("success");
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
  });
});
