import { eq, and, sql } from "drizzle-orm";
import { loads, assignments } from "../../../db/schema.js";
import type { Database } from "../../../db/client.js";
import type { SuggestionResult } from "../services/suggestion.service.js";

/**
 * Anti-hallucination rules for the auto-mapper. Precision over recall.
 *
 * Philosophy: a false-positive auto-match creates silent data corruption
 * the team has to catch later. A correctly-flagged uncertain match is a
 * 30-second manual review. Optimize for precision.
 *
 * Applied in order, each rule can demote a tier (never promote):
 *   1. Fuzzy-never-alone — fuzzy-only matches cannot auto-confirm
 *   2. Two-independent-identifier — Tier 1 requires 2+ signals
 *   3. Confidence floor (0.85) — below the floor, never Tier 1
 *
 * Every demotion is recorded in the audit trail with a human-readable
 * reason so Jessica can see WHY a match was not auto-confirmed.
 */

export const CONFIDENCE_FLOOR = 0.85;

export type RuleName =
  | "fuzzy_never_alone"
  | "two_independent_identifiers"
  | "confidence_floor"
  | "cross_source_boost";

export interface MatchAudit {
  suggestion: {
    wellId: number;
    wellName: string;
    matchType: string;
    score: number;
  };
  alternatives: Array<{
    wellId: number;
    wellName: string;
    matchType: string;
    score: number;
  }>;
  evidence: {
    exactNameMatch: boolean;
    exactAliasMatch: boolean;
    propxJobIdMatch: boolean;
    fuzzyMatch: boolean;
    confirmedMapping: boolean;
    crossSourceBoost: boolean;
    aboveConfidenceFloor: boolean;
  };
  tierBeforeRules: 1 | 2 | 3;
  tierAfterRules: 1 | 2 | 3;
  rulesApplied: RuleName[];
  reason: string;
}

/**
 * Rule 1: fuzzy-never-alone.
 * A fuzzy match cannot auto-confirm without an exact identifier backing it.
 * Demotes Tier 1 to Tier 2 when the match type is fuzzy-only.
 */
export function applyFuzzyNeverAlone(
  tier: 1 | 2 | 3,
  matchType: string,
): { tier: 1 | 2 | 3; demoted: boolean } {
  if (
    tier === 1 &&
    (matchType === "fuzzy_name" || matchType === "fuzzy_alias")
  ) {
    return { tier: 2, demoted: true };
  }
  return { tier, demoted: false };
}

/**
 * Rule 2: two-independent-identifier rule.
 * Tier 1 auto-confirm requires at least 2 of these signals:
 *   - Confirmed mapping (human previously approved this destination→well)
 *   - PropX job ID exact match
 *   - Destination name exact match (via exact_name or exact_alias)
 *   - Cross-source BOL corroboration (same BOL in another source)
 *
 * A load with only one signal (even an exact one) drops to Tier 2 for
 * human review. This is the single biggest false-positive prevention.
 *
 * EXCEPTION (2026-04-22): a confirmed_mapping alone is sufficient — that's
 * an explicit human approval of this destination→well pairing, and demoting
 * it to Tier 2 re-asks the same human for the same approval.
 *
 * EXCEPTION (2026-04-23): an exact_alias match alone is sufficient when the
 * alias was human-curated. Our alias corpus came from Jessica's explicit
 * reply + flywheel-surfaced human-review candidates. Treating it as
 * "untrusted" re-asks for approval we already have. This aligns the rule
 * with how the anti-hallucination concern actually applies: fuzzy matches
 * are the risk, exact curated matches are not.
 *
 * Pre-fix symptom: full-corpus backfill produced Tier 1 = 0 because most
 * loads only have 1 source (PropX OR Logistiq, not both), so crossSourceBoost
 * is false → exact_name alone was getting demoted to Tier 2.
 */
export function applyTwoIdentifierRule(
  tier: 1 | 2 | 3,
  evidence: MatchAudit["evidence"],
): { tier: 1 | 2 | 3; demoted: boolean; signalCount: number } {
  const signals = [
    evidence.confirmedMapping,
    evidence.propxJobIdMatch,
    evidence.exactNameMatch || evidence.exactAliasMatch,
    evidence.crossSourceBoost,
  ];
  const signalCount = signals.filter(Boolean).length;

  // Single-signal exceptions that bypass the two-identifier requirement.
  // Each exception's safety is backed by a specific database invariant:
  if (tier === 1 && signalCount === 1) {
    if (evidence.confirmedMapping) {
      // Human previously approved this destination→well pairing.
      return { tier: 1, demoted: false, signalCount };
    }
    if (evidence.exactAliasMatch) {
      // Aliases are human-curated (Jessica's reply, flywheel-reviewed).
      return { tier: 1, demoted: false, signalCount };
    }
    if (evidence.propxJobIdMatch) {
      // Upstream system-generated UUID — distinct per well in PropX.
      return { tier: 1, demoted: false, signalCount };
    }
    if (evidence.exactNameMatch) {
      // wells.name carries a UNIQUE constraint — an exact normalized-name
      // match is guaranteed to resolve to exactly one well. False-positive
      // risk is zero by schema invariant.
      return { tier: 1, demoted: false, signalCount };
    }
  }

  if (tier === 1 && signalCount < 2) {
    return { tier: 2, demoted: true, signalCount };
  }
  return { tier, demoted: false, signalCount };
}

