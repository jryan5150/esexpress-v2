import { describe, it, expect, beforeEach } from "vitest";
import { PerfBuffer, type PerfEntry } from "../../src/lib/perf-buffer.js";

describe("PerfBuffer", () => {
  let buffer: PerfBuffer;

  beforeEach(() => {
    buffer = new PerfBuffer(5);
  });

  it("records entries and retrieves them", () => {
    buffer.record({
      method: "GET",
      path: "/health",
      statusCode: 200,
      responseTimeMs: 12,
      timestamp: Date.now(),
    });
    expect(buffer.getEntries()).toHaveLength(1);
  });

  it("drops oldest when full", () => {
    for (let i = 0; i < 7; i++) {
      buffer.record({
        method: "GET",
        path: `/p${i}`,
        statusCode: 200,
        responseTimeMs: i * 10,
        timestamp: Date.now(),
      });
    }
    expect(buffer.getEntries()).toHaveLength(5);
    expect(buffer.getEntries()[0].path).toBe("/p2");
  });

  it("computes percentiles", () => {
    buffer = new PerfBuffer(100);
    const times = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    for (const ms of times) {
      buffer.record({
        method: "GET",
        path: "/test",
        statusCode: 200,
        responseTimeMs: ms,
        timestamp: Date.now(),
      });
    }
    const stats = buffer.computeStats();
    expect(stats.p50).toBe(50);
    expect(stats.p95).toBe(100);
    expect(stats.count).toBe(10);
  });

  it("groups errors by status code", () => {
    buffer = new PerfBuffer(100);
    buffer.record({
      method: "GET",
      path: "/a",
      statusCode: 200,
      responseTimeMs: 10,
      timestamp: Date.now(),
    });
    buffer.record({
      method: "GET",
      path: "/b",
      statusCode: 404,
      responseTimeMs: 5,
      timestamp: Date.now(),
    });
    buffer.record({
      method: "POST",
      path: "/c",
      statusCode: 500,
      responseTimeMs: 100,
      timestamp: Date.now(),
    });
    buffer.record({
      method: "GET",
      path: "/d",
      statusCode: 404,
      responseTimeMs: 8,
      timestamp: Date.now(),
    });
    const stats = buffer.computeStats();
    expect(stats.errorsByStatus[404]).toBe(2);
    expect(stats.errorsByStatus[500]).toBe(1);
  });

  it("finds top slow endpoints", () => {
    buffer = new PerfBuffer(100);
    buffer.record({
      method: "GET",
      path: "/slow",
      statusCode: 200,
      responseTimeMs: 500,
      timestamp: Date.now(),
    });
    buffer.record({
      method: "GET",
      path: "/slow",
      statusCode: 200,
      responseTimeMs: 600,
      timestamp: Date.now(),
    });
    buffer.record({
      method: "GET",
      path: "/fast",
      statusCode: 200,
      responseTimeMs: 10,
      timestamp: Date.now(),
    });
    const stats = buffer.computeStats();
    expect(stats.topSlow[0].path).toBe("GET /slow");
    expect(stats.topSlow[0].avgMs).toBe(550);
  });
});
