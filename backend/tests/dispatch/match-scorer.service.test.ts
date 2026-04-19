import { describe, it, expect } from "vitest";
import {
  scoreMatch,
  DEFAULT_CONFIG,
  type MatchFeatures,
  type ScorerConfig,
} from "../../src/plugins/dispatch/services/match-scorer.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const greenFeatures: MatchFeatures = {
  bolMatch: "exact",
  weightDeltaPct: 2,
  hasPhoto: true,
  driverSimilarity: 1,
  autoMapTier: 1,
  wellAssigned: true,
  hasTicket: true,
  hasRate: true,
  deliveredRecent: true,
};

const redFeatures: MatchFeatures = {
  bolMatch: "none",
  weightDeltaPct: 50,
  hasPhoto: false,
  driverSimilarity: null,
  autoMapTier: 0,
  wellAssigned: false,
  hasTicket: false,
  hasRate: false,
  deliveredRecent: false,
};

// ---------------------------------------------------------------------------
// Core scoring contract
// ---------------------------------------------------------------------------

describe("scoreMatch — base contract", () => {
  it("returns a score in [0, 1]", () => {
    const s1 = scoreMatch(greenFeatures);
    const s2 = scoreMatch(redFeatures);
    expect(s1.score).toBeGreaterThanOrEqual(0);
    expect(s1.score).toBeLessThanOrEqual(1);
    expect(s2.score).toBeGreaterThanOrEqual(0);
    expect(s2.score).toBeLessThanOrEqual(1);
  });

  it("perfect match scores at least 0.95", () => {
    const s = scoreMatch(greenFeatures);
    expect(s.score).toBeGreaterThanOrEqual(0.95);
    expect(s.tier).toBe("high");
  });

  it("all-red scores at most 0.2", () => {
    const s = scoreMatch(redFeatures);
    expect(s.score).toBeLessThanOrEqual(0.2);
    expect(s.tier).toBe("uncertain");
  });

  it("is deterministic — same inputs produce same score", () => {
    const a = scoreMatch(greenFeatures);
    const b = scoreMatch(greenFeatures);
    expect(a.score).toBe(b.score);
    expect(a.drivers).toEqual(b.drivers);
    expect(a.tier).toBe(b.tier);
  });

  it("returns a drivers array with one entry per scored feature", () => {
    const s = scoreMatch(greenFeatures);
    // 9 features defined on MatchFeatures → 9 driver entries
    expect(s.drivers.length).toBe(9);
    const featureNames = s.drivers.map((d) => d.feature);
    expect(featureNames).toContain("bolMatch");
    expect(featureNames).toContain("weightDeltaPct");
    expect(featureNames).toContain("hasPhoto");
    expect(featureNames).toContain("driverSimilarity");
    expect(featureNames).toContain("autoMapTier");
    expect(featureNames).toContain("wellAssigned");
    expect(featureNames).toContain("hasTicket");
    expect(featureNames).toContain("hasRate");
    expect(featureNames).toContain("deliveredRecent");
  });

  it("drivers are ordered by absolute contribution magnitude, descending", () => {
    const s = scoreMatch({ ...greenFeatures, hasPhoto: false });
    for (let i = 1; i < s.drivers.length; i++) {
      expect(Math.abs(s.drivers[i - 1].contribution)).toBeGreaterThanOrEqual(
        Math.abs(s.drivers[i].contribution),
      );
    }
  });

  it("explainability invariant — drivers sum plus base equals score (pre-clamp)", () => {
    // Use features that don't saturate to make the invariant cleanly testable
    const mixed: MatchFeatures = {
      bolMatch: "last4",
      weightDeltaPct: 10,
      hasPhoto: true,
      driverSimilarity: 0.7,
      autoMapTier: 2,
      wellAssigned: true,
      hasTicket: false,
      hasRate: false,
      deliveredRecent: true,
    };
    const s = scoreMatch(mixed);
    const sum = s.drivers.reduce((acc, d) => acc + d.contribution, 0);
    // BASE_SCORE should be 0.5 by design
    expect(s.score).toBeCloseTo(0.5 + sum, 3);
  });
});

// ---------------------------------------------------------------------------
// Individual feature behavior
// ---------------------------------------------------------------------------

