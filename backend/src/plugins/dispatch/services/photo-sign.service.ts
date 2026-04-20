/**
 * Photo URL wrapper — routes raw photo URLs through the SSRF-safe proxy.
 *
 * Original intent was V4-signed GCS URLs, but the existing
 * /api/v1/verification/photos/proxy route already handles GCS + JotForm +
 * PropX with an allowlist, and browsers <img src> can hit it directly
 * (same origin, no auth header needed). Routing through the proxy is a
 * strictly-better choice: no service-account signing dependency, one code
 * path for all photo sources, and the allowlist is already well-tested.
 *
 * File name kept as `photo-sign.service` to avoid rename churn — the
 * public symbol is what callers import.
 */

const PROXY_PATH = "/api/v1/verification/photos/proxy";

const ALLOWED_HOST_PREFIXES = [
  "https://storage.googleapis.com/esexpress-weight-tickets/",
  "https://hairpintrucking.jotform.com/",
  "https://www.jotform.com/",
  "https://files.propx.com/",
];

function wrapIfAllowed(url: string | null): string | null {
  if (!url) return null;
  const allowed = ALLOWED_HOST_PREFIXES.some((p) => url.startsWith(p));
  if (!allowed) return url;
  return `${PROXY_PATH}?url=${encodeURIComponent(url)}`;
}

export async function signPhotoUrls<T extends { photoThumbUrl: string | null }>(
  rows: T[],
): Promise<T[]> {
  return rows.map((r) => ({ ...r, photoThumbUrl: wrapIfAllowed(r.photoThumbUrl) }));
}
