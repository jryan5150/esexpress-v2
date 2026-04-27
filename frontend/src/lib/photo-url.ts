/**
 * Centralized photo URL resolver.
 *
 * Why: JotForm CDN URLs (https://www.jotform.com/uploads/...) carry an
 * EXIF orientation tag but no rotated pixels. Most browsers render them
 * sideways. The backend `/verification/photos/proxy` endpoint downloads
 * the bytes via sharp, applies `.rotate()` (auto-EXIF), strips the tag,
 * and re-encodes — so a photo that displays sideways via direct CDN
 * fetch displays upright when proxied.
 *
 * Routing rule:
 *  - Relative `/api/v1/...` URL → prefix with API base, return as-is
 *    (already going through backend, may already be a proxy URL)
 *  - Absolute https URL → wrap with proxy so EXIF rotation kicks in
 *
 * The proxy validates against an SSRF allowlist (JotForm, PropX, GCS),
 * so passing arbitrary URLs is safe.
 *
 * Shipped 2026-04-24 PM after operator ask: "rotate the matched ones
 * with sideways BOL — when they push to PCS they like them oriented in
 * readable positions". PCS push path already rotates via sharp at upload
 * time (pcs-file.service.ts:200), so this is purely a display fix.
 */

const API_BASE = import.meta.env.VITE_API_URL || "";

/**
 * Photo URL resolver with optional thumbnail-resize parameter.
 *
 * History:
 *  - 2026-04-24 PM: routing every absolute URL through the proxy (full
 *    1.4MB EXIF-rotated re-encodes) saturated the backend. Rolled back.
 *  - 2026-04-24 evening: proxy now supports `?w=200` to resize+rotate
 *    in one sharp pipeline (~30KB output, sub-100ms cold). Thumbnails
 *    pass thumb=true; full-size renders (drawer, lightbox) pass
 *    thumb=false (default), which goes direct to CDN to avoid full-size
 *    re-encode cost on every drawer open.
 *
 * Routing:
 *  - Relative `/api/v1/...` URL → prefix with API base.
 *  - Absolute URL + thumb=true → wrap with proxy + ?w=200 for
 *    EXIF auto-rotation + resize.
 *  - Absolute URL + thumb=false (default) → return as-is (browser
 *    fetches direct from CDN, may show sideways but loads instantly).
 *
 * Saturday TODO: figure out the right strategy for full-size in-app
 * rotation without saturating (pre-rotate at ingest? lazy proxy with
 * hard concurrency cap?).
 */
export function resolvePhotoUrl(
  url: string | null | undefined,
  opts: { thumb?: boolean; auth?: boolean } = {},
): string {
  if (!url) return "";

  // Relative path — backend route, prefix with API base.
  if (url.startsWith("/")) return `${API_BASE}${url}`;

  const isAbsolute = url.startsWith("http://") || url.startsWith("https://");

  // PropX URLs (publicapis.propx.com/...) require an API key as an
  // authorization header. Direct browser fetch returns 401. Always
  // route those through the proxy so the backend injects the key.
  const needsAuth = opts.auth || /publicapis\.propx\.com/.test(url);

  // thumb=true → proxy with resize. auth=true (or PropX) → proxy without resize.
  if (isAbsolute && (opts.thumb || needsAuth)) {
    const w = opts.thumb ? "&w=200" : "";
    return `${API_BASE}/api/v1/verification/photos/proxy?url=${encodeURIComponent(url)}${w}`;
  }

  // Absolute URL → direct CDN fetch (full size, may be sideways).
  return url;
}
