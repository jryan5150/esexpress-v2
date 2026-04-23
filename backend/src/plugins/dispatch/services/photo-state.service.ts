/**
 * Photo State computation — derives a rich semantic state from raw
 * photoStatus + load age + OCR state, so the UI can answer "WHY isn't
 * there a photo?" not just "there is / there isn't."
 *
 * Solves Jessica's recurring "is this missing, delayed, or broken?" ask
 * by giving every no-photo row a contextual explanation instead of an
 * empty `missing` label.
 *
 * States (derived, not persisted):
 *   attached             — photo present and fetchable
 *   pending_jotform      — load <60 min old, JotForm sync hasn't had a chance
 *   overdue              — load 60–240 min old, photo should have arrived
 *   needs_review         — load >4h old, human must ping driver or flag missing
 *   human_flagged_missing — user explicitly confirmed no photo exists
 *   unreadable           — photo present but OCR couldn't process it
 *
 * Thresholds chosen from 2026-04-22 client conversation:
 *   - 60 min = anomalous (JotForm syncs every 30 min, so 60 min means
 *     2 sync cycles have passed without a match)
 *   - 4h = needs active intervention (driver likely off shift or forgot)
 *
 * Auto-downgrade: when a photo arrives (via JotForm sync), state
 * transitions to `attached` automatically on next workbench query —
 * no human acknowledgement needed. Trail in status_history captures
 * the state at prior stage transitions.
 */

import type { PhotoStatus, UncertainReason } from "../../../db/schema.js";

export type PhotoState =
  | "attached"
  | "pending_jotform"
  | "overdue"
  | "needs_review"
  | "human_flagged_missing"
  | "unreadable";

export interface PhotoStateInput {
  photoStatus: PhotoStatus | null;
  photoCount: number;
  photoThumbUrl: string | null;
  loadCreatedAt: Date | string | null;
  uncertainReasons?: UncertainReason[] | null;
  /** OCR confidence from bol_submissions.ai_extracted_data (0-1). If null,
   *  we don't know — treat as "attached" and don't flag unreadable. */
  ocrConfidence?: number | null;
}

export interface PhotoStateResult {
  state: PhotoState;
  /** Null when we can't compute age (load.createdAt missing). */
  minutesSinceLoadCreated: number | null;
  /** User-facing explanation. Empty for `attached`. */
  message: string;
  /** Hint for UI: should we show a "Run Check" button? */
  allowRunCheck: boolean;
  /** Hint for UI: next expected sync time (ISO). */
  nextExpectedSync: string | null;
}

// JotForm syncs at :00 and :30 every hour. Next sync time is whichever
// is sooner from `now`. We don't pull from the cron itself because this
// function is called from read paths that shouldn't couple to scheduler.
function computeNextJotformSync(now: Date): Date {
  const next = new Date(now);
  next.setSeconds(0, 0);
  const m = now.getMinutes();
  if (m < 30) {
    next.setMinutes(30);
  } else {
    next.setHours(next.getHours() + 1);
    next.setMinutes(0);
  }
  return next;
}

const LOW_OCR_CONFIDENCE = 0.5;
const OVERDUE_MIN = 60;
const NEEDS_REVIEW_MIN = 240;

export function computePhotoState(input: PhotoStateInput): PhotoStateResult {
  const hasPhoto = (input.photoCount ?? 0) > 0 && input.photoThumbUrl != null;
  const now = new Date();

  // Human explicitly flagged "no photo at 48h" — terminal state, no
  // automated transition will clear it (human must uncheck).
  if (input.uncertainReasons?.includes("no_photo_48h")) {
    return {
      state: "human_flagged_missing",
      minutesSinceLoadCreated: null,
      message:
        "Flagged by dispatcher as no-photo. Remove the flag if a photo arrives.",
      allowRunCheck: true,
      nextExpectedSync: computeNextJotformSync(now).toISOString(),
    };
  }

  if (hasPhoto) {
    if (
      input.ocrConfidence != null &&
      input.ocrConfidence < LOW_OCR_CONFIDENCE
    ) {
      return {
        state: "unreadable",
        minutesSinceLoadCreated: null,
        message: `Photo attached but OCR couldn't read it confidently (${Math.round(
          (input.ocrConfidence ?? 0) * 100,
        )}%). Rotate, re-crop, or re-run OCR.`,
        allowRunCheck: false,
        nextExpectedSync: null,
      };
    }
    return {
      state: "attached",
      minutesSinceLoadCreated: null,
      message: "",
      allowRunCheck: false,
      nextExpectedSync: null,
    };
  }

  // No photo — compute age to pick pending vs overdue vs needs-review
  const createdAt =
    input.loadCreatedAt == null
      ? null
      : typeof input.loadCreatedAt === "string"
        ? new Date(input.loadCreatedAt)
        : input.loadCreatedAt;
  const minutesOld =
    createdAt == null
      ? null
      : Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 60000));

  if (minutesOld == null) {
    return {
      state: "pending_jotform",
      minutesSinceLoadCreated: null,
      message:
        "Driver photo expected. JotForm syncs every 30 min; check back soon.",
      allowRunCheck: true,
      nextExpectedSync: computeNextJotformSync(now).toISOString(),
    };
  }

  if (minutesOld < OVERDUE_MIN) {
    const next = computeNextJotformSync(now);
    const minsToSync = Math.max(
      1,
      Math.ceil((next.getTime() - now.getTime()) / 60000),
    );
    return {
      state: "pending_jotform",
      minutesSinceLoadCreated: minutesOld,
      message: `Photo expected. Load ${minutesOld} min old. Next JotForm sync in ${minsToSync} min.`,
      allowRunCheck: true,
      nextExpectedSync: next.toISOString(),
    };
  }

  if (minutesOld < NEEDS_REVIEW_MIN) {
    return {
      state: "overdue",
      minutesSinceLoadCreated: minutesOld,
      message: `Photo ${minutesOld} min overdue. Driver may have forgotten — Run Check now or wait for next sync.`,
      allowRunCheck: true,
      nextExpectedSync: computeNextJotformSync(now).toISOString(),
    };
  }

  // >= 4h
  const hours = Math.floor(minutesOld / 60);
  return {
    state: "needs_review",
    minutesSinceLoadCreated: minutesOld,
    message: `No photo for ${hours}h+. Ping driver or flag as missing.`,
    allowRunCheck: true,
    nextExpectedSync: computeNextJotformSync(now).toISOString(),
  };
}
