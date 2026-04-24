/**
 * Re-OCR backfilled bol_submissions.
 *
 * The 805 bol_submissions rows with status='backfilled' came from CSV
 * imports that bypassed the JotForm sync's Vision step — they have stored
 * photo URLs but no aiExtractedData. This service runs Vision on those
 * photos retroactively, then attempts to match each to a load.
 *
 * Async fire-and-forget pattern (like the GCS backfill). In-memory job
 * state visible via the GET status endpoint. Bounded concurrency keeps
 * Anthropic API rate-limit risk low + cost predictable.
 *
 * Per-row outcome categories:
 *   ocrSucceeded — Vision extracted fields cleanly
 *   ocrFailed    — Vision threw (network / model / image read error)
 *   matched      — OCR fields resolved a load via matchSubmissionToLoad
 *   stillPending — OCR ok but no load match
 *   skipped      — no usable photos
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import { assignments, bolSubmissions } from "../../../db/schema.js";
import { extractFromPhotos } from "./bol-extraction.service.js";
import { matchSubmissionToLoad } from "./jotform.service.js";
import { reportError } from "../../../lib/sentry.js";

interface ReOcrJob {
  id: string;
  status: "running" | "completed" | "failed" | "stopped";
  startedAt: string;
  finishedAt?: string;
  totalCandidates: number;
  processed: number;
  ocrSucceeded: number;
  ocrFailed: number;
  matched: number;
  stillPending: number;
  skipped: number;
  concurrency: number;
  lastError?: string;
}

let currentJob: ReOcrJob | null = null;

export function getReOcrJob(): ReOcrJob | null {
  return currentJob;
}

export function stopReOcrJob(): boolean {
  if (currentJob && currentJob.status === "running") {
    currentJob.status = "stopped";
    currentJob.finishedAt = new Date().toISOString();
    return true;
  }
  return false;
}

/**
 * Start the long-running re-OCR job. Returns immediately with job id.
 * Concurrency capped 1-6 — Anthropic Vision is the rate-limited side.
 *
 * `limit` lets us cap a run for cost control (default 1000, max 5000).
 */
export function startReOcrJob(args: {
  db: Database;
  limit?: number;
  concurrency?: number;
}): ReOcrJob {
  if (currentJob && currentJob.status === "running") {
    return currentJob;
  }
  const id = `bol-reocr-${Date.now()}`;
  const concurrency = Math.max(1, Math.min(6, args.concurrency ?? 4));
  const limit = Math.max(1, Math.min(5000, args.limit ?? 1000));
  currentJob = {
    id,
    status: "running",
    startedAt: new Date().toISOString(),
    totalCandidates: 0,
    processed: 0,
    ocrSucceeded: 0,
    ocrFailed: 0,
    matched: 0,
    stillPending: 0,
    skipped: 0,
    concurrency,
  };
  void runReOcrJob(args.db, limit, concurrency).catch((err) => {
    const e = err instanceof Error ? err : new Error(String(err));
    if (currentJob) {
      currentJob.status = "failed";
      currentJob.lastError = e.message;
      currentJob.finishedAt = new Date().toISOString();
    }
    console.error("[bol-reocr] job crashed", e);
    reportError(e, { source: "bol-reocr", op: "runReOcrJob" });
  });
  return currentJob;
}

