import { describe, it, expect } from "vitest";
import {
  classifyTier,
  shouldAutoPromote,
  type AutoMapResult,
} from "../../src/plugins/dispatch/services/auto-mapper.service.js";

describe("Auto-Mapper — classifyTier", () => {
  it("classifies propx_job_id match as Tier 1", () => {
    const result = classifyTier({ score: 1.0, matchType: "propx_job_id" });
    expect(result).toBe(1);
  });
  it("classifies exact_name match as Tier 1", () => {
    const result = classifyTier({ score: 1.0, matchType: "exact_name" });
    expect(result).toBe(1);
  });
  it("classifies exact_alias match as Tier 1", () => {
    const result = classifyTier({ score: 1.0, matchType: "exact_alias" });
    expect(result).toBe(1);
  });
  it("classifies fuzzy match with score > 0.85 as Tier 2 high confidence", () => {
    const result = classifyTier({ score: 0.9, matchType: "fuzzy_name" });
    expect(result).toBe(2);
  });
  it("classifies fuzzy match with score 0.5-0.85 as Tier 2 lower confidence", () => {
    const result = classifyTier({ score: 0.65, matchType: "fuzzy_name" });
    expect(result).toBe(2);
  });
  it("classifies no match as Tier 3", () => {
    const result = classifyTier({ score: 0, matchType: "unresolved" });
    expect(result).toBe(3);
  });
});

describe("Auto-Mapper — processLoadBatch", () => {
  it("exports processLoadBatch function", async () => {
    const mod =
      await import("../../src/plugins/dispatch/services/auto-mapper.service.js");
    expect(typeof mod.processLoadBatch).toBe("function");
  });
});

// ─── Auto-promotion gate (Build #1) ────────────────────────────────
//
// Pure decision function covering the Tier 1 auto-promotion rule:
//   Tier 1 + photo attached + not terminal upstream → ready_to_build.
// Anything else stays at 'uncertain' so a human reviews it.
describe("Auto-Mapper — shouldAutoPromote", () => {
  it("promotes on happy path: Tier 1 + photo + not cleared", () => {
    expect(
      shouldAutoPromote({
        autoMapTier: 1,
        hasPhoto: true,
        loadStatus: "Delivered",
        rawDataClearedAt: null,
      }),
    ).toBe(true);
  });

  it("blocks when photo is missing (Tier 1, not cleared)", () => {
    expect(
      shouldAutoPromote({
        autoMapTier: 1,
        hasPhoto: false,
        loadStatus: "Delivered",
        rawDataClearedAt: null,
      }),
    ).toBe(false);
  });

  it("blocks when upstream is cleared via raw_data.cleared_at", () => {
    expect(
      shouldAutoPromote({
        autoMapTier: 1,
        hasPhoto: true,
        loadStatus: "Delivered",
        rawDataClearedAt: "2026-04-20T12:00:00Z",
      }),
    ).toBe(false);
  });

  it("blocks when load.status is 'cleared' (case-insensitive)", () => {
    expect(
      shouldAutoPromote({
        autoMapTier: 1,
        hasPhoto: true,
        loadStatus: "Cleared",
        rawDataClearedAt: null,
      }),
    ).toBe(false);
    expect(
      shouldAutoPromote({
        autoMapTier: 1,
        hasPhoto: true,
        loadStatus: "cleared",
        rawDataClearedAt: null,
      }),
    ).toBe(false);
  });

  it("does not promote Tier 2 regardless of photo/status", () => {
    expect(
      shouldAutoPromote({
        autoMapTier: 2,
        hasPhoto: true,
        loadStatus: "Delivered",
        rawDataClearedAt: null,
      }),
    ).toBe(false);
  });

  it("does not promote Tier 3", () => {
    expect(
      shouldAutoPromote({
        autoMapTier: 3,
        hasPhoto: true,
        loadStatus: "Delivered",
        rawDataClearedAt: null,
      }),
    ).toBe(false);
  });

  it("does not promote when autoMapTier is null/undefined", () => {
    expect(
      shouldAutoPromote({
        autoMapTier: null,
        hasPhoto: true,
        loadStatus: "Delivered",
        rawDataClearedAt: null,
      }),
    ).toBe(false);
    expect(
      shouldAutoPromote({
        autoMapTier: undefined,
        hasPhoto: true,
        loadStatus: "Delivered",
        rawDataClearedAt: null,
      }),
    ).toBe(false);
  });

  it("treats empty-string cleared_at as not-cleared (defensive)", () => {
    expect(
      shouldAutoPromote({
        autoMapTier: 1,
        hasPhoto: true,
        loadStatus: null,
        rawDataClearedAt: "",
      }),
    ).toBe(true);
  });

  it("handles null loadStatus gracefully", () => {
    expect(
      shouldAutoPromote({
        autoMapTier: 1,
        hasPhoto: true,
        loadStatus: null,
        rawDataClearedAt: null,
      }),
    ).toBe(true);
  });
});

// Smoke test: verify auto-promotion helper is wired and exported.
describe("Auto-Mapper — exports", () => {
  it("exports shouldAutoPromote as a function", () => {
    expect(typeof shouldAutoPromote).toBe("function");
  });
});
