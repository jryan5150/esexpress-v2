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

  it("does NOT flag bol_mismatch when either BOL is shorter than 4 chars", () => {
    expect(
      computeUncertainReasons({ ...base, bolNo: "12", ocrBolNo: "9999" }),
    ).not.toContain("bol_mismatch");
    expect(
      computeUncertainReasons({ ...base, bolNo: "1234", ocrBolNo: "99" }),
    ).not.toContain("bol_mismatch");
  });

  it("does NOT flag fuzzy_match when autoMapTier is null", () => {
    expect(
      computeUncertainReasons({ ...base, autoMapTier: null }),
    ).not.toContain("fuzzy_match");
  });

  it("flags rate_missing on non-numeric rate strings", () => {
    expect(computeUncertainReasons({ ...base, rate: "125.50/ton" })).toContain(
      "rate_missing",
    );
    expect(computeUncertainReasons({ ...base, rate: "$125" })).toContain(
      "rate_missing",
    );
    expect(computeUncertainReasons({ ...base, rate: "abc" })).toContain(
      "rate_missing",
    );
  });

  it("trims whitespace on rate before parsing", () => {
    expect(
      computeUncertainReasons({ ...base, rate: "  125.50  " }),
    ).not.toContain("rate_missing");
  });

  it("no_photo_48h uses injected nowMs deterministically", () => {
    const fixedNow = new Date("2026-04-15T12:00:00Z").getTime();
    const delivered50hAgo = new Date(fixedNow - 50 * 60 * 60 * 1000);
    const delivered10hAgo = new Date(fixedNow - 10 * 60 * 60 * 1000);
    expect(
      computeUncertainReasons(
        { ...base, photoStatus: "missing", deliveredOn: delivered50hAgo },
        fixedNow,
      ),
    ).toContain("no_photo_48h");
    expect(
      computeUncertainReasons(
        { ...base, photoStatus: "missing", deliveredOn: delivered10hAgo },
        fixedNow,
      ),
    ).not.toContain("no_photo_48h");
  });
});

import {
  allowedTransition,
  nextHandlerForStage,
} from "../../src/plugins/dispatch/services/workbench.service.js";

describe("allowedTransition", () => {
  it("allows uncertain → ready_to_build only when reasons is empty", () => {
    expect(allowedTransition("uncertain", "ready_to_build", [])).toBe(true);
    expect(
      allowedTransition("uncertain", "ready_to_build", ["rate_missing"]),
    ).toBe(false);
  });
  it("allows ready_to_build → building", () => {
    expect(allowedTransition("ready_to_build", "building", [])).toBe(true);
  });
  it("allows building → entered", () => {
    expect(allowedTransition("building", "entered", [])).toBe(true);
  });
  it("allows entered → cleared", () => {
    expect(allowedTransition("entered", "cleared", [])).toBe(true);
  });
  it("allows flag-back: any stage → uncertain", () => {
    expect(allowedTransition("entered", "uncertain", [])).toBe(true);
    expect(allowedTransition("building", "uncertain", [])).toBe(true);
  });
  it("forbids skipping stages (e.g. uncertain → building)", () => {
    expect(allowedTransition("uncertain", "building", [])).toBe(false);
  });
  it("forbids backward non-flag transitions (e.g. entered → building)", () => {
    expect(allowedTransition("entered", "building", [])).toBe(false);
  });
  it("cleared is terminal except via flag-back", () => {
    expect(allowedTransition("cleared", "uncertain", [])).toBe(true);
    expect(allowedTransition("cleared", "entered", [])).toBe(false);
  });
});

describe("nextHandlerForStage", () => {
  const users = [
    { id: 1, name: "Jessica", role: "admin" },
    { id: 2, name: "Stephanie", role: "admin" },
    { id: 3, name: "Katie", role: "admin" },
  ];
  it("routes uncertain → Jessica (by name substring)", () => {
    expect(nextHandlerForStage("uncertain", users)).toBe(1);
  });
  it("keeps handler unchanged on ready_to_build", () => {
    expect(nextHandlerForStage("ready_to_build", users)).toBeNull();
  });
  it("routes entered → Katie", () => {
    expect(nextHandlerForStage("entered", users)).toBe(3);
  });
  it("cleared has no handler", () => {
    expect(nextHandlerForStage("cleared", users)).toBeNull();
  });
  it("returns null if no matching user exists", () => {
    expect(
      nextHandlerForStage("uncertain", [{ id: 9, name: "Bob", role: "admin" }]),
    ).toBeNull();
  });
});
