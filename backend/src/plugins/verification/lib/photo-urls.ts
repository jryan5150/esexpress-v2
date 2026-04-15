/**
 * JotForm photo URL resolver.
 *
 * Single source of truth for turning stored JotForm photo URLs (jotform_imports.photo_url,
 * jotform_imports.image_urls) into frontend-usable URLs. Every surface that displays
 * JotForm ticket photos (BOL queue, dispatch desk, future surfaces) MUST call this
 * helper so the storage/transport strategy can't drift between callers.
 *
 * Strategy: route all JotForm URLs through the SSRF-safe /photos/proxy endpoint.
 * The proxy enforces the allowlist (photo.service.ts ALLOWED_PHOTO_HOSTS) and
 * handles content-type + caching. Callers never embed raw JotForm URLs in
 * responses — that would expose JotForm hostnames to clients and bypass the
 * allowlist guarantee.
 *
 * If the storage backend changes (e.g. Jetson uploads to S3, historical migration
 * to GCS), update this one function. Tests in photo-urls.test.ts lock the contract.
 */

import { isAllowedPhotoHost } from "../services/photo.service.js";

const PROXY_PATH = "/api/v1/verification/photos/proxy";

/**
 * Turn stored JotForm photo URLs into proxy URLs the frontend can render via
 * a plain `<img src>`.
 *
 * - Dedupes across `photoUrl` + `imageUrls`.
 * - Filters out anything that isn't on the allowlist (defense in depth — the
 *   proxy would reject it too, but we don't want dead URLs in the response).
 * - Returns `[]` when no photo is stored — callers render the "no photo" icon.
 */
export function resolveJotformPhotoUrls(
  photoUrl: string | null | undefined,
  imageUrls: string[] | null | undefined,
): string[] {
  const all: string[] = [];
  if (photoUrl) all.push(photoUrl);
  if (imageUrls && imageUrls.length > 0) all.push(...imageUrls);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of all) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (!isAllowedPhotoHost(url)) continue;
    out.push(`${PROXY_PATH}?url=${encodeURIComponent(url)}`);
  }
  return out;
}
