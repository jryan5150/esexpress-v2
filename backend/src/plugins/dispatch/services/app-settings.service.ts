/**
 * App settings (feature flags) backed by the `app_settings` table.
 *
 * Main use case as of 2026-04-22: make PCS_DISPATCH_ENABLED flippable
 * via admin UI without requiring a Railway env-var change. The env var
 * remains the bootstrap fallback — if the DB has no row, env wins.
 *
 * Pattern:
 *   DB value (explicit) → env var (bootstrap) → default
 *
 * Short in-memory cache (10s TTL) avoids hammering the DB on per-request
 * hot paths like dispatchLoad. Cache flushes on setAppSetting().
 */

import { eq } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import { appSettings } from "../../../db/schema.js";

interface CachedEntry {
  value: string | null;
  fetchedAt: number;
}

const CACHE_TTL_MS = 10_000;
const cache = new Map<string, CachedEntry>();

function cacheGet(key: string): string | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cachePut(key: string, value: string | null): void {
  cache.set(key, { value, fetchedAt: Date.now() });
}

export async function getAppSetting(
  db: Database,
  key: string,
  envFallback?: string,
): Promise<string | null> {
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  const rows = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);

  if (rows.length === 0) {
    const fromEnv = envFallback ? (process.env[envFallback] ?? null) : null;
    cachePut(key, fromEnv);
    return fromEnv;
  }

  const value = rows[0].value;
  cachePut(key, value);
  return value;
}

export async function getBooleanSetting(
  db: Database,
  key: string,
  envFallback?: string,
): Promise<boolean> {
  const raw = await getAppSetting(db, key, envFallback);
  if (raw == null) return false;
  return raw === "true" || raw === "1";
}

export async function setAppSetting(
  db: Database,
  key: string,
  value: string | null,
  userId: number | null,
): Promise<void> {
  await db
    .insert(appSettings)
    .values({
      key,
      value,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value,
        updatedBy: userId,
        updatedAt: new Date(),
      },
    });
  cache.delete(key);
}

/**
 * PCS push flag lookup by company letter. Wraps the two per-company
 * boolean settings with a fallback chain that matches the Thursday
 * 2026-04-23 migration:
 *
 *   A (Hairpin test):     pcs_dispatch_enabled_hairpin   → false
 *   B (ES Express prod):  pcs_dispatch_enabled_esexpress → legacy
 *                         pcs_dispatch_enabled → env PCS_DISPATCH_ENABLED
 *                         → false
 *
 * Callers pass the company letter of the division they intend to push
 * to; this helper picks the right flag. Defaults to "B" so any legacy
 * path that doesn't yet pass a company stays bound to the ES Express
 * production flag (safe default — prod stays gated).
 */
export async function getPcsDispatchEnabled(
  db: Database,
  company: "A" | "B" = "B",
): Promise<boolean> {
  if (company === "A") {
    return getBooleanSetting(db, "pcs_dispatch_enabled_hairpin");
  }
  // B: prefer per-company flag, fall back to legacy singular flag, then env.
  const perCompany = await getAppSetting(db, "pcs_dispatch_enabled_esexpress");
  if (perCompany != null) return perCompany === "true" || perCompany === "1";
  return getBooleanSetting(db, "pcs_dispatch_enabled", "PCS_DISPATCH_ENABLED");
}

export async function listAppSettings(db: Database): Promise<
  Array<{
    key: string;
    value: string | null;
    description: string | null;
    updatedBy: number | null;
    updatedAt: Date;
  }>
> {
  return db
    .select({
      key: appSettings.key,
      value: appSettings.value,
      description: appSettings.description,
      updatedBy: appSettings.updatedBy,
      updatedAt: appSettings.updatedAt,
    })
    .from(appSettings);
}
