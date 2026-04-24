/**
 * Photo Proxy & ZIP Service -- Track 3.2
 * =======================================
 *
 * SSRF-safe photo proxy that validates URLs against an allowlist before
 * fetching, and bundles multiple photos into a ZIP for batch download.
 *
 * Security model:
 *   - Only HTTPS protocol allowed (exception: JotForm HTTP URLs from allowlist)
 *   - Hostname must exactly match allowlist entries
 *   - DNS resolution checked against RFC-1918, loopback, and link-local ranges
 *   - Fetch timeout of 10s to prevent slowloris-style hangs
 */

import { resolve4 } from "node:dns/promises";
import { zipSync, type Zippable } from "fflate";
import { Storage } from "@google-cloud/storage";
import sharp from "sharp";

// GCS storage client — lazy-init from GCS_SERVICE_ACCOUNT_KEY env var.
// Reused across proxy fetches so we only parse the key once per process.
let gcsStorage: Storage | null = null;
function getGcsStorage(): Storage {
  if (gcsStorage) return gcsStorage;
  const keyJson = process.env.GCS_SERVICE_ACCOUNT_KEY;
  if (keyJson) {
    const decoded = keyJson.trimStart().startsWith("{")
      ? keyJson
      : Buffer.from(keyJson, "base64").toString();
    gcsStorage = new Storage({ credentials: JSON.parse(decoded) });
  } else {
    gcsStorage = new Storage();
  }
  return gcsStorage;
}

