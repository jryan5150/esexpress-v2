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

export function resolvePhotoUrl(url: string | null | undefined): string {
  if (!url) return "";

  // Relative path — already pointed at backend, return prefixed.
  if (url.startsWith("/")) return `${API_BASE}${url}`;

  // Absolute URL — route through proxy for EXIF auto-rotation.
  // Allowlisted hosts only (enforced server-side); everything else 400s.
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return `${API_BASE}/api/v1/verification/photos/proxy?url=${encodeURIComponent(url)}`;
  }

  // Anything else (data: URLs, blob: URLs, etc.) — return verbatim.
  return url;
}
