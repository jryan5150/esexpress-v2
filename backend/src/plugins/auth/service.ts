/**
 * Password hashing — native `bcrypt` in production, pure-JS `bcryptjs`
 * fallback when `BCRYPT_USE_JS=1` is set. The JS implementation produces
 * output hash-compatible with the C++ build, so switching paths never
 * invalidates existing stored hashes.
 *
 * Why the fallback exists: `bcrypt@5.1.1`'s prebuilt binaries don't cover
 * every Node major. Local dev on Node 24 hits ABI mismatch; Railway
 * prod builds against the bcrypt prebuild that matches its Node version.
 * Rather than force every contributor to install native toolchains, the
 * flag lets local dev use the JS path with zero behavior difference.
 *
 * Production intentionally leaves the flag unset so the native (faster)
 * implementation is used.
 */

// Dynamic loader — chosen at module-load time, not per-call. Both libraries
// expose the same hash/compare signatures so the rest of the file stays
// backend-agnostic.
type Bcryptish = {
  hash: (s: string, rounds: number) => Promise<string>;
  compare: (s: string, hash: string) => Promise<boolean>;
};

const bcryptModuleName =
  process.env.BCRYPT_USE_JS === "1" ? "bcryptjs" : "bcrypt";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = (await import(bcryptModuleName)).default as Bcryptish;

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
