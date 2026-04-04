import { describe, it, expect } from "vitest";
import {
  eraFilter,
  ERA_CUTOFF,
} from "../../src/plugins/dispatch/lib/era-filter.js";

describe("eraFilter", () => {
  it("returns a live filter by default when era is undefined", () => {
    const filter = eraFilter(undefined);
    expect(filter).toBeDefined();
    expect(filter.toString()).toContain(">=");
  });

  it("returns a live filter for era=live", () => {
    const filter = eraFilter("live");
    expect(filter).toBeDefined();
  });

  it("returns an archive filter for era=archive", () => {
    const filter = eraFilter("archive");
    expect(filter).toBeDefined();
  });

  it("defaults to live for invalid era values", () => {
    const filter = eraFilter("bogus" as any);
    expect(filter).toBeDefined();
  });

  it("exports the cutoff date as 2026-01-01 CST", () => {
    expect(ERA_CUTOFF.getFullYear()).toBe(2026);
    expect(ERA_CUTOFF.getMonth()).toBe(0);
    expect(ERA_CUTOFF.getDate()).toBe(1);
  });
});