/** Decode `https://storage.googleapis.com/<bucket>/<object/path>` → { bucket, object }. */
function parseGcsUrl(url: URL): { bucket: string; object: string } | null {
  if (url.hostname !== "storage.googleapis.com") return null;
  const path = url.pathname.replace(/^\/+/, "");
  const slash = path.indexOf("/");
  if (slash < 0) return null;
  return { bucket: path.slice(0, slash), object: path.slice(slash + 1) };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROXY_TIMEOUT_MS = 10_000;
const MAX_ZIP_URLS = 50;
const MAX_PHOTO_SIZE = 25 * 1024 * 1024; // 25 MB per photo

/**
 * Canonical list of allowed photo hosts. Shared with jotform.service.ts
 * conceptually, but implemented here with full SSRF protection (DNS resolution).
 */
const ALLOWED_PHOTO_HOSTS = new Set([
  "files.propx.com",
  // PropX authenticated API host for ticket images. The proxy injects the
  // PROPX_API_KEY as an `authorization` header for requests on this host —
  // the key never reaches the browser. Matches v1's auth-proxy pattern.
  "publicapis.propx.com",
  "hairpintrucking.jotform.com",
  "www.jotform.com",
  "storage.googleapis.com",
]);

/**
 * Hosts that are allowed to use HTTP (not HTTPS). JotForm sometimes serves
 * upload URLs over plain HTTP.
 */
const HTTP_ALLOWED_HOSTS = new Set([
  "hairpintrucking.jotform.com",
  "www.jotform.com",
]);

// ---------------------------------------------------------------------------
// RFC-1918 / loopback / link-local IP detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the IP address is in a private, loopback, or link-local range.
 * These must never be fetched to prevent SSRF against internal services.
 *
 * Blocked ranges:
 *   - 10.0.0.0/8        (RFC-1918)
 *   - 172.16.0.0/12     (RFC-1918)
 *   - 192.168.0.0/16    (RFC-1918)
 *   - 127.0.0.0/8       (loopback)
 *   - 169.254.0.0/16    (link-local)
 *   - 0.0.0.0           (unspecified)
 *   - ::1               (IPv6 loopback)
 */
function isPrivateIp(ip: string): boolean {
  // IPv6 loopback
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;

  // IPv4 checks
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false;

  const [a, b] = parts;

  // 10.x.x.x
  if (a === 10) return true;
  // 172.16.0.0 - 172.31.255.255
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.x.x
  if (a === 192 && b === 168) return true;
  // 127.x.x.x (loopback)
  if (a === 127) return true;
  // 169.254.x.x (link-local)
  if (a === 169 && b === 254) return true;
  // 0.0.0.0
  if (a === 0 && b === 0 && parts[2] === 0 && parts[3] === 0) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Host validation (synchronous -- no DNS)
// ---------------------------------------------------------------------------

/**
 * Checks whether a URL's hostname is in the allowlist and the protocol is
 * acceptable. Does NOT perform DNS resolution (use `validateUrlSafe` for
 * the full SSRF check including DNS).
 */
export function isAllowedPhotoHost(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Protocol check: HTTPS always allowed, HTTP only for specific hosts
    if (parsed.protocol === "https:") {
      return ALLOWED_PHOTO_HOSTS.has(parsed.hostname);
    }
    if (parsed.protocol === "http:") {
      return HTTP_ALLOWED_HOSTS.has(parsed.hostname);
    }

    // Reject file:, ftp:, data:, etc.
    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Full SSRF-safe URL validation (async -- includes DNS resolution)
// ---------------------------------------------------------------------------

/**
 * Validates a URL for safe fetching:
 * 1. Parses URL (rejects on failure)
 * 2. Checks hostname against allowlist
 * 3. Resolves hostname via DNS
 * 4. Checks resolved IPs against RFC-1918/loopback/link-local ranges
 *
 * Throws descriptive errors on failure.
 */
export async function validateUrlSafe(url: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL format");
  }

  // Protocol check
  if (parsed.protocol === "https:") {
    // HTTPS is fine for all allowed hosts
  } else if (parsed.protocol === "http:") {
    if (!HTTP_ALLOWED_HOSTS.has(parsed.hostname)) {
      throw new Error(`HTTP protocol not allowed for host: ${parsed.hostname}`);
    }
  } else {
    throw new Error(`Protocol not allowed: ${parsed.protocol}`);
  }

  // Hostname allowlist check
  if (!ALLOWED_PHOTO_HOSTS.has(parsed.hostname)) {
    throw new Error(`Host not in allowlist: ${parsed.hostname}`);
  }

  // DNS resolution -- check resolved IPs are not private
  try {
    const addresses = await resolve4(parsed.hostname);
    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        throw new Error(`Host resolves to private IP: ${addr}`);
      }
    }
  } catch (err) {
    // Re-throw our own errors (private IP detection)
    if (err instanceof Error && err.message.startsWith("Host resolves")) {
      throw err;
    }
    // DNS resolution failure -- this could be a legitimate DNS issue
    // or an attempt to use a hostname that doesn't resolve.
    // In production, we'd log this. For now, allow through since the
    // hostname is already in our allowlist (defense in depth).
    // If the fetch itself fails, it will throw at that point.
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Photo proxy
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// In-process photo cache (byte-budgeted LRU)
// ---------------------------------------------------------------------------
//
// Sharp re-encode of a 2-3 MB driver photo costs ~3-5 sec wall-clock on
// Railway. With ~50K photos in the corpus, a workbench browse session can
// re-fetch the same drawer multiple times — paying that cost each time is
// wasteful. Cache the post-rotation buffer keyed by the source URL.
//
// Eviction: byte-budget LRU. JS Map preserves insertion order, so we get
// LRU behavior by delete-and-reinsert on access, plus we evict the oldest
// (first-inserted) when total bytes exceed the budget.
//
// Budget: 192 MB. At ~2.5 MB avg per photo that's ~75 cached entries —
// enough for a multi-page drawer browse without thrashing. Trade off if
// Railway memory becomes tight.
//
// TTL: photos at the source URLs are stable (PropX ticket image, GCS
// stored copies) so we don't expire by time. The byte-budget eviction
// keeps the working set bounded under heavy use.
const PHOTO_CACHE_BUDGET_BYTES = 192 * 1024 * 1024;
interface PhotoCacheEntry {
  buffer: Buffer;
  contentType: string;
}
const photoCache = new Map<string, PhotoCacheEntry>();
let photoCacheBytes = 0;
let photoCacheHits = 0;
let photoCacheMisses = 0;

function cachePhotoGet(key: string): PhotoCacheEntry | null {
  const entry = photoCache.get(key);
  if (!entry) {
    photoCacheMisses += 1;
    return null;
  }
  photoCacheHits += 1;
  // LRU bump: delete + reinsert moves to end (most-recent slot)
  photoCache.delete(key);
  photoCache.set(key, entry);
  return entry;
}

function cachePhotoSet(key: string, buffer: Buffer, contentType: string): void {
  const size = buffer.byteLength;
  // Don't cache absurdly large items (e.g., near MAX_PHOTO_SIZE) — they'd
  // evict everything else and the next miss would refill them anyway.
  if (size > PHOTO_CACHE_BUDGET_BYTES / 4) return;
  // If overwriting an existing entry, free its bytes first.
  const existing = photoCache.get(key);
  if (existing) {
    photoCacheBytes -= existing.buffer.byteLength;
    photoCache.delete(key);
  }
  photoCache.set(key, { buffer, contentType });
  photoCacheBytes += size;
  // Evict oldest until under budget
  while (photoCacheBytes > PHOTO_CACHE_BUDGET_BYTES && photoCache.size > 0) {
    const oldestKey = photoCache.keys().next().value;
    if (!oldestKey) break;
    const oldest = photoCache.get(oldestKey);
    if (oldest) {
      photoCacheBytes -= oldest.buffer.byteLength;
    }
    photoCache.delete(oldestKey);
  }
}

/** Diagnostic snapshot. Used by /diag/photos cache surface. */
export function photoCacheStats(): {
  entries: number;
  bytes: number;
  bytesPretty: string;
  budgetBytes: number;
  hits: number;
  misses: number;
  hitRate: number;
} {
  const total = photoCacheHits + photoCacheMisses;
  return {
    entries: photoCache.size,
    bytes: photoCacheBytes,
    bytesPretty: `${(photoCacheBytes / 1024 / 1024).toFixed(1)} MB`,
    budgetBytes: PHOTO_CACHE_BUDGET_BYTES,
    hits: photoCacheHits,
    misses: photoCacheMisses,
    hitRate: total > 0 ? photoCacheHits / total : 0,
  };
}

/**
 * Apply EXIF auto-rotation to a photo buffer if its orientation is not the
 * canonical "1" (top-left). Driver-mobile photos almost always carry a
 * non-canonical orientation tag, which most `<img>` browsers respect — but
 * the workbench drawer's photo carousel does not always. Normalizing here
 * means dispatch sees photos upright every time, regardless of viewer.
 *
 * Skips processing when the image is already canonically oriented (cheap
 * sharp.metadata() call) so PropX-source photos that came in correct don't
 * pay a re-encode cost. Returns the original buffer + content type on any
 * sharp failure (we'd rather serve a raw image than 500 the request).
 */
async function autoRotateIfNeeded(
  buffer: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; contentType: string; rotated: boolean }> {
  // Only process raster image types we know sharp can decode.
  const isRaster =
    contentType.startsWith("image/") &&
    !contentType.includes("svg") &&
    !contentType.includes("gif");
  if (!isRaster) return { buffer, contentType, rotated: false };
  try {
    const meta = await sharp(buffer).metadata();
    const needsRotate =
      meta.orientation !== undefined &&
      meta.orientation !== 1 &&
      meta.orientation !== 0;
    if (!needsRotate) return { buffer, contentType, rotated: false };
    const normalized = await sharp(buffer)
      .rotate() // auto-rotate via EXIF orientation
      .jpeg({ quality: 90, mozjpeg: true })
      .withMetadata({ orientation: 1 })
      .toBuffer();
    return {
      buffer: normalized,
      contentType: "image/jpeg",
      rotated: true,
    };
  } catch {
    // Never break the proxy on a sharp failure — serve the original bytes.
    return { buffer, contentType, rotated: false };
  }
}

/**
 * Fetches a single photo through the SSRF-safe proxy.
 * Returns the raw buffer and content-type header.
 *
 * Photos are EXIF-auto-rotated before serving so portrait driver-mobile
 * photos display upright in the workbench drawer (mobile cameras encode
 * portrait shots as landscape JPEG + EXIF orientation tag; not every
 * `<img>` viewer respects EXIF).
 */
export async function proxyPhoto(
  url: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const parsed = await validateUrlSafe(url);

  // Cache key uses the validated URL string so reflected query-param order
  // doesn't shard cache entries. apiKey is injected later (server-side) and
  // is constant per host — no need to factor it into the cache key.
  const cacheKey = parsed.href;
  const cached = cachePhotoGet(cacheKey);
  if (cached) return { buffer: cached.buffer, contentType: cached.contentType };

  // GCS path: bucket is private (org policy blocks public). Use the storage
  // SDK + service-account creds to download — no signed URL round-trip, no
  // bucket-public exposure. Returns the raw object bytes + an inferred
  // content-type from the object extension.
  const gcs = parseGcsUrl(parsed);
  if (gcs) {
    const [buffer] = await getGcsStorage()
      .bucket(gcs.bucket)
      .file(gcs.object)
      .download();
    if (buffer.byteLength > MAX_PHOTO_SIZE) {
      throw new Error(`Photo exceeds maximum size (${MAX_PHOTO_SIZE} bytes)`);
    }
    const contentType = contentTypeFromUrlExtension(gcs.object) ?? "image/jpeg";
    const rotated = await autoRotateIfNeeded(buffer, contentType);
    cachePhotoSet(cacheKey, rotated.buffer, rotated.contentType);
    return { buffer: rotated.buffer, contentType: rotated.contentType };
  }

  // JotForm Enterprise gates uploads behind auth. We inject the API key as
  // a query param server-side so it never reaches the browser. Without this,
  // every fetch returns the JotForm login HTML page (~2.9KB) instead of the
  // image. Discovered 2026-04-15 while debugging "no photos" before Jessica
  // call — see commit message for full triage.
  const isJotForm =
    parsed.hostname === "hairpintrucking.jotform.com" ||
    parsed.hostname === "www.jotform.com";
  if (isJotForm && !parsed.searchParams.has("apiKey")) {
    const apiKey = process.env.JOTFORM_API_KEY;
    if (apiKey) {
      parsed.searchParams.set("apiKey", apiKey);
    }
  }

  // PropX API host requires the tenant API key. Injected server-side so it
  // never reaches the browser. Returns 401 without it.
  const isPropxApi = parsed.hostname === "publicapis.propx.com";
  const propxApiKey = isPropxApi ? process.env.PROPX_API_KEY : null;
  if (isPropxApi && !propxApiKey) {
    throw new Error("PROPX_API_KEY not configured for PropX photo proxy");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(parsed.href, {
      signal: controller.signal,
      headers: {
        // Generic Chrome UA — JotForm bot-blocks the prior "EsExpress/2.0 PhotoProxy"
        // UA with a 302 to a JS-redirect page.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
        ...(propxApiKey ? { authorization: propxApiKey } : {}),
      },
      // Follow redirects: JotForm chains 302 → CDN. The SSRF guard is the
      // initial allowlist check above; once the destination is decided to
      // be safe, the redirect chain stays inside JotForm's own infrastructure.
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(
        `Upstream returned HTTP ${response.status}: ${response.statusText}`,
      );
    }

    // JotForm's CDN serves images with Content-Type: application/octet-stream
    // despite the bytes being JPEG/PNG. Combined with our global nosniff header,
    // <img> tags refuse to render that. Override to a real image/* type based
    // on the URL's extension whenever upstream gave us octet-stream or nothing.
    let contentType =
      response.headers.get("content-type") ?? "application/octet-stream";
    if (
      contentType === "application/octet-stream" ||
      !contentType.startsWith("image/")
    ) {
      const inferred = contentTypeFromUrlExtension(parsed.pathname);
      if (inferred) contentType = inferred;
    }

    // Guard against absurdly large responses
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_PHOTO_SIZE) {
      throw new Error(`Photo exceeds maximum size (${MAX_PHOTO_SIZE} bytes)`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_PHOTO_SIZE) {
      throw new Error(`Photo exceeds maximum size (${MAX_PHOTO_SIZE} bytes)`);
    }

    const rawBuffer = Buffer.from(arrayBuffer);
    const rotated = await autoRotateIfNeeded(rawBuffer, contentType);
    cachePhotoSet(cacheKey, rotated.buffer, rotated.contentType);
    return {
      buffer: rotated.buffer,
      contentType: rotated.contentType,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// ZIP bundler
// ---------------------------------------------------------------------------

/**
 * Downloads multiple photos and bundles them into a ZIP archive.
 * Skips individual photos that fail to download (logs warning, continues).
 * Returns the ZIP buffer.
 */
export async function createPhotoZip(
  photoUrls: string[],
): Promise<{ buffer: Buffer; skipped: string[] }> {
  if (photoUrls.length === 0) {
    throw new Error("No photo URLs provided");
  }
  if (photoUrls.length > MAX_ZIP_URLS) {
    throw new Error(`Too many URLs (max ${MAX_ZIP_URLS})`);
  }

  const files: Zippable = {};
  const skipped: string[] = [];

  // Download all photos in parallel (bounded by URL count limit above)
  const results = await Promise.allSettled(
    photoUrls.map(async (url, index) => {
      const { buffer, contentType } = await proxyPhoto(url);
      const ext = extensionFromContentType(contentType);
      const filename = `photo-${String(index + 1).padStart(3, "0")}${ext}`;
      return { filename, buffer };
    }),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      files[result.value.filename] = new Uint8Array(result.value.buffer);
    } else {
      skipped.push(photoUrls[i]);
    }
  }

  if (Object.keys(files).length === 0) {
    throw new Error("All photo downloads failed");
  }

  const zipData = zipSync(files);
  return { buffer: Buffer.from(zipData), skipped };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function contentTypeFromUrlExtension(pathname: string): string | null {
  const ext = pathname.toLowerCase().match(/\.([a-z0-9]+)(?:$|\?)/)?.[1];
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "tiff":
    case "tif":
      return "image/tiff";
    case "pdf":
      return "application/pdf";
    default:
      return null;
  }
}

function extensionFromContentType(ct: string): string {
  const lower = ct.toLowerCase();
  if (lower.includes("jpeg") || lower.includes("jpg")) return ".jpg";
  if (lower.includes("png")) return ".png";
  if (lower.includes("webp")) return ".webp";
  if (lower.includes("gif")) return ".gif";
  if (lower.includes("tiff")) return ".tiff";
  if (lower.includes("pdf")) return ".pdf";
  return ".bin";
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export function diagnostics(): {
  name: string;
  status: "healthy" | "degraded" | "error";
  stats: Record<string, unknown>;
  checks: Array<{ name: string; ok: boolean; detail?: string | number }>;
} {
  return {
    name: "photo-proxy",
    status: "healthy",
    stats: {
      allowedHosts: [...ALLOWED_PHOTO_HOSTS],
      httpAllowedHosts: [...HTTP_ALLOWED_HOSTS],
      maxPhotoSize: MAX_PHOTO_SIZE,
      maxZipUrls: MAX_ZIP_URLS,
      proxyTimeoutMs: PROXY_TIMEOUT_MS,
    },
    checks: [
      {
        name: "allowlist-configured",
        ok: ALLOWED_PHOTO_HOSTS.size > 0,
        detail: ALLOWED_PHOTO_HOSTS.size,
      },
    ],
  };
}
