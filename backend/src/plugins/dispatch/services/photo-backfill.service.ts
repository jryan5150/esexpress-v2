/**
 * Photo backfill service.
 *
 * Three phases. Each is independently invocable so failures in one don't
 * block the others.
 *
 *   Phase 1 — backfillPropxPhotoRefs
 *     Inserts `photos` table rows for PropX loads that should have had a
 *     row created at sync time but didn't (the sync code only writes refs
 *     for newly-ingested loads; older or pre-fix loads were missed). After
 *     this runs, every Jan-today PropX load with a ticket_no has a
 *     `photos` row pointing at PropX's `/loads/{sourceId}/ticket_image`.
 *
 *   Phase 2 — backfillPropxPhotosToGcs
 *     For each `photos` row whose sourceUrl still points at PropX, fetches
 *     the JPEG (with PROPX_API_KEY auth) and re-uploads it into GCS
 *     (GCS_PHOTO_BUCKET), then updates the row's sourceUrl to the GCS URL.
 *     Long-running, fire-and-forget; in-memory job state.
 *
 *   Phase 3 — backfillAssignmentPhotoStatus
 *     For every assignment whose load has at least one photos row but
 *     photo_status != 'attached', flip the flag. This is what makes the
 *     5.18% Tier 1 coverage number actually reflect reality.
 *
 * Created 2026-04-24 to surface the historical PropX photo corpus that
 * was technically present but invisible: photos rows missing for newer
 * loads, no GCS-cached copies, photoStatus flag never updated.
 */
import { and, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import type { Database } from "../../../db/client.js";
import { assignments, loads, photos } from "../../../db/schema.js";
import { proxyPhoto } from "../../verification/services/photo.service.js";
import { reportError } from "../../../lib/sentry.js";

const PROPX_TICKET_IMAGE_HOST = "publicapis.propx.com";

interface BackfillRefsResult {
  scanned: number;
  inserted: number;
  skippedNoTicketNo: number;
  fromDate: string;
  toDate: string;
}

/** Phase 1 — insert missing photos rows for PropX loads in range. */
export async function backfillPropxPhotoRefs(
  db: Database,
  fromDate: Date,
  toDate: Date,
): Promise<BackfillRefsResult> {
  // Loads in range with no existing 'propx' photos row, AND ticket_no set
  // (the gate the original sync code uses — only loads with ticket_no
  // have a corresponding ticket_image at PropX).
  const candidates = await db
    .select({
      loadId: loads.id,
      sourceId: loads.sourceId,
      ticketNo: loads.ticketNo,
    })
    .from(loads)
    .leftJoin(
      photos,
      and(eq(photos.loadId, loads.id), eq(photos.source, "propx")),
    )
    .where(
      and(
        eq(loads.source, "propx"),
        isNotNull(loads.sourceId),
        gte(loads.createdAt, fromDate),
        lte(loads.createdAt, toDate),
        isNull(photos.id),
      ),
    );

  let skippedNoTicketNo = 0;
  const rowsToInsert: Array<{
    loadId: number;
    source: "propx";
    sourceUrl: string;
    type: "weight_ticket";
    ticketNo: string | null;
  }> = [];

  for (const c of candidates) {
    if (!c.sourceId) continue;
    if (!c.ticketNo) {
      skippedNoTicketNo += 1;
      continue;
    }
    rowsToInsert.push({
      loadId: c.loadId,
      source: "propx",
      sourceUrl: `https://${PROPX_TICKET_IMAGE_HOST}/api/v1/loads/${c.sourceId}/ticket_image`,
      type: "weight_ticket",
      ticketNo: c.ticketNo,
    });
  }

  // Insert in chunks to keep parameter counts sane.
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
    const chunk = rowsToInsert.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    await db.insert(photos).values(chunk);
    inserted += chunk.length;
  }

  return {
    scanned: candidates.length,
    inserted,
    skippedNoTicketNo,
    fromDate: fromDate.toISOString(),
    toDate: toDate.toISOString(),
  };
}

// ─── Phase 2 — GCS download/upload (fire-and-forget) ─────────────

interface GcsBackfillJob {
  id: string;
  status: "running" | "completed" | "failed" | "stopped";
  startedAt: string;
  finishedAt?: string;
  fromDate: string;
  toDate: string;
  totalCandidates: number;
  processed: number;
  uploaded: number;
  skipped: number;
  errors: number;
  lastError?: string;
  concurrency: number;
}

let currentGcsJob: GcsBackfillJob | null = null;

export function getGcsBackfillJob(): GcsBackfillJob | null {
  return currentGcsJob;
}

export function stopGcsBackfillJob(): boolean {
  if (currentGcsJob && currentGcsJob.status === "running") {
    currentGcsJob.status = "stopped";
    currentGcsJob.finishedAt = new Date().toISOString();
    return true;
  }
  return false;
}

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

/**
 * Start the long-running GCS backfill. Returns immediately with the job id.
 * Concurrency capped to keep PropX rate-limit risk low.
 */
