/**
 * Match Decisions — Phase 2 of matching-v2
 * ==========================================
 *
 * Every human action on an assignment (confirm, route_uncertain:*, flag_back,
 * advance-to-stage) writes one match_decisions row. This is the labeled-data
 * stream the Phase 3 tuner consumes to re-weight the scorer.
 *
 * Called from the workbench route handlers AFTER the underlying service
 * function succeeds. NOT called inside the service transactions — keeps the
 * service layer ignorant of learning infrastructure, and the small
 * commit-window gap (action committed but decision insert failed) is logged,
 * not thrown — decisions are observational, not correctness-critical.
 */

import { eq, sql } from "drizzle-orm";
import {
  assignments,
  loads,
  matchDecisions,
  bolSubmissions,
  driverCrossrefs,
} from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";
import type { MatchFeatures, MatchScore } from "./match-scorer.service.js";
import { scoreMatch } from "./match-scorer.service.js";
import { extractMatchFeatures } from "./match-features.service.js";

/**
 * Canonical action labels. Keep stable — the tuner aggregates by this field,
 * so renaming shifts historical data interpretation.
 *
 * - `advance:<stage>` — advanceStage() transitions (e.g. advance:ready_to_build)
 * - `route:<action>` — routeUncertain re-tagging (route:needs_rate, etc.)
 * - `route:confirm` — the confirm override (clears reasons + advances)
 * - `flag_back` — flagToUncertain demotion
 * - `bulk_confirm` — bulk /bulk-confirm endpoint
 */
export type DecisionAction =
  | `advance:${string}`
  | `route:${string}`
  | "flag_back"
  | "bulk_confirm";

export interface RecordDecisionParams {
  assignmentId: number;
  action: DecisionAction;
  userId: number;
  notes?: string;
  /**
   * Score captured BEFORE the action ran. Callers compute this from the
   * pre-action features so the tuner learns against "what the scorer thought
   * when the human disagreed (or agreed)".
   */
  featuresBefore: MatchFeatures;
  scoreBefore: MatchScore;
  /** Score captured AFTER the action, if we re-scored. Optional. */
  featuresAfter?: MatchFeatures;
  scoreAfter?: MatchScore;
}

/**
 * Write a match_decisions row. Best-effort: failures are caught by the
 * caller and logged. Never throw from here into a route response.
 */
export async function recordDecision(
  db: Database,
  params: RecordDecisionParams,
): Promise<void> {
  // Derive loadId from the assignment — avoids requiring the caller to pass it
  const [link] = await db
    .select({ loadId: assignments.loadId })
    .from(assignments)
    .where(eq(assignments.id, params.assignmentId))
    .limit(1);
  if (!link) return; // assignment deleted between action and record — silently drop

  await db.insert(matchDecisions).values({
    assignmentId: params.assignmentId,
    loadId: link.loadId,
    userId: params.userId,
    action: params.action,
    featuresSnapshot: params.featuresBefore as unknown as Record<
      string,
      unknown
    >,
    scoreBefore: params.scoreBefore.score.toFixed(3),
    scoreAfter: params.scoreAfter?.score.toFixed(3) ?? null,
    tierBefore: params.scoreBefore.tier,
    tierAfter: params.scoreAfter?.tier ?? null,
    notes: params.notes ?? null,
  });
}

/**
 * Convenience: look up an assignment's current feature vector + score. Used
 * by route handlers to capture the before-state in one call.
 *
 * Returns null if the assignment doesn't exist (route handler will 404).
 */
export async function snapshotAssignmentScore(
  db: Database,
  assignmentId: number,
): Promise<{ features: MatchFeatures; score: MatchScore } | null> {
  const [row] = await db
    .select({
      bolNo: loads.bolNo,
      ticketNo: loads.ticketNo,
      rate: loads.rate,
      wellId: assignments.wellId,
      driverName: loads.driverName,
      photoStatus: assignments.photoStatus,
      deliveredOn: loads.deliveredOn,
      autoMapTier: assignments.autoMapTier,
      uncertainReasons: assignments.uncertainReasons,
      loadWeightLbs: loads.weightLbs,
      loadTruckNo: loads.truckNo,
      loadCarrierName: loads.carrierName,
      ocrBolNo: sql<
        string | null
      >`(SELECT ${bolSubmissions.aiExtractedData}->>'bolNo' FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)`,
      ocrWeightLbs: sql<
        number | null
      >`(SELECT (${bolSubmissions.aiExtractedData}->>'weight')::numeric FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)`,
      ocrGrossWeightLbs: sql<
        number | null
      >`(SELECT (${bolSubmissions.aiExtractedData}->>'grossWeight')::numeric FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)`,
      ocrTareWeightLbs: sql<
        number | null
      >`(SELECT (${bolSubmissions.aiExtractedData}->>'tareWeight')::numeric FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)`,
      ocrTruckNo: sql<
        string | null
      >`(SELECT ${bolSubmissions.aiExtractedData}->>'truckNo' FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)`,
      ocrCarrierName: sql<
        string | null
      >`(SELECT ${bolSubmissions.aiExtractedData}->>'carrier' FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)`,
      ocrNotes: sql<
        string | null
      >`(SELECT ${bolSubmissions.aiExtractedData}->>'notes' FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)`,
      ocrOverallConfidence: sql<
        number | null
      >`(SELECT (${bolSubmissions.aiExtractedData}->>'overallConfidence')::numeric FROM ${bolSubmissions} WHERE ${bolSubmissions.matchedLoadId} = ${loads.id} ORDER BY ${bolSubmissions.id} DESC LIMIT 1)`,
    })
    .from(assignments)
    .leftJoin(loads, eq(loads.id, assignments.loadId))
    .where(eq(assignments.id, assignmentId))
    .limit(1);

  if (!row) return null;

  // Phase 5c: pull the driver roster once for fuzzy similarity
  const rosterRows = await db
    .selectDistinct({ canonicalName: driverCrossrefs.canonicalName })
    .from(driverCrossrefs);
  const driverRoster: readonly string[] = rosterRows.map(
    (rr) => rr.canonicalName,
  );

  const features = extractMatchFeatures({
    bolNo: row.bolNo ?? null,
    ticketNo: row.ticketNo ?? null,
    rate: row.rate ?? null,
    wellId: row.wellId,
    driverName: row.driverName ?? null,
    photoStatus: row.photoStatus,
    deliveredOn: row.deliveredOn ?? null,
    autoMapTier: row.autoMapTier,
    uncertainReasons: (row.uncertainReasons ?? []) as string[],
    ocrBolNo: row.ocrBolNo,
    ocrWeightLbs: row.ocrWeightLbs != null ? Number(row.ocrWeightLbs) : null,
    loadWeightLbs:
      row.loadWeightLbs != null ? Number(row.loadWeightLbs) : null,
    driverRoster,
    // Phase 6
    loadTruckNo: row.loadTruckNo ?? null,
    loadCarrierName: row.loadCarrierName ?? null,
    ocrTruckNo: row.ocrTruckNo,
    ocrCarrierName: row.ocrCarrierName,
    ocrGrossWeightLbs:
      row.ocrGrossWeightLbs != null ? Number(row.ocrGrossWeightLbs) : null,
    ocrTareWeightLbs:
      row.ocrTareWeightLbs != null ? Number(row.ocrTareWeightLbs) : null,
    ocrNotes: row.ocrNotes,
    ocrOverallConfidence:
      row.ocrOverallConfidence != null
        ? Number(row.ocrOverallConfidence)
        : null,
  });
  const score = scoreMatch(features);
  return { features, score };
}
