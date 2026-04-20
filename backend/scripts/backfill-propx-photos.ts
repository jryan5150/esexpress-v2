/**
 * One-shot backfill of PropX ticket-image photos for assignments currently
 * visible in the workbench (ready_to_build + uncertain — the demo-relevant
 * subset).
 *
 * For each load:
 *   1. Skip if photos table already has a row for it
 *   2. Call PropX /loads/{id}/ticket-image (returns base64 image)
 *   3. Decode → upload to GCS at propx/{sourceId}.jpg
 *   4. Insert photo row pointing to the GCS object via signed-URL-ready path
 *
 * Concurrency: 4 in flight. Errors per-load are logged and don't halt.
 *
 * Run:
 *   cd backend
 *   DATABASE_URL=$(...) PROPX_API_KEY=... GCS_SERVICE_ACCOUNT_KEY=... \
 *     npx tsx scripts/backfill-propx-photos.ts
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, inArray, sql } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import { loads, assignments, photos as photosTable } from "../src/db/schema.js";
import { PropxClient } from "../src/plugins/ingestion/services/propx.service.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}
const PROPX_API_KEY = process.env.PROPX_API_KEY;
if (!PROPX_API_KEY) {
  console.error("PROPX_API_KEY required");
  process.exit(1);
}

const BUCKET_NAME = "esexpress-weight-tickets";
const PROPX_PHOTO_PREFIX = "propx/";
const CONCURRENCY = 4;

function getStorage(): Storage {
  const keyJson = process.env.GCS_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    throw new Error("GCS_SERVICE_ACCOUNT_KEY required");
  }
  const decoded = keyJson.trimStart().startsWith("{")
    ? keyJson
    : Buffer.from(keyJson, "base64").toString();
  return new Storage({ credentials: JSON.parse(decoded) });
}

interface Stats {
  total: number;
  already_have: number;
  no_image_at_source: number;
  uploaded: number;
  errors: number;
}

async function processBatch(
  batch: Array<{ id: number; sourceId: string }>,
  client: PropxClient,
  storage: Storage,
  db: ReturnType<typeof drizzle>,
  stats: Stats,
): Promise<void> {
  await Promise.all(
    batch.map(async ({ id: loadId, sourceId }) => {
      try {
        const image = await client.getLoadTicketImage(sourceId);
        if (!image) {
          stats.no_image_at_source++;
          return;
        }

        const objectPath = `${PROPX_PHOTO_PREFIX}${sourceId}.jpg`;
        await storage
          .bucket(BUCKET_NAME)
          .file(objectPath)
          .save(image.buffer, {
            contentType: image.contentType,
            metadata: { cacheControl: "public, max-age=31536000" },
          });

        const sourceUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${objectPath}`;
        await db.insert(photosTable).values({
          loadId,
          source: "propx",
          sourceUrl,
          type: "weight_ticket",
        });

        stats.uploaded++;
        if (stats.uploaded % 25 === 0) {
          console.log(`  uploaded ${stats.uploaded}…`);
        }
      } catch (err) {
        stats.errors++;
        console.error(
          `  ERR load=${loadId} sourceId=${sourceId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }),
  );
}

async function main() {
  const stats: Stats = {
    total: 0,
    already_have: 0,
    no_image_at_source: 0,
    uploaded: 0,
    errors: 0,
  };

  const pg = postgres(DATABASE_URL!, { prepare: false });
  const db = drizzle(pg);
  const storage = getStorage();
  const client = new PropxClient({
    apiKey: PROPX_API_KEY!,
    baseUrl: process.env.PROPX_BASE_URL,
  });

  console.log("Pulling target load set (ready_to_build + uncertain)…");
  const targetLoads = await db
    .select({
      id: loads.id,
      sourceId: loads.sourceId,
    })
    .from(loads)
    .innerJoin(assignments, eq(assignments.loadId, loads.id))
    .where(
      and(
        eq(loads.source, "propx"),
        inArray(assignments.handlerStage, ["uncertain", "ready_to_build"]),
      ),
    );

  console.log(`  ${targetLoads.length} candidate loads`);
  stats.total = targetLoads.length;

  // Pull existing PropX photo rows so we skip work that's already done
  const existing = await db
    .select({ loadId: photosTable.loadId })
    .from(photosTable)
    .where(eq(photosTable.source, "propx"));
  const existingSet = new Set(existing.map((r) => r.loadId));
  const toFetch = targetLoads.filter((l) => !existingSet.has(l.id));
  stats.already_have = targetLoads.length - toFetch.length;
  console.log(
    `  ${stats.already_have} already have photos · ${toFetch.length} need fetch`,
  );

  // Process in batches to control concurrency
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);
    await processBatch(batch, client, storage, db, stats);
  }

  console.log("\n=== DONE ===");
  console.log(JSON.stringify(stats, null, 2));
  await pg.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
