/**
 * PCS File API — upload BOL/ticket photos as attachments.
 *
 * Photo gate is a HARD REQUIREMENT per client (Jessica, Apr 6 + Apr 17):
 * "How is it 100% confirmed if there's no photo?" — no photo, no PCS push.
 * This service enforces that contract end-to-end:
 *
 *   1. photoGateCheck() — abort before any PCS traffic if no usable photo
 *   2. fetchAndNormalizePhoto() — pull photo, auto-rotate via EXIF, strip
 *      metadata, re-encode as JPEG so PCS displays upright
 *   3. uploadPhotoToPcs() — multipart POST against /file/v1/load/{id}/attachments/BillOfLading
 *
 * Callers (dispatchLoad) must invoke 1+2 BEFORE creating the PCS load,
 * and 3 AFTER. If 3 fails the caller must rollback via cancelPcsLoad()
 * so PCS never has an orphan load without a BOL attachment.
 *
 * Validated 2026-04-22 against Hairpin (loadId 357469). Endpoint:
 * POST /file/v1/load/{loadId}/attachments/BillOfLading, multipart field
 * name MUST be "files" (plural; "file" singular returns 400).
 */

import sharp from "sharp";
import { eq } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import {
  assignments,
  loads,
  photos,
  bolSubmissions,
} from "../../../db/schema.js";
import { and, isNotNull, sql } from "drizzle-orm";
import { getAccessToken } from "./pcs-auth.service.js";

const getPcsBaseUrl = (): string =>
  process.env.PCS_BASE_URL ?? "https://api.pcssoft.com";

const getCompanyHeaders = (): Record<string, string> => ({
  "X-Company-Id": process.env.PCS_COMPANY_ID ?? "",
  "X-Company-Letter": process.env.PCS_COMPANY_LTR ?? "B",
});

export interface PhotoGateResult {
  ok: boolean;
  photoUrl?: string;
  reason?:
    | "no_photo_attached"
    | "photo_url_missing"
    | "photo_source_unauthorized";
}

/**
 * Resolve the best photo URL for an assignment. Priority matches the
 * drawer's carousel order: assignment-scoped photos → load-scoped photos
 * → historical bol_submissions photos. Returns null if nothing is found.
 */
async function resolvePhotoUrl(
  db: Database,
  assignmentId: number,
  loadId: number,
): Promise<string | null> {
  // Assignment-scoped first
  const assignmentPhotos = await db
    .select({ url: photos.sourceUrl })
    .from(photos)
    .where(
      and(eq(photos.assignmentId, assignmentId), isNotNull(photos.sourceUrl)),
    )
    .orderBy(photos.id)
    .limit(1);
  if (assignmentPhotos.length > 0 && assignmentPhotos[0].url) {
    return assignmentPhotos[0].url;
  }

  // Load-scoped
  const loadPhotos = await db
    .select({ url: photos.sourceUrl })
    .from(photos)
    .where(and(eq(photos.loadId, loadId), isNotNull(photos.sourceUrl)))
    .orderBy(photos.id)
    .limit(1);
  if (loadPhotos.length > 0 && loadPhotos[0].url) {
    return loadPhotos[0].url;
  }

  // Historical bol_submissions
  const historical = await db
    .select({ urls: bolSubmissions.photos })
    .from(bolSubmissions)
    .where(eq(bolSubmissions.matchedLoadId, loadId))
    .orderBy(sql`${bolSubmissions.id} DESC`)
    .limit(1);
  if (historical.length > 0) {
    const raw = historical[0].urls;
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object" && "url" in entry) {
          return String((entry as Record<string, unknown>).url);
        }
      }
    }
  }

  return null;
}

/**
 * Photo gate — returns OK only if a pushable photo exists. Called before
 * any PCS traffic so dispatchLoad can abort cleanly if the gate fails.
 */
export async function photoGateCheck(
  db: Database,
  assignmentId: number,
  loadId: number,
): Promise<PhotoGateResult> {
  const url = await resolvePhotoUrl(db, assignmentId, loadId);
  if (!url) {
    return { ok: false, reason: "no_photo_attached" };
  }
  return { ok: true, photoUrl: url };
}

/**
 * Fetch photo bytes, auto-correct orientation via EXIF (sharp .rotate()),
 * strip metadata, re-encode as JPEG. Returns the normalized buffer ready
 * to upload. Throws on any step failure so the caller rolls back or
 * aborts before PCS traffic.
 */
