import { describe, it, expect } from "vitest";
import { buildApp } from "../../src/app.js";

describe("Diagnostics", () => {
  it("GET /diag/health returns status", async () => {
    const app = buildApp({ logger: false });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/v1/diag/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.status).toBeDefined();
    expect(body.data.uptime).toBeGreaterThanOrEqual(0);
    await app.close();
  });

  it("GET /diag/performance returns stats", async () => {
    const app = buildApp({ logger: false });
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/diag/performance",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("p50");
    expect(body.data).toHaveProperty("p95");
    expect(body.data).toHaveProperty("p99");
    await app.close();
  });

  it("does NOT require authentication", async () => {
    const app = buildApp({ logger: false });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/v1/diag/health" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
