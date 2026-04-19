import { describe, it, expect } from "vitest";
import {
  extractMatchFeatures,
  type FeatureSource,
} from "../../src/plugins/dispatch/services/match-features.service.js";

const baseSource: FeatureSource = {
  bolNo: "123456",
  ticketNo: "TKT-1",
  rate: "125.50",
  wellId: 42,
  driverName: "Mike Johnson",
  photoStatus: "attached",
  deliveredOn: new Date("2026-04-15T00:00:00Z"),
  autoMapTier: 1,
  uncertainReasons: [],
};

// Fixed "now" for deterministic recency checks
const NOW = new Date("2026-04-18T12:00:00Z").getTime();

describe("extractMatchFeatures — clean row", () => {
  it("returns all-green features for a fully-populated load", () => {
    const f = extractMatchFeatures(baseSource, NOW);
    expect(f.bolMatch).toBe("exact");
    expect(f.weightDeltaPct).toBe(2);
    expect(f.hasPhoto).toBe(true);
    expect(f.driverSimilarity).toBe(1);
    expect(f.autoMapTier).toBe(1);
    expect(f.wellAssigned).toBe(true);
    expect(f.hasTicket).toBe(true);
    expect(f.hasRate).toBe(true);
    expect(f.deliveredRecent).toBe(true);
  });
});

describe("extractMatchFeatures — Phase 5 real OCR path", () => {
  it("returns 'exact' when OCR last-4 matches load last-4", () => {
    const f = extractMatchFeatures(
      { ...baseSource, bolNo: "BOL-71234", ocrBolNo: "BOL-71234" },
      NOW,
    );
    expect(f.bolMatch).toBe("exact");
  });

  it("returns 'exact' when OCR last-4 matches despite different prefixes", () => {
    // Carrier prefix differs but the stable identity last-4 matches
    const f = extractMatchFeatures(
      { ...baseSource, bolNo: "BOL-71234", ocrBolNo: "71234" },
      NOW,
    );
    expect(f.bolMatch).toBe("exact");
  });

  it("returns 'none' when OCR last-4 doesn't match", () => {
    const f = extractMatchFeatures(
      { ...baseSource, bolNo: "BOL-71234", ocrBolNo: "BOL-99999" },
      NOW,
    );
    expect(f.bolMatch).toBe("none");
  });

  it("OCR match overrides the bol_mismatch flag (real data wins over proxy)", () => {
    const f = extractMatchFeatures(
      {
        ...baseSource,
        bolNo: "BOL-71234",
        ocrBolNo: "BOL-71234",
        uncertainReasons: ["bol_mismatch"],
      },
      NOW,
    );
    // Real OCR compare says they match; flag was stale/wrong
    expect(f.bolMatch).toBe("exact");
  });

  it("falls back to flag-based when OCR is null", () => {
    const f = extractMatchFeatures(
      { ...baseSource, ocrBolNo: null, uncertainReasons: ["bol_mismatch"] },
      NOW,
    );
    expect(f.bolMatch).toBe("none");
  });

  it("computes real weight delta percentage when both weights present", () => {
    const f = extractMatchFeatures(
      {
        ...baseSource,
        loadWeightLbs: 48000,
        ocrWeightLbs: 48600, // 1.25% delta
      },
      NOW,
    );
    expect(f.weightDeltaPct).toBeCloseTo(1.25, 1);
  });

  it("computes large weight delta when OCR differs significantly", () => {
    const f = extractMatchFeatures(
      {
        ...baseSource,
        loadWeightLbs: 48000,
        ocrWeightLbs: 36000, // 25% below
      },
      NOW,
    );
    expect(f.weightDeltaPct).toBeCloseTo(25, 1);
  });

  it("falls back to flag-based when OCR weight is null", () => {
    const f = extractMatchFeatures(
      {
        ...baseSource,
        loadWeightLbs: 48000,
        ocrWeightLbs: null,
        uncertainReasons: ["weight_mismatch"],
      },
      NOW,
    );
    expect(f.weightDeltaPct).toBe(30);
  });
});

describe("extractMatchFeatures — bolMatch tri-value", () => {
  it("returns 'none' when bolNo is null", () => {
    const f = extractMatchFeatures({ ...baseSource, bolNo: null }, NOW);
    expect(f.bolMatch).toBe("none");
  });

  it("returns 'none' when bol_mismatch is among uncertain reasons", () => {
    // A flagged mismatch should NOT score as a partial positive — the
    // matcher wasn't confident in the BOL's correctness. Treat it as
    // missing-signal until Phase 5 upgrades to real OCR last-4 compare.
    const f = extractMatchFeatures(
      { ...baseSource, uncertainReasons: ["bol_mismatch"] },
      NOW,
    );
    expect(f.bolMatch).toBe("none");
  });

  it("returns 'exact' when BOL present and no mismatch flag", () => {
    const f = extractMatchFeatures(baseSource, NOW);
    expect(f.bolMatch).toBe("exact");
  });
});

describe("extractMatchFeatures — weight delta", () => {
  it("returns 30 when weight_mismatch is flagged (hard-penalty band)", () => {
    const f = extractMatchFeatures(
      { ...baseSource, uncertainReasons: ["weight_mismatch"] },
      NOW,
    );
    expect(f.weightDeltaPct).toBe(30);
  });

  it("returns 2 when no flag and BOL present (green band)", () => {
    const f = extractMatchFeatures(baseSource, NOW);
    expect(f.weightDeltaPct).toBe(2);
  });

  it("returns null when no BOL (no OCR weight signal possible)", () => {
    const f = extractMatchFeatures({ ...baseSource, bolNo: null }, NOW);
    expect(f.weightDeltaPct).toBeNull();
  });
});

