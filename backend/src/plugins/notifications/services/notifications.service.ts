/**
 * Notifications Service Facade
 * ============================
 *
 * Single entry point for sending email from any feature module. Callers pass
 * a fully rendered {subject, body, to, eventType} payload — this service
 * handles:
 *
 *   1. Writing a notification_events row BEFORE attempting send (so we have
 *      an audit trail even if the process crashes mid-send).
 *   2. Dispatching via graph-email.service.sendMail().
 *   3. Updating the row with success/error + retry count.
 *   4. Retrying up to 3x on transient errors (5xx, network) with backoff.
 *   5. Returning a structured {success, error?} to the caller.
 *
 * The notification_events row is the source of truth. If something went
 * wrong with a notification, start there.
 */

import { eq } from "drizzle-orm";
import { notificationEvents } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";
import { sendMail } from "./graph-email.service.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendEmailOpts {
  /** Recipient email address. */
  to: string;
  /** Subject line. */
  subject: string;
  /** Fully-rendered HTML body. */
  body: string;
  /**
   * Categorization key — queryable. Free-form but use consistent values:
   * 'magic_link' | 'alert' | 'maintenance_done' | 'daily_digest' | etc.
   */
  eventType: string;
  /** Optional structured metadata (e.g. userId, wellId, ticketNo). */
  metadata?: Record<string, unknown>;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
  /** notification_events.id for follow-up queries / audit. */
  eventId?: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
/** Base backoff in ms; actual wait = BASE * 2^attempt. */
const BACKOFF_BASE_MS = 500;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send an email and log the attempt to notification_events.
 *
 * Always resolves (never throws) — email infra problems shouldn't crash the
 * business flow that triggered the notification. Check `.success` on the
 * returned value.
 */
export async function sendEmail(
  db: Database,
  opts: SendEmailOpts,
): Promise<SendEmailResult> {
  // 1. Write event row FIRST so we have an audit trail even if send throws.
  let eventId: number | undefined;
  try {
    const [row] = await db
      .insert(notificationEvents)
      .values({
        eventType: opts.eventType,
        recipient: opts.to,
        subject: opts.subject,
        body: opts.body,
        success: false, // will flip to true on success
        retryCount: 0,
        metadata: opts.metadata ?? {},
      })
      .returning({ id: notificationEvents.id });
    eventId = row?.id;
  } catch (err) {
    // If we can't even log, log to console and still attempt the send.
    // The send result will be returned without a persistent event row.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[notifications] failed to write notification_events row: ${msg}`,
    );
  }

  // 2. Attempt send with retries on transient errors.
  let lastError: string | undefined;
  let attempts = 0;

  for (attempts = 0; attempts < MAX_RETRIES; attempts++) {
    if (attempts > 0) {
      await sleep(BACKOFF_BASE_MS * Math.pow(2, attempts - 1));
    }

    const result = await sendMail({
      to: opts.to,
      subject: opts.subject,
      html: opts.body,
    });

    if (result.success) {
      // 3a. Flip the event row to success.
      await safeUpdateEvent(db, eventId, {
        success: true,
        retryCount: attempts,
        error: null,
      });
      return { success: true, eventId };
    }

    lastError = result.error ?? "unknown send error";
    console.warn(
      `[notifications] send attempt ${attempts + 1}/${MAX_RETRIES} failed: ${lastError}`,
    );

    if (result.fatal) {
      // Non-retryable — stop here.
      break;
    }
  }

  // 3b. All attempts failed — update the event row.
  await safeUpdateEvent(db, eventId, {
    success: false,
    retryCount: attempts,
    error: lastError ?? "unknown",
  });

  return { success: false, error: lastError, eventId };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function safeUpdateEvent(
  db: Database,
  eventId: number | undefined,
  values: { success: boolean; retryCount: number; error: string | null },
): Promise<void> {
  if (eventId === undefined) return;
  try {
    await db
      .update(notificationEvents)
      .set(values)
      .where(eq(notificationEvents.id, eventId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[notifications] failed to update event ${eventId}: ${msg}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
