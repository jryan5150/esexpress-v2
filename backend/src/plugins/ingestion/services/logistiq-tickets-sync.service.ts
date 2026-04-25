/**
 * Logistiq Tickets Sync — pulls sand ticket photos from the internal
 * Logistiq dispatcher API and writes them into the photos table.
 *
 * The carrier-export API doesn't expose ticket photos. The internal
 * /v2/order/{order_id}/tickets endpoint does. This sync iterates over
 * Logistiq loads that have sand_ticket_uploaded_at set but no photo
 * row, fetches the tickets, and inserts them. After insert, flips the
 * matching assignment.photoStatus = 'attached' so the row stops
 * showing as "no photo" on Validate.
 *
 * Discovered 2026-04-24 PM after operator pushed back on
 * "Logistiq doesn't carry photos" — they DO, we just never built the
 * integration.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import { assignments, loads, photos } from "../../../db/schema.js";
import { LogistiqClient } from "./logistiq.service.js";
import { reportError } from "../../../lib/sentry.js";

interface SyncResult {
  candidates: number;
  fetched: number;
  ticketsFound: number;
  photosInserted: number;
  assignmentsFlipped: number;
  errors: number;
  errorSamples: string[];
}

/**
 * Build a fresh client with session credentials for the noc account.
 * Falls back to undefined if env not configured (caller decides what to do).
 */
function buildClient(): LogistiqClient | null {
  const password = process.env.LOGISTIQ_NOC_PW;
  if (!password) return null;
  const email = process.env.LOGISTIQ_NOC_EMAIL ?? "noc@lexcom.com";
  return new LogistiqClient({
    email,
    password,
    apiKey: process.env.LOGISTIQ_API_KEY,
    carrierId: process.env.LOGISTIQ_CARRIER_ID
      ? parseInt(process.env.LOGISTIQ_CARRIER_ID, 10)
      : undefined,
  });
}

/**
 * Fetch tickets for up to `limit` Logistiq loads that have a ticket
 * uploaded but no photo row in our system. Concurrent fetches are
 * limited to avoid hammering Logistiq.
 */
export async function syncLogistiqTickets(
  db: Database,
  opts: { limit?: number; concurrency?: number } = {},
): Promise<SyncResult> {
  const limit = opts.limit ?? 200;
  const concurrency = opts.concurrency ?? 4;

  const client = buildClient();
  if (!client) {
    return {
      candidates: 0,
      fetched: 0,
      ticketsFound: 0,
      photosInserted: 0,
      assignmentsFlipped: 0,
      errors: 0,
      errorSamples: ["LOGISTIQ_NOC_PW not configured — sync skipped"],
    };
  }

  // Find Logistiq loads with a ticket uploaded but no photo row.
  // raw_data->>'order_id' is the Logistiq order_id we need to fetch.
  const candidates = await db.execute<{
    load_id: number;
    order_id: number;
  }>(sql`
    SELECT
      l.id AS load_id,
      (l.raw_data->>'order_id')::int AS order_id
    FROM loads l
    WHERE l.source = 'logistiq'
      AND l.raw_data->>'sand_ticket_uploaded_at' IS NOT NULL
      AND l.raw_data->>'order_id' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM photos p
        WHERE p.load_id = l.id AND p.source = 'logistiq'
      )
    ORDER BY l.delivered_on DESC NULLS LAST
    LIMIT ${limit}
  `);

  const candidateRows =
    (
      candidates as unknown as {
        rows?: Array<{ load_id: number; order_id: number }>;
      }
    ).rows ??
    (candidates as unknown as Array<{ load_id: number; order_id: number }>);

  const result: SyncResult = {
    candidates: candidateRows.length,
    fetched: 0,
    ticketsFound: 0,
    photosInserted: 0,
    assignmentsFlipped: 0,
    errors: 0,
    errorSamples: [],
  };

  if (candidateRows.length === 0) return result;

  // Pre-auth once so the concurrent fetches share one token.
  await client.authenticate();

  // Process in concurrency-limited batches.
  for (let i = 0; i < candidateRows.length; i += concurrency) {
    const batch = candidateRows.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map(async (row) => {
        const tickets = await client.getOrderTickets(row.order_id);
        return { row, tickets };
      }),
    );

    const photoInserts: Array<typeof photos.$inferInsert> = [];
    const flippedLoadIds: number[] = [];

    for (const r of settled) {
      result.fetched++;
      if (r.status === "rejected") {
        result.errors++;
        if (result.errorSamples.length < 5) {
          result.errorSamples.push(String(r.reason).slice(0, 160));
        }
        continue;
      }
      const { row, tickets } = r.value;
      const usable = tickets.filter((t) => t.url && !t.isDeleted);
      if (usable.length === 0) continue;
      result.ticketsFound += usable.length;
      flippedLoadIds.push(row.load_id);
      for (const t of usable) {
        photoInserts.push({
          loadId: row.load_id,
          source: "logistiq",
          sourceUrl: t.url,
          type: "weight_ticket",
          ticketNo: t.ticketNumber ?? null,
        });
      }
    }

    if (photoInserts.length > 0) {
      try {
        const inserted = await db
          .insert(photos)
          .values(photoInserts)
          .returning({ id: photos.id });
        result.photosInserted += inserted.length;
      } catch (err) {
        result.errors++;
        if (result.errorSamples.length < 5) {
          result.errorSamples.push(
            `insert failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    if (flippedLoadIds.length > 0) {
      try {
        // Use drizzle inArray() — raw `= ANY(${array})` crashes
        // postgres.js with prepare:false (this is the THIRD time the
        // same gotcha has bitten us today; needs a lint rule).
        const updated = await db
          .update(assignments)
          .set({ photoStatus: "attached" })
          .where(
            and(
              inArray(assignments.loadId, flippedLoadIds),
              isNull(assignments.photoStatus),
            ),
          )
          .returning({ id: assignments.id });
        const updatedNonNull = await db
          .update(assignments)
          .set({ photoStatus: "attached" })
          .where(
            and(
              inArray(assignments.loadId, flippedLoadIds),
              sql`${assignments.photoStatus} IN ('pending','missing')`,
            ),
          )
          .returning({ id: assignments.id });
        result.assignmentsFlipped += updated.length + updatedNonNull.length;
      } catch (err) {
        result.errors++;
        if (result.errorSamples.length < 5) {
          result.errorSamples.push(
            `flip failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  return result;
}

/**
 * Compute how many Logistiq loads still need their tickets fetched.
 * Useful for a /diag endpoint to track sync progress without firing it.
 */
export async function countLogistiqTicketCandidates(
  db: Database,
): Promise<{ pending: number; total: number }> {
  const [totalRow] = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM loads
    WHERE source = 'logistiq'
      AND raw_data->>'sand_ticket_uploaded_at' IS NOT NULL
  `);
  const [pendingRow] = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM loads l
    WHERE l.source = 'logistiq'
      AND l.raw_data->>'sand_ticket_uploaded_at' IS NOT NULL
      AND l.raw_data->>'order_id' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM photos p
        WHERE p.load_id = l.id AND p.source = 'logistiq'
      )
  `);
  const total =
    (totalRow as unknown as { n?: number })?.n ??
    (totalRow as unknown as { rows?: Array<{ n: number }> })?.rows?.[0]?.n ??
    0;
  const pending =
    (pendingRow as unknown as { n?: number })?.n ??
    (pendingRow as unknown as { rows?: Array<{ n: number }> })?.rows?.[0]?.n ??
    0;
  return { total, pending };
}
