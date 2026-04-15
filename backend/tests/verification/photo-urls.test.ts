/**
 * Contract tests for resolveJotformPhotoUrls.
 *
 * This helper is the single source of truth for JotForm photo URLs returned
 * by the BOL queue, dispatch desk, and any future surface. If these tests
 * pass, the frontend <img> tags will always resolve to the proxy endpoint,
 * which in turn can always fetch the image (allowlist-guarded). If a future
 * change moves storage to GCS or S3, update the helper and these tests — the
 * callers stay unchanged.
 */

import { describe, it, expect } from "vitest";
import { resolveJotformPhotoUrls } from "../../src/plugins/verification/lib/photo-urls.js";

const JOTFORM = "https://hairpintrucking.jotform.com/uploads/abc/weight-1.jpg";
const JOTFORM_2 = "https://www.jotform.com/uploads/xyz/weight-2.jpg";
const GCS = "https://storage.googleapis.com/bucket/photos/123.jpg";
const DISALLOWED = "https://evil.example.com/photo.jpg";

describe("resolveJotformPhotoUrls", () => {
  it("returns [] when no URLs are stored", () => {
    expect(resolveJotformPhotoUrls(null, null)).toEqual([]);
    expect(resolveJotformPhotoUrls(null, [])).toEqual([]);
    expect(resolveJotformPhotoUrls(undefined, undefined)).toEqual([]);
  });

  it("routes a single JotForm URL through the proxy", () => {
    const [url] = resolveJotformPhotoUrls(JOTFORM, null);
    expect(url).toBe(
      `/api/v1/verification/photos/proxy?url=${encodeURIComponent(JOTFORM)}`,
    );
  });

  it("merges photoUrl and imageUrls, deduping identical URLs", () => {
    const result = resolveJotformPhotoUrls(JOTFORM, [JOTFORM, JOTFORM_2]);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain(encodeURIComponent(JOTFORM));
    expect(result[1]).toContain(encodeURIComponent(JOTFORM_2));
  });

  it("accepts all allowlisted hosts (JotForm + GCS)", () => {
    const result = resolveJotformPhotoUrls(null, [JOTFORM, GCS]);
    expect(result).toHaveLength(2);
  });

  it("filters out URLs from disallowed hosts", () => {
    const result = resolveJotformPhotoUrls(DISALLOWED, [JOTFORM, DISALLOWED]);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain(encodeURIComponent(JOTFORM));
  });

  it("URL-encodes query args so special characters survive round-trip", () => {
    const withQuery = "https://hairpintrucking.jotform.com/u?x=a+b&y=c/d";
    const [url] = resolveJotformPhotoUrls(withQuery, null);
    expect(url).toBe(
      `/api/v1/verification/photos/proxy?url=${encodeURIComponent(withQuery)}`,
    );
    expect(decodeURIComponent(url.split("url=")[1])).toBe(withQuery);
  });

  it("skips empty strings in imageUrls", () => {
    const result = resolveJotformPhotoUrls(null, ["", JOTFORM, ""]);
    expect(result).toHaveLength(1);
  });
});
