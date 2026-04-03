import { describe, it, expect } from "vitest";

describe("Scheduler sync_runs integration", () => {
  it("recordSyncRun exports from scheduler", async () => {
    const mod = await import("../src/scheduler.js");
    expect(typeof mod.recordSyncRun).toBe("function");
  });
});