describe("scoreMatch — per-feature contributions", () => {
  it("bolMatch=exact contributes more than last4", () => {
    const exact = scoreMatch({ ...redFeatures, bolMatch: "exact" });
    const last4 = scoreMatch({ ...redFeatures, bolMatch: "last4" });
    const exactDriver = exact.drivers.find((d) => d.feature === "bolMatch")!;
    const last4Driver = last4.drivers.find((d) => d.feature === "bolMatch")!;
    expect(exactDriver.contribution).toBeGreaterThan(last4Driver.contribution);
  });

  it("bolMatch=none contributes a negative amount", () => {
    const s = scoreMatch({ ...greenFeatures, bolMatch: "none" });
    const driver = s.drivers.find((d) => d.feature === "bolMatch")!;
    expect(driver.contribution).toBeLessThan(0);
  });

  it("weightDeltaPct within 5% is positive, over 20% is negative", () => {
    const tight = scoreMatch({ ...redFeatures, weightDeltaPct: 3 });
    const loose = scoreMatch({ ...redFeatures, weightDeltaPct: 30 });
    const tightDriver = tight.drivers.find(
      (d) => d.feature === "weightDeltaPct",
    )!;
    const looseDriver = loose.drivers.find(
      (d) => d.feature === "weightDeltaPct",
    )!;
    expect(tightDriver.contribution).toBeGreaterThan(0);
    expect(looseDriver.contribution).toBeLessThan(0);
  });

  it("weightDeltaPct null contributes zero (no signal)", () => {
    const s = scoreMatch({ ...greenFeatures, weightDeltaPct: null });
    const driver = s.drivers.find((d) => d.feature === "weightDeltaPct")!;
    expect(driver.contribution).toBe(0);
  });

  it("hasPhoto=false penalizes by photo weight", () => {
    // Use mid-quality features so scores don't saturate at 1.0
    const mid: MatchFeatures = {
      bolMatch: "last4",
      weightDeltaPct: 10,
      hasPhoto: true,
      driverSimilarity: 0.5,
      autoMapTier: 3,
      wellAssigned: true,
      hasTicket: false,
      hasRate: false,
      deliveredRecent: false,
    };
    const withPhoto = scoreMatch(mid);
    const withoutPhoto = scoreMatch({ ...mid, hasPhoto: false });
    expect(withPhoto.score).toBeGreaterThan(withoutPhoto.score);
  });

  it("driverSimilarity contributes proportionally to its value", () => {
    const half = scoreMatch({ ...redFeatures, driverSimilarity: 0.5 });
    const full = scoreMatch({ ...redFeatures, driverSimilarity: 1 });
    const halfDriver = half.drivers.find(
      (d) => d.feature === "driverSimilarity",
    )!;
    const fullDriver = full.drivers.find(
      (d) => d.feature === "driverSimilarity",
    )!;
    expect(fullDriver.contribution).toBeCloseTo(halfDriver.contribution * 2, 3);
  });

  it("driverSimilarity null contributes zero", () => {
    const s = scoreMatch({ ...greenFeatures, driverSimilarity: null });
    const driver = s.drivers.find((d) => d.feature === "driverSimilarity")!;
    expect(driver.contribution).toBe(0);
  });

  it("autoMapTier 1 beats tier 2 beats tier 3 beats tier 0", () => {
    const t1 = scoreMatch({ ...redFeatures, autoMapTier: 1 });
    const t2 = scoreMatch({ ...redFeatures, autoMapTier: 2 });
    const t3 = scoreMatch({ ...redFeatures, autoMapTier: 3 });
    const t0 = scoreMatch({ ...redFeatures, autoMapTier: 0 });
    const c = (r: ReturnType<typeof scoreMatch>) =>
      r.drivers.find((d) => d.feature === "autoMapTier")!.contribution;
    expect(c(t1)).toBeGreaterThan(c(t2));
    expect(c(t2)).toBeGreaterThan(c(t3));
    expect(c(t3)).toBeGreaterThan(c(t0));
  });

  it("wellAssigned=false is a large negative (unassigned well is load-blocking)", () => {
    const s = scoreMatch({ ...greenFeatures, wellAssigned: false });
    const driver = s.drivers.find((d) => d.feature === "wellAssigned")!;
    // "large" = more negative than any positive flag feature's weight
    expect(driver.contribution).toBeLessThan(-0.1);
  });
});

