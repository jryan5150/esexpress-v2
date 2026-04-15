import { describe, it, expect } from "vitest";
import { computeUncertainReasons } from "../../src/plugins/dispatch/services/workbench.service.js";

describe("computeUncertainReasons", () => {
  const base = {
    wellId: 10,
    photoStatus: "attached" as const,
    autoMapTier: 1,
    bolNo: "123456",
    ocrBolNo: "123456",
    loadWeightLbs: 48000,
    ocrWeightLbs: 48200,
    rate: "125.50",
    deliveredOn: new Date(),
  };

  it("returns empty array when everything is clean", () => {
    expect(computeUncertainReasons(base)).toEqual([]);
  });

  it("flags unassigned_well when wellId is null", () => {
    expect(computeUncertainReasons({ ...base, wellId: null })).toContain(
      "unassigned_well",
    );
  });

  it("flags fuzzy_match when autoMapTier > 1", () => {
    expect(computeUncertainReasons({ ...base, autoMapTier: 3 })).toContain(
      "fuzzy_match",
    );
  });

  it("flags bol_mismatch when last-4 of ocrBolNo != bolNo", () => {
    expect(
      computeUncertainReasons({ ...base, bolNo: "123456", ocrBolNo: "999999" }),
    ).toContain("bol_mismatch");
  });

  it("does NOT flag bol_mismatch when ocrBolNo is null", () => {
    expect(computeUncertainReasons({ ...base, ocrBolNo: null })).not.toContain(
      "bol_mismatch",
    );
  });

  it("flags weight_mismatch when divergence >5%", () => {
    expect(
      computeUncertainReasons({
        ...base,
        loadWeightLbs: 48000,
        ocrWeightLbs: 52000,
      }),
    ).toContain("weight_mismatch");
  });

  it("does NOT flag weight_mismatch at exactly 5%", () => {
    expect(
      computeUncertainReasons({
        ...base,
        loadWeightLbs: 48000,
        ocrWeightLbs: 50400,
      }),
    ).not.toContain("weight_mismatch");
  });

  it("flags no_photo_48h when photoStatus=missing and delivered >48h ago", () => {
    const old = new Date(Date.now() - 49 * 60 * 60 * 1000);
    expect(
      computeUncertainReasons({
        ...base,
        photoStatus: "missing",
        deliveredOn: old,
      }),
    ).toContain("no_photo_48h");
  });

  it("does NOT flag no_photo_48h when photoStatus=missing but delivered <48h ago", () => {
    const recent = new Date(Date.now() - 1 * 60 * 60 * 1000);
    expect(
      computeUncertainReasons({
        ...base,
        photoStatus: "missing",
        deliveredOn: recent,
      }),
    ).not.toContain("no_photo_48h");
  });

  it("flags rate_missing when rate is null or empty", () => {
    expect(computeUncertainReasons({ ...base, rate: null })).toContain(
      "rate_missing",
    );
    expect(computeUncertainReasons({ ...base, rate: "" })).toContain(
      "rate_missing",
    );
    expect(computeUncertainReasons({ ...base, rate: "0" })).toContain(
      "rate_missing",
    );
  });

  it("returns multiple reasons when multiple triggers fire", () => {
    const result = computeUncertainReasons({
      ...base,
      wellId: null,
      rate: null,
    });
    expect(result).toEqual(
      expect.arrayContaining(["unassigned_well", "rate_missing"]),
    );
  });
});
