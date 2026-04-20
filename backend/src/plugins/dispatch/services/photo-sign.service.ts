import { Storage } from "@google-cloud/storage";

// Photos in the esexpress-weight-tickets bucket are private (org policy
// blocks making the bucket public). The workbench renders thumbnails via
// plain <img src>, so we need the URL to be directly fetchable by the
// browser. Signed V4 URLs solve this: the bucket stays private, but the
// URL carries a short-lived signature (1h TTL) that GCS honors without
// auth headers.
//
// getSignedUrl() is a pure-local operation against the service-account
// private key — no RPC — so signing ~2000 URLs per workbench list is
// effectively free in wall time. If signing fails we return the raw URL;
// the browser will render a broken image (same as pre-fix), no crash.

let storage: Storage | null = null;

const GCS_BUCKET_PREFIX = "https://storage.googleapis.com/esexpress-weight-tickets/";

function getStorage(): Storage {
  if (storage) return storage;

  const keyJson = process.env.GCS_SERVICE_ACCOUNT_KEY;
  if (keyJson) {
    const decoded = keyJson.trimStart().startsWith("{")
      ? keyJson
      : Buffer.from(keyJson, "base64").toString();
    storage = new Storage({ credentials: JSON.parse(decoded) });
  } else {
    storage = new Storage();
  }
  return storage;
}

export async function signPhotoUrlIfGcs(
  url: string | null,
): Promise<string | null> {
  if (!url) return null;
  if (!url.startsWith(GCS_BUCKET_PREFIX)) return url;

  const objectPath = url.slice(GCS_BUCKET_PREFIX.length);
  try {
    const [signedUrl] = await getStorage()
      .bucket("esexpress-weight-tickets")
      .file(objectPath)
      .getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 60 * 60 * 1000,
      });
    return signedUrl;
  } catch {
    return url;
  }
}

export async function signPhotoUrls<T extends { photoThumbUrl: string | null }>(
  rows: T[],
): Promise<T[]> {
  return Promise.all(
    rows.map(async (r) => ({
      ...r,
      photoThumbUrl: await signPhotoUrlIfGcs(r.photoThumbUrl),
    })),
  );
}