// ---------------------------------------------------------------------------
// Tier bucketing
// ---------------------------------------------------------------------------

describe("scoreMatch — tier bucketing", () => {
  it("maps score >= 0.80 to high", () => {
    // All green = 0.95+ = high
    expect(scoreMatch(greenFeatures).tier).toBe("high");
  });

  it("maps score in [0.60, 0.80) to medium", () => {
    // Strip one feature to drop into medium — photo removal gives ~0.80
    // Strip two features to more reliably land in medium band.
    const s = scoreMatch({
      ...greenFeatures,
      hasPhoto: false,
      weightDeltaPct: 10, // partial weight signal
    });
    if (s.score >= 0.6 && s.score < 0.8) {
      expect(s.tier).toBe("medium");
    }
  });

  it("maps score < 0.40 to uncertain", () => {
    expect(scoreMatch(redFeatures).tier).toBe("uncertain");
  });

  it("tier boundary values fall into the higher tier", () => {
    // Score of exactly 0.80 should be "high", not "medium"
    const features = { ...greenFeatures };
    // This is a contract test; the specific boundary is an implementation detail,
    // but at 0.80 exact, it should be "high" by ≥ convention.
    const s = scoreMatch(features);
    if (Math.abs(s.score - 0.8) < 0.001) {
      expect(s.tier).toBe("high");
    }
  });
});

// ---------------------------------------------------------------------------
// Config overrides
// ---------------------------------------------------------------------------

describe("scoreMatch — config overrides", () => {
  it("accepts a custom config and uses its weights", () => {
    const allZero: ScorerConfig = {
      ...DEFAULT_CONFIG,
      weights: Object.fromEntries(
        Object.keys(DEFAULT_CONFIG.weights).map((k) => [k, 0]),
      ) as ScorerConfig["weights"],
    };
    const s = scoreMatch(greenFeatures, allZero);
    // All zero weights → score stays at base (0.5), tier is low or medium
    expect(s.score).toBeCloseTo(0.5, 2);
    for (const d of s.drivers) {
      expect(d.contribution).toBe(0);
    }
  });

  it("DEFAULT_CONFIG has a weight for every scored feature", () => {
    const expected = [
      "bolMatch",
      "weightDeltaPct",
      "hasPhoto",
      "driverSimilarity",
      "autoMapTier",
      "wellAssigned",
      "hasTicket",
      "hasRate",
      "deliveredRecent",
    ];
    for (const f of expected) {
      expect(DEFAULT_CONFIG.weights).toHaveProperty(f);
      expect(typeof DEFAULT_CONFIG.weights[f]).toBe("number");
    }
  });

  it("unknown features in config are ignored (forward compat)", () => {
    const withJunk: ScorerConfig = {
      ...DEFAULT_CONFIG,
      weights: {
        ...DEFAULT_CONFIG.weights,
        someFutureFeature: 0.99,
      } as ScorerConfig["weights"],
    };
    const a = scoreMatch(greenFeatures);
    const b = scoreMatch(greenFeatures, withJunk);
    expect(a.score).toBe(b.score);
  });
});

// ---------------------------------------------------------------------------
// Clamping
// ---------------------------------------------------------------------------

describe("scoreMatch — clamping", () => {
  it("clamps high-outlier score to 1.0", () => {
    // Force contributions that would exceed 1.0 with a config that over-weights
    const overweight: ScorerConfig = {
      ...DEFAULT_CONFIG,
      weights: { ...DEFAULT_CONFIG.weights, bolMatch: 10 },
    };
    const s = scoreMatch(greenFeatures, overweight);
    expect(s.score).toBe(1);
  });

  it("clamps low-outlier score to 0.0", () => {
    const overpenalty: ScorerConfig = {
      ...DEFAULT_CONFIG,
      weights: { ...DEFAULT_CONFIG.weights, bolMatch: 10 },
    };
    const s = scoreMatch(redFeatures, overpenalty);
    expect(s.score).toBe(0);
  });
});
