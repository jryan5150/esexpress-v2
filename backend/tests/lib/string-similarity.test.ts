import { describe, it, expect } from "vitest";
import {
  jaroWinkler,
  normalizeName,
  bestRosterMatch,
} from "../../src/lib/string-similarity.js";

describe("normalizeName", () => {
  it("lowercases + trims", () => {
    expect(normalizeName("  Mike Johnson  ")).toBe("mike johnson");
  });

  it("strips accents", () => {
    expect(normalizeName("José Ramírez")).toBe("jose ramirez");
  });

  it("collapses multi-space", () => {
    expect(normalizeName("Mike   Johnson")).toBe("mike johnson");
  });

  it("strips punctuation", () => {
    expect(normalizeName("Johnson, Mike")).toBe("johnson mike");
    expect(normalizeName("M. Johnson")).toBe("m johnson");
  });

  it("strips common generational suffixes", () => {
    expect(normalizeName("Mike Johnson Jr.")).toBe("mike johnson");
    expect(normalizeName("Mike Johnson III")).toBe("mike johnson");
  });

  it("handles empty input", () => {
    expect(normalizeName("")).toBe("");
  });
});

describe("jaroWinkler — exact + near-exact", () => {
  it("returns 1 for identical strings", () => {
    expect(jaroWinkler("Mike Johnson", "Mike Johnson")).toBe(1);
  });

  it("returns 1 post-normalization for same identity with cosmetics", () => {
    // Both normalize to 'mike johnson'
    expect(jaroWinkler("Mike Johnson", "  MIKE JOHNSON  ")).toBe(1);
  });

  it("high similarity on single typo", () => {
    const s = jaroWinkler("Mike Johnson", "Mike Jonhson");
    expect(s).toBeGreaterThan(0.9);
    expect(s).toBeLessThan(1);
  });

  it("high similarity on first-initial vs full first name", () => {
    // "M. Johnson" → "m johnson"; "Michael Johnson" → "michael johnson"
    // Short-vs-long common-prefix case
    const s = jaroWinkler("M. Johnson", "Michael Johnson");
    expect(s).toBeGreaterThan(0.7);
  });

  it("rewards matching prefix via Winkler bonus", () => {
    // Same last 6 chars, different first 2 — Winkler boost tiny
    const prefixMatch = jaroWinkler("Mike J", "Mike Jonhson");
    // Different prefix shouldn't get the bonus
    const noPrefix = jaroWinkler("Mike Jn", "Jake Jonhson");
    expect(prefixMatch).toBeGreaterThan(noPrefix);
  });
});

describe("jaroWinkler — comma-vs-space order swap", () => {
  it("'Johnson, Mike' vs 'Mike Johnson' scores high after normalization", () => {
    // Both normalize to strings with the same characters, different order —
    // Jaro handles transpositions
    const s = jaroWinkler("Johnson, Mike", "Mike Johnson");
    expect(s).toBeGreaterThan(0.6);
  });
});

describe("jaroWinkler — dissimilar strings", () => {
  it("low score on completely different names", () => {
    // Short strings with any character overlap get ~0.5 base from Jaro —
    // that's expected behavior. The threshold for 'clearly dissimilar' is
    // around 0.65 in practice.
    const s = jaroWinkler("Amy Chen", "Tom Wilson");
    expect(s).toBeLessThan(0.65);
  });

  it("0 on empty string either side", () => {
    expect(jaroWinkler("", "Mike Johnson")).toBe(0);
    expect(jaroWinkler("Mike Johnson", "")).toBe(0);
  });
});

describe("jaroWinkler — boundary cases", () => {
  it("single-character match", () => {
    expect(jaroWinkler("a", "a")).toBe(1);
  });

  it("single-character mismatch", () => {
    expect(jaroWinkler("a", "b")).toBe(0);
  });

  it("does not exceed 1.0", () => {
    const s = jaroWinkler("Mike Johnson", "Mike Johnson");
    expect(s).toBeLessThanOrEqual(1);
  });

  it("does not go below 0.0", () => {
    const s = jaroWinkler("aaaa", "bbbb");
    expect(s).toBeGreaterThanOrEqual(0);
  });
});

describe("bestRosterMatch", () => {
  const roster = [
    "Mike Johnson",
    "Tom Wilson",
    "Amy Chen",
    "Jose Ramirez",
  ];

  it("exact match returns 1", () => {
    expect(bestRosterMatch("Tom Wilson", roster)).toBe(1);
  });

  it("finds best fuzzy match across roster", () => {
    // 'Thom Wilson' should be closest to 'Tom Wilson'
    const s = bestRosterMatch("Thom Wilson", roster);
    expect(s).toBeGreaterThan(0.9);
  });

  it("returns 0 on empty needle", () => {
    expect(bestRosterMatch("", roster)).toBe(0);
    expect(bestRosterMatch(null, roster)).toBe(0);
  });

  it("returns 0 on empty roster", () => {
    expect(bestRosterMatch("Mike Johnson", [])).toBe(0);
  });

  it("case + punctuation insensitive via normalize", () => {
    expect(bestRosterMatch("MIKE JOHNSON", roster)).toBe(1);
    expect(bestRosterMatch("mike johnson", roster)).toBe(1);
    expect(bestRosterMatch("Johnson, Mike", roster)).toBeGreaterThan(0.6);
  });
});