describe("extractMatchFeatures — photo + driver + well + ticket", () => {
  it("hasPhoto=true only when photoStatus is 'attached' AND no_photo_48h not flagged", () => {
    expect(extractMatchFeatures(baseSource, NOW).hasPhoto).toBe(true);
    expect(
      extractMatchFeatures({ ...baseSource, photoStatus: "pending" }, NOW)
        .hasPhoto,
    ).toBe(false);
    expect(
      extractMatchFeatures({ ...baseSource, photoStatus: "missing" }, NOW)
        .hasPhoto,
    ).toBe(false);
    expect(
      extractMatchFeatures({ ...baseSource, photoStatus: null }, NOW).hasPhoto,
    ).toBe(false);
    // no_photo_48h flag overrides a green photoStatus column (data
    // inconsistency case in the seeds)
    expect(
      extractMatchFeatures(
        { ...baseSource, photoStatus: "attached", uncertainReasons: ["no_photo_48h"] },
        NOW,
      ).hasPhoto,
    ).toBe(false);
  });

  it("driverSimilarity=1 when driver name present, null when absent", () => {
    expect(extractMatchFeatures(baseSource, NOW).driverSimilarity).toBe(1);
    expect(
      extractMatchFeatures({ ...baseSource, driverName: null }, NOW)
        .driverSimilarity,
    ).toBeNull();
    expect(
      extractMatchFeatures({ ...baseSource, driverName: "" }, NOW)
        .driverSimilarity,
    ).toBeNull();
    expect(
      extractMatchFeatures({ ...baseSource, driverName: "   " }, NOW)
        .driverSimilarity,
    ).toBeNull();
  });

  it("driverSimilarity=0.3 when driver_mismatch is flagged", () => {
    const f = extractMatchFeatures(
      { ...baseSource, uncertainReasons: ["driver_mismatch"] },
      NOW,
    );
    expect(f.driverSimilarity).toBe(0.3);
  });

  it("driverSimilarity=0.6 when fuzzy_match flag is set", () => {
    const f = extractMatchFeatures(
      { ...baseSource, uncertainReasons: ["fuzzy_match"] },
      NOW,
    );
    expect(f.driverSimilarity).toBe(0.6);
  });

  it("wellAssigned follows wellId presence", () => {
    expect(extractMatchFeatures(baseSource, NOW).wellAssigned).toBe(true);
    expect(
      extractMatchFeatures({ ...baseSource, wellId: null }, NOW).wellAssigned,
    ).toBe(false);
  });

  it("hasTicket rejects empty + whitespace-only strings", () => {
    expect(extractMatchFeatures(baseSource, NOW).hasTicket).toBe(true);
    expect(
      extractMatchFeatures({ ...baseSource, ticketNo: null }, NOW).hasTicket,
    ).toBe(false);
    expect(
      extractMatchFeatures({ ...baseSource, ticketNo: "" }, NOW).hasTicket,
    ).toBe(false);
    expect(
      extractMatchFeatures({ ...baseSource, ticketNo: "   " }, NOW).hasTicket,
    ).toBe(false);
  });

  it("hasRate rejects empty + whitespace-only strings", () => {
    expect(extractMatchFeatures(baseSource, NOW).hasRate).toBe(true);
    expect(
      extractMatchFeatures({ ...baseSource, rate: null }, NOW).hasRate,
    ).toBe(false);
    expect(
      extractMatchFeatures({ ...baseSource, rate: "" }, NOW).hasRate,
    ).toBe(false);
  });
});

describe("extractMatchFeatures — autoMapTier", () => {
  it("passes through numeric tier", () => {
    expect(extractMatchFeatures({ ...baseSource, autoMapTier: 2 }, NOW).autoMapTier).toBe(2);
    expect(extractMatchFeatures({ ...baseSource, autoMapTier: 3 }, NOW).autoMapTier).toBe(3);
  });

  it("treats null tier as 0 (no cascade hit)", () => {
    expect(
      extractMatchFeatures({ ...baseSource, autoMapTier: null }, NOW)
        .autoMapTier,
    ).toBe(0);
  });
});

describe("extractMatchFeatures — deliveredRecent window", () => {
  it("true for delivery within 30 days", () => {
    const recent = new Date(NOW - 5 * 24 * 60 * 60 * 1000);
    expect(
      extractMatchFeatures({ ...baseSource, deliveredOn: recent }, NOW)
        .deliveredRecent,
    ).toBe(true);
  });

  it("false for delivery more than 30 days ago", () => {
    const old = new Date(NOW - 60 * 24 * 60 * 60 * 1000);
    expect(
      extractMatchFeatures({ ...baseSource, deliveredOn: old }, NOW)
        .deliveredRecent,
    ).toBe(false);
  });

  it("false when deliveredOn is null", () => {
    expect(
      extractMatchFeatures({ ...baseSource, deliveredOn: null }, NOW)
        .deliveredRecent,
    ).toBe(false);
  });

  it("false when deliveredOn is an unparseable string", () => {
    expect(
      extractMatchFeatures({ ...baseSource, deliveredOn: "not-a-date" }, NOW)
        .deliveredRecent,
    ).toBe(false);
  });

  it("accepts ISO strings", () => {
    const recentIso = new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      extractMatchFeatures({ ...baseSource, deliveredOn: recentIso }, NOW)
        .deliveredRecent,
    ).toBe(true);
  });
});