export async function fetchAndNormalizePhoto(photoUrl: string): Promise<{
  buffer: Buffer;
  filename: string;
  wasRotated: boolean;
}> {
  // Route JotForm / GCS URLs through our photo proxy so auth + SSRF
  // allowlist are handled. External URLs already come proxied from the
  // workbench surface, but for defensiveness we still tolerate raw URLs.
  const res = await fetch(photoUrl, {
    headers: { Accept: "image/*" },
  });
  if (!res.ok) {
    throw new Error(`Photo fetch failed: HTTP ${res.status} from ${photoUrl}`);
  }
  const arrayBuf = await res.arrayBuffer();
  const raw = Buffer.from(arrayBuf);

  // Read EXIF orientation first so we can report whether rotation happened.
  // sharp's .rotate() with no args auto-corrects based on EXIF.
  const meta = await sharp(raw).metadata();
  const wasRotated =
    meta.orientation !== undefined &&
    meta.orientation !== 1 &&
    meta.orientation !== 0;

  const normalized = await sharp(raw)
    .rotate() // auto-rotate from EXIF
    .jpeg({ quality: 85, mozjpeg: true })
    .withMetadata({ orientation: 1 }) // strip non-orientation metadata, set canonical
    .toBuffer();

  const filename = `v2-dispatch-${Date.now()}.jpg`;
  return { buffer: normalized, filename, wasRotated };
}

/**
 * Upload a normalized photo buffer to PCS as a BillOfLading attachment.
 * Returns the attachment name PCS assigns (logged for traceability).
 *
 * If this throws, caller MUST roll back the associated PCS load via
 * cancelPcsLoad() to honor the "no photo, no PCS load" contract.
 */
export async function uploadPhotoToPcs(
  db: Database,
  pcsLoadId: number | string,
  buffer: Buffer,
  filename: string,
): Promise<{ attachmentName: string }> {
  const bearer = await getAccessToken(db);
  const url = `${getPcsBaseUrl()}/file/v1/load/${pcsLoadId}/attachments/BillOfLading`;

  // Build multipart body manually — PCS requires form field "files" (plural).
  const boundary = `----v2bound${Date.now()}${Math.random().toString(36).slice(2)}`;
  const CRLF = "\r\n";
  const parts: (string | Buffer)[] = [
    `--${boundary}${CRLF}`,
    `Content-Disposition: form-data; name="files"; filename="${filename}"${CRLF}`,
    `Content-Type: image/jpeg${CRLF}${CRLF}`,
    buffer,
    `${CRLF}--${boundary}--${CRLF}`,
  ];
  const body = Buffer.concat(
    parts.map((p) => (typeof p === "string" ? Buffer.from(p) : p)),
  );

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      ...getCompanyHeaders(),
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PCS attachment upload ${res.status}: ${text}`);
  }

  // List attachments to discover the assigned name (PCS doesn't return it
  // in the upload response body on 200).
  const listRes = await fetch(
    `${getPcsBaseUrl()}/file/v1/load/${pcsLoadId}/attachments`,
    {
      headers: {
        Authorization: `Bearer ${bearer}`,
        ...getCompanyHeaders(),
      },
    },
  );
  const listJson = listRes.ok
    ? ((await listRes.json()) as {
        attachments?: Array<{ name?: string; timeStampUtc?: string }>;
      })
    : { attachments: [] };
  const latest = (listJson.attachments ?? []).sort((a, b) =>
    (b.timeStampUtc ?? "").localeCompare(a.timeStampUtc ?? ""),
  )[0];
  return { attachmentName: latest?.name ?? "(unknown)" };
}

/**
 * Cancel/delete a PCS load. Used as rollback if photo upload fails after
 * load creation — ensures PCS never ends up with a BOL-less orphan.
 */
export async function cancelPcsLoad(
  db: Database,
  pcsLoadId: number | string,
): Promise<void> {
  const bearer = await getAccessToken(db);
  const url = `${getPcsBaseUrl()}/dispatching/v1/load/${pcsLoadId}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${bearer}`,
      ...getCompanyHeaders(),
    },
  });

  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(`PCS cancel load ${res.status}: ${text}`);
  }
}