async function runReOcrJob(
  db: Database,
  limit: number,
  concurrency: number,
): Promise<void> {
  // Candidate set: rows with no aiExtractedData yet AND non-empty photos.
  // status='backfilled' is the typical case but we don't gate on status —
  // we gate on "Vision never ran" (aiExtractedData IS NULL) so a future
  // pending row that lost its OCR for any reason also gets re-tried.
  const candidates = await db
    .select({
      id: bolSubmissions.id,
      photos: bolSubmissions.photos,
      driverName: bolSubmissions.driverName,
      loadNumber: bolSubmissions.loadNumber,
    })
    .from(bolSubmissions)
    .where(
      and(
        isNull(bolSubmissions.aiExtractedData),
        sql`jsonb_array_length(${bolSubmissions.photos}) > 0`,
      ),
    )
    .limit(limit);

  if (currentJob) {
    currentJob.totalCandidates = candidates.length;
  }

  async function processOne(
    c: (typeof candidates)[number],
  ): Promise<"matched" | "stillPending" | "ocrFailed" | "skipped"> {
    const photoUrls = Array.isArray(c.photos)
      ? c.photos.map((p) => p?.url).filter((u): u is string => !!u)
      : [];
    if (photoUrls.length === 0) {
      // Mark as failed so we don't keep re-evaluating the same empty row.
      await db
        .update(bolSubmissions)
        .set({ status: "failed", lastError: "no usable photos" })
        .where(eq(bolSubmissions.id, c.id))
        .catch(() => undefined);
      return "skipped";
    }

    let extraction;
    try {
      extraction = await extractFromPhotos(photoUrls);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (currentJob) currentJob.lastError = `id=${c.id}: ${msg.slice(0, 200)}`;
      await db
        .update(bolSubmissions)
        .set({ status: "failed", lastError: msg.slice(0, 1000) })
        .where(eq(bolSubmissions.id, c.id))
        .catch(() => undefined);
      return "ocrFailed";
    }

    if (currentJob) currentJob.ocrSucceeded += 1;

    // Persist extraction so the row is no longer a candidate
    await db
      .update(bolSubmissions)
      .set({
        aiExtractedData: extraction as unknown as Record<string, unknown>,
        aiConfidence: extraction.overallConfidence,
        aiMetadata: {
          extractedAt: new Date().toISOString(),
          source: "bol-reocr",
          photoCount: photoUrls.length,
          fieldConfidences: extraction.fieldConfidences,
        },
        status: "extracted",
      })
      .where(eq(bolSubmissions.id, c.id))
      .catch(() => undefined);

    // Try to match the freshly-OCR'd fields against current loads
    const matchFields = {
      driverName: extraction.driverName ?? c.driverName ?? null,
      truckNo: extraction.truckNo ?? null,
      bolNo: extraction.ticketNo ?? null,
      weight:
        typeof extraction.grossWeight === "number"
          ? extraction.grossWeight
          : null,
      loadNo: c.loadNumber ?? null,
      photoUrl: photoUrls[0] ?? null,
      imageUrls: photoUrls,
      submittedAt: null,
    };
    try {
      const match = await matchSubmissionToLoad(db, matchFields);
      if (match.matched && match.loadId) {
        await db
          .update(bolSubmissions)
          .set({
            matchedLoadId: match.loadId,
            matchMethod: match.matchMethod,
            matchScore: match.confidence,
            status: "matched",
          })
          .where(eq(bolSubmissions.id, c.id))
          .catch(() => undefined);
        // Bridge to assignment
        await db
          .update(assignments)
          .set({ photoStatus: "attached", updatedAt: new Date() })
          .where(eq(assignments.loadId, match.loadId))
          .catch(() => undefined);
        return "matched";
      }
    } catch {
      // Match failure is non-fatal; row stays at status='extracted'
    }
    return "stillPending";
  }

  const queue = [...candidates];
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      if (currentJob?.status !== "running") return;
      const c = queue.shift();
      if (!c) return;
      const outcome = await processOne(c);
      if (currentJob) {
        currentJob.processed += 1;
        if (outcome === "matched") currentJob.matched += 1;
        else if (outcome === "stillPending") currentJob.stillPending += 1;
        else if (outcome === "ocrFailed") currentJob.ocrFailed += 1;
        else currentJob.skipped += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (currentJob && currentJob.status === "running") {
    currentJob.status = "completed";
    currentJob.finishedAt = new Date().toISOString();
  }
}