/**
 * Rule 3: confidence floor.
 * Never auto-confirm a match below 0.85 score, regardless of match type.
 * Bounds-check on the computed confidence.
 */
export function applyConfidenceFloor(
  tier: 1 | 2 | 3,
  score: number,
  floor = CONFIDENCE_FLOOR,
): { tier: 1 | 2 | 3; demoted: boolean } {
  if (tier === 1 && score < floor) {
    return { tier: 2, demoted: true };
  }
  return { tier, demoted: false };
}

/**
 * Cross-source corroboration check: has the same BOL already been matched
 * to a well by a different source? This is free signal — two independent
 * ingest paths agreeing on the same physical delivery.
 *
 * Returns true when another source has this BOL already assigned to a well.
 * Used as an additional "independent identifier" in Rule 2.
 */
export async function computeCrossSourceBoost(
  db: Database,
  load: { id: number; source: string; bolNo: string | null },
): Promise<boolean> {
  if (!load.bolNo?.trim()) return false;

  const [match] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(loads)
    .innerJoin(assignments, eq(assignments.loadId, loads.id))
    .where(
      and(
        eq(loads.bolNo, load.bolNo),
        sql`${loads.source} <> ${load.source}`,
        sql`${loads.id} <> ${load.id}`,
      ),
    );

  return (match?.count ?? 0) > 0;
}

/**
 * Build the evidence object from a suggestion + load context.
 */
export function buildEvidence(
  suggestion: SuggestionResult,
  hasCrossSourceBoost: boolean,
  confirmedMapping: boolean,
): MatchAudit["evidence"] {
  return {
    exactNameMatch: suggestion.matchType === "exact_name",
    exactAliasMatch: suggestion.matchType === "exact_alias",
    propxJobIdMatch: suggestion.matchType === "propx_job_id",
    fuzzyMatch:
      suggestion.matchType === "fuzzy_name" ||
      suggestion.matchType === "fuzzy_alias",
    confirmedMapping,
    crossSourceBoost: hasCrossSourceBoost,
    aboveConfidenceFloor: suggestion.score >= CONFIDENCE_FLOOR,
  };
}

/**
 * Compose a human-readable explanation of the tier decision.
 * Displayed in the load drawer so Jessica can see why the system chose
 * a match (or didn't auto-confirm it).
 */
export function explainTier(audit: MatchAudit): string {
  const parts: string[] = [];
  const e = audit.evidence;

  if (audit.tierAfterRules === 1) {
    if (e.confirmedMapping) parts.push("confirmed mapping");
    if (e.propxJobIdMatch) parts.push("PropX job ID match");
    if (e.exactNameMatch) parts.push("exact well name match");
    if (e.exactAliasMatch) parts.push("exact alias match");
    if (e.crossSourceBoost) parts.push("cross-source BOL corroboration");
    return `Tier 1 (auto-confirmed): ${parts.join(" + ")}`;
  }

  const demotions: string[] = [];
  if (audit.rulesApplied.includes("fuzzy_never_alone")) {
    demotions.push("fuzzy match requires exact backing");
  }
  if (audit.rulesApplied.includes("two_independent_identifiers")) {
    demotions.push("needs 2+ independent identifiers");
  }
  if (audit.rulesApplied.includes("confidence_floor")) {
    demotions.push(
      `score ${audit.suggestion.score.toFixed(2)} below floor ${CONFIDENCE_FLOOR}`,
    );
  }

  if (audit.tierAfterRules === 2) {
    const matchDesc = e.fuzzyMatch
      ? `fuzzy match (${audit.suggestion.score.toFixed(2)})`
      : `${audit.suggestion.matchType} (${audit.suggestion.score.toFixed(2)})`;
    return `Tier 2 (review): ${matchDesc}${demotions.length ? ` — demoted: ${demotions.join(", ")}` : ""}`;
  }

  return `Tier 3 (manual): ${audit.suggestion.matchType === "unresolved" ? "no well match found" : `low confidence (${audit.suggestion.score.toFixed(2)})`}`;
}
