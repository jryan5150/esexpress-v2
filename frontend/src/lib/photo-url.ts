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
 * 2026-04-24 EVENING ROLLBACK: routing absolute URLs through the proxy
 * was saturating the backend on Validate page (50 row thumbnails × 1.4MB
 * × 1.8s sharp re-encode) — the page was hanging visibly because of the
 * thumbnail thundering herd, not because of any logic bug. Reverted to
 * direct CDN fetch for absolute URLs. EXIF rotation only applies for
 * URLs explicitly routed through the proxy by the caller (e.g. PCS push
 * normalize step). Browser-side EXIF-aware display follows for
 * upright-stored photos; sideways photos remain a follow-up where we
 * either resize-on-proxy or pre-rotate at ingest time.
 */
export function resolvePhotoUrl(url: string | null | undefined): string {
  if (!url) return "";

  // Relative path — backend route, prefix with API base.
  if (url.startsWith("/")) return `${API_BASE}${url}`;

  // Absolute URL — return as-is (browser fetches directly from CDN).
  // Bypasses the backend proxy; faster + scalable for thumbnail rendering.
  return url;
}
