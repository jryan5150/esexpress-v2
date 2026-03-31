import { describe, it, expect } from 'vitest';

describe('Fuzzy matching — levenshteinDistance', () => {
  it('returns 0 for identical strings', async () => {
    const { levenshteinDistance } = await import('../../src/plugins/dispatch/lib/fuzzy.js');
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });
  it('returns correct distance for similar strings', async () => {
    const { levenshteinDistance } = await import('../../src/plugins/dispatch/lib/fuzzy.js');
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });
  it('handles empty strings', async () => {
    const { levenshteinDistance } = await import('../../src/plugins/dispatch/lib/fuzzy.js');
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });
});

describe('Fuzzy matching — similarityScore', () => {
  it('returns 1.0 for identical strings', async () => {
    const { similarityScore } = await import('../../src/plugins/dispatch/lib/fuzzy.js');
    expect(similarityScore('hello', 'hello')).toBe(1.0);
  });
  it('returns 0.0 for completely different strings', async () => {
    const { similarityScore } = await import('../../src/plugins/dispatch/lib/fuzzy.js');
    expect(similarityScore('abc', 'xyz')).toBe(0.0);
  });
  it('returns score between 0 and 1 for similar strings', async () => {
    const { similarityScore } = await import('../../src/plugins/dispatch/lib/fuzzy.js');
    const score = similarityScore('Wolf Creek Pad A', 'Wolf Creek Pad B');
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1.0);
  });
});

describe('Fuzzy matching — normalizeName', () => {
  it('strips # and No. prefixes', async () => {
    const { normalizeName } = await import('../../src/plugins/dispatch/lib/fuzzy.js');
    expect(normalizeName('Well #42')).toBe('well 42');
    expect(normalizeName('Well No. 42')).toBe('well 42');
  });
  it('collapses whitespace', async () => {
    const { normalizeName } = await import('../../src/plugins/dispatch/lib/fuzzy.js');
    expect(normalizeName('Wolf  Creek   Pad')).toBe('wolf creek pad');
  });
  it('lowercases', async () => {
    const { normalizeName } = await import('../../src/plugins/dispatch/lib/fuzzy.js');
    expect(normalizeName('WOLF CREEK')).toBe('wolf creek');
  });
  it('strips dashes', async () => {
    const { normalizeName } = await import('../../src/plugins/dispatch/lib/fuzzy.js');
    expect(normalizeName('Wolf-Creek')).toBe('wolf creek');
  });
});

describe('Well suggestion — scoreSuggestions', () => {
  it('returns exact match as Tier 1 with score 1.0', async () => {
    const { scoreSuggestions } = await import('../../src/plugins/dispatch/services/suggestion.service.js');
    const wells = [
      { id: 1, name: 'Wolf Creek Pad A', aliases: [], propxJobId: null },
      { id: 2, name: 'Eagle Ford 12', aliases: [], propxJobId: null },
    ];
    const result = scoreSuggestions('Wolf Creek Pad A', null, wells);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].wellId).toBe(1);
    expect(result[0].score).toBe(1.0);
    expect(result[0].tier).toBe(1);
    expect(result[0].matchType).toBe('exact_name');
  });

  it('returns alias match as Tier 1', async () => {
    const { scoreSuggestions } = await import('../../src/plugins/dispatch/services/suggestion.service.js');
    const wells = [
      { id: 1, name: 'Wolf Creek Pad A', aliases: ['wolfcreek a', 'wc pad a'], propxJobId: null },
    ];
    const result = scoreSuggestions('WC Pad A', null, wells);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].wellId).toBe(1);
    expect(result[0].tier).toBe(1);
    expect(result[0].matchType).toBe('exact_alias');
  });

  it('returns fuzzy match as Tier 2 when score > 0.5', async () => {
    const { scoreSuggestions } = await import('../../src/plugins/dispatch/services/suggestion.service.js');
    const wells = [
      { id: 1, name: 'Wolf Creek Pad A', aliases: [], propxJobId: null },
    ];
    const result = scoreSuggestions('Wolf Creek Pad B', null, wells);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].tier).toBe(2);
    expect(result[0].score).toBeGreaterThan(0.5);
  });

  it('returns propx job_id match as Tier 1', async () => {
    const { scoreSuggestions } = await import('../../src/plugins/dispatch/services/suggestion.service.js');
    const wells = [
      { id: 1, name: 'Wolf Creek', aliases: [], propxJobId: 'JOB-123' },
      { id: 2, name: 'Eagle Ford', aliases: [], propxJobId: 'JOB-456' },
    ];
    const result = scoreSuggestions('Some Random Name', 'JOB-123', wells);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].wellId).toBe(1);
    expect(result[0].tier).toBe(1);
    expect(result[0].matchType).toBe('propx_job_id');
  });

  it('returns empty for no match above threshold', async () => {
    const { scoreSuggestions } = await import('../../src/plugins/dispatch/services/suggestion.service.js');
    const wells = [
      { id: 1, name: 'Wolf Creek Pad A', aliases: [], propxJobId: null },
    ];
    const result = scoreSuggestions('Completely Different Location XYZ', null, wells);
    const nonTier3 = result.filter(r => r.tier !== 3);
    expect(nonTier3.length).toBe(0);
  });
});
