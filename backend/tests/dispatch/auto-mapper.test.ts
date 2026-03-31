import { describe, it, expect } from 'vitest';
import { classifyTier, type AutoMapResult } from '../../src/plugins/dispatch/services/auto-mapper.service.js';

describe('Auto-Mapper — classifyTier', () => {
  it('classifies propx_job_id match as Tier 1', () => {
    const result = classifyTier({ score: 1.0, matchType: 'propx_job_id' });
    expect(result).toBe(1);
  });
  it('classifies exact_name match as Tier 1', () => {
    const result = classifyTier({ score: 1.0, matchType: 'exact_name' });
    expect(result).toBe(1);
  });
  it('classifies exact_alias match as Tier 1', () => {
    const result = classifyTier({ score: 1.0, matchType: 'exact_alias' });
    expect(result).toBe(1);
  });
  it('classifies fuzzy match with score > 0.85 as Tier 2 high confidence', () => {
    const result = classifyTier({ score: 0.9, matchType: 'fuzzy_name' });
    expect(result).toBe(2);
  });
  it('classifies fuzzy match with score 0.5-0.85 as Tier 2 lower confidence', () => {
    const result = classifyTier({ score: 0.65, matchType: 'fuzzy_name' });
    expect(result).toBe(2);
  });
  it('classifies no match as Tier 3', () => {
    const result = classifyTier({ score: 0, matchType: 'unresolved' });
    expect(result).toBe(3);
  });
});

describe('Auto-Mapper — processLoadBatch', () => {
  it('exports processLoadBatch function', async () => {
    const mod = await import('../../src/plugins/dispatch/services/auto-mapper.service.js');
    expect(typeof mod.processLoadBatch).toBe('function');
  });
});
