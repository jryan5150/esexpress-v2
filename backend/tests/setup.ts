// Global test setup — provide a dummy DATABASE_URL so the db plugin
// can boot without a real database. postgres.js is lazy (no connection
// until the first query), so this is safe for unit tests.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/esexpress_test';
}

// JWT_SECRET is required by config.ts (min 32 chars). Needed for any route
// test that builds the full app (auth plugin registers jwt on boot).
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';
}
