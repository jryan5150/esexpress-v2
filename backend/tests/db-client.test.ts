import { describe, it, expect } from 'vitest';
import { createDbClient } from '../src/db/client.js';

describe('Database Client', () => {
  it('exports createDbClient function', () => {
    expect(typeof createDbClient).toBe('function');
  });

  it('returns an object with db and pool properties when given a valid URL', () => {
    // We test the factory shape, not actual connection (no DB in unit tests)
    const client = createDbClient('postgresql://localhost:5432/test');
    expect(client).toHaveProperty('db');
    expect(client).toHaveProperty('pool');
  });
});