export function startGcsBackfillJob(args: {
  db: Database;
  fromDate: Date;
  toDate: Date;
  concurrency?: number;
}): GcsBackfillJob {
  if (currentGcsJob && currentGcsJob.status === "running") {
    return currentGcsJob;
  }
  const id = `propx-gcs-backfill-${Date.now()}`;
  const concurrency = Math.max(1, Math.min(8, args.concurrency ?? 4));
  currentGcsJob = {
    id,
    status: "running",
    startedAt: new Date().toISOString(),
    fromDate: args.fromDate.toISOString(),
    toDate: args.toDate.toISOString(),
    totalCandidates: 0,
    processed: 0,
    uploaded: 0,
    skipped: 0,
    errors: 0,
    concurrency,
  };
  // Fire-and-forget. No await.
  void runGcsBackfill(args.db, args.fromDate, args.toDate, concurrency).catch(
    (err) => {
      const e = err instanceof Error ? err : new Error(String(err));
      if (currentGcsJob) {
        currentGcsJob.status = "failed";
        currentGcsJob.lastError = e.message;
        currentGcsJob.finishedAt = new Date().toISOString();
      }
      console.error("[photo-backfill] gcs job crashed", e);
      reportError(e, { source: "photo-backfill", op: "runGcsBackfill" });
    },
  );
  return currentGcsJob;
}

async function runGcsBackfill(
  db: Database,
  fromDate: Date,
  toDate: Date,
  concurrency: number,
): Promise<void> {
  const bucketName = process.env.GCS_PHOTO_BUCKET;
  if (!bucketName) {
    if (currentGcsJob) {
      currentGcsJob.status = "failed";
      currentGcsJob.lastError = "GCS_PHOTO_BUCKET not configured";
      currentGcsJob.finishedAt = new Date().toISOString();
    }
    return;
  }
  const bucket = getGcsStorage().bucket(bucketName);

  // Pull the candidate set once. PropX-source rows whose sourceUrl still
  // points at the PropX API (i.e. not already uploaded to GCS), within
  // the requested date range. Order by id ASC for stable resume behavior.
  const candidates = await db
    .select({
      photoId: photos.id,
      loadId: photos.loadId,
      sourceUrl: photos.sourceUrl,
      ticketNo: photos.ticketNo,
    })
    .from(photos)
    .innerJoin(loads, eq(loads.id, photos.loadId))
    .where(
      and(
        eq(photos.source, "propx"),
        gte(loads.createdAt, fromDate),
        lte(loads.createdAt, toDate),
        sql`${photos.sourceUrl} LIKE ${`%${PROPX_TICKET_IMAGE_HOST}%`}`,
      ),
    )
    .orderBy(photos.id);

  if (currentGcsJob) {
    currentGcsJob.totalCandidates = candidates.length;
  }

  // Worker function — handles one photo: fetch from PropX, upload to GCS,
  // update the row. Returns 'uploaded' | 'skipped' | 'error'.
  async function processOne(
    c: (typeof candidates)[number],
  ): Promise<"uploaded" | "skipped" | "error"> {
    if (!c.sourceUrl) return "skipped";
    try {
      const { buffer, contentType } = await proxyPhoto(c.sourceUrl);
      // Object path: propx/{loadId}/{photoId}.jpg — stable, idempotent
      const ext = contentType === "image/png" ? "png" : "jpg";
      const objectPath = `propx/${c.loadId}/${c.photoId}.${ext}`;
      await bucket.file(objectPath).save(buffer, {
        contentType,
        metadata: { cacheControl: "public, max-age=31536000" },
      });
      const newUrl = `https://storage.googleapis.com/${bucketName}/${objectPath}`;
      await db
        .update(photos)
        .set({ sourceUrl: newUrl })
        .where(eq(photos.id, c.photoId));
      return "uploaded";
    } catch {
      return "error";
    }
  }

  // Run with bounded concurrency. Round-robin pop from the queue.
  const queue = [...candidates];
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      if (currentGcsJob?.status !== "running") return;
      const c = queue.shift();
      if (!c) return;
      const outcome = await processOne(c);
      if (currentGcsJob) {
        currentGcsJob.processed += 1;
        if (outcome === "uploaded") currentGcsJob.uploaded += 1;
        else if (outcome === "skipped") currentGcsJob.skipped += 1;
        else currentGcsJob.errors += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (currentGcsJob && currentGcsJob.status === "running") {
    currentGcsJob.status = "completed";
    currentGcsJob.finishedAt = new Date().toISOString();
  }
}

// ─── Phase 3 — backfill assignments.photo_status = 'attached' ─────

interface PhotoStatusBackfillResult {
  scanned: number;
  flipped: number;
}

/**
 * For every assignment whose load has at least one photos row, flip
 * photo_status to 'attached' if it isn't already. Source-agnostic — counts
 * any photo, including PropX rows backfilled by Phase 1/2.
 *
 * Uses an explicit IN-subquery (non-correlated) so postgres builds the
 * distinct load_id set once and joins. The earlier correlated-EXISTS
 * variant timed out on prod data (53K assignments × per-row EXISTS lookup).
 */
export async function backfillAssignmentPhotoStatus(
  db: Database,
): Promise<PhotoStatusBackfillResult> {
  const result = await db
    .update(assignments)
    .set({ photoStatus: "attached", updatedAt: new Date() })
    .where(
      sql`${assignments.photoStatus} != 'attached' AND ${assignments.loadId} IN (SELECT DISTINCT ${photos.loadId} FROM ${photos} WHERE ${photos.loadId} IS NOT NULL)`,
    )
    .returning({ id: assignments.id });

  return { scanned: result.length, flipped: result.length };
}
