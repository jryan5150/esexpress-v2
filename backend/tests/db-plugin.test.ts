import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Database Plugin', () => {
  let savedUrl: string | undefined;

  afterEach(() => {
    // Restore DATABASE_URL to whatever the setup file set
    if (savedUrl !== undefined) {
      process.env.DATABASE_URL = savedUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it('app.db is available when DATABASE_URL is set', async () => {
    savedUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/esexpress_test';
    const app = buildApp({ logger: false });
    await app.ready();
    expect(app.db).toBeDefined();
    await app.close();
  });

  it('throws when DATABASE_URL is not set', async () => {
    savedUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const app = buildApp({ logger: false });
    await expect(app.ready()).rejects.toThrow('DATABASE_URL is required');
    await app.close();
  });

  it('db decorator exposes drizzle query interface', async () => {
    savedUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/esexpress_test';
    const app = buildApp({ logger: false });
    await app.ready();
    // Verify db has drizzle query methods
    expect(typeof app.db.select).toBe('function');
    expect(typeof app.db.insert).toBe('function');
    expect(typeof app.db.update).toBe('function');
    expect(typeof app.db.delete).toBe('function');
    await app.close();
  });
});
