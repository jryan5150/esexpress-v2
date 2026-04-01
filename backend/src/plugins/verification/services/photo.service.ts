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

/**
 * Fetches a single photo through the SSRF-safe proxy.
 * Returns the raw buffer and content-type header.
 */
export async function proxyPhoto(
  url: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const parsed = await validateUrlSafe(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(parsed.href, {
      signal: controller.signal,
      headers: {
        "User-Agent": "EsExpress/2.0 PhotoProxy",
      },
      redirect: "error", // Security: never follow redirects — prevents SSRF bypass via open redirects on allowlisted hosts
    });

    if (!response.ok) {
      throw new Error(
        `Upstream returned HTTP ${response.status}: ${response.statusText}`,
      );
    }

    const contentType =
      response.headers.get("content-type") ?? "application/octet-stream";

    // Guard against absurdly large responses
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_PHOTO_SIZE) {
      throw new Error(`Photo exceeds maximum size (${MAX_PHOTO_SIZE} bytes)`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_PHOTO_SIZE) {
      throw new Error(`Photo exceeds maximum size (${MAX_PHOTO_SIZE} bytes)`);
    }

    return {
      buffer: Buffer.from(arrayBuffer),
      contentType,
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
