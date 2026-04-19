/**
 * Match Scorer — Phase 0 of matching-v2
 * =====================================
 *
 * Pure function. Takes the signals we already extract during ingest +
 * reconciliation and produces:
 *   - a continuous confidence score in [0, 1]
 *   - a per-feature contribution breakdown (the "why")
 *   - a coarse tier label for UI bucketing (backward compat)
 *
 * Design invariants:
 *   1. Deterministic: same features + config → same score, same drivers
 *   2. Explainable: score == BASE_SCORE + sum(drivers.contribution) pre-clamp
 *   3. Clamped to [0, 1] post-sum so runaway weights can't corrupt the scale
 *   4. Forward compatible: unknown keys in config.weights are ignored
 *
 * The weights in DEFAULT_CONFIG are intuition-driven starting values. Phase 3
 * replaces them with values learned from match_decisions row history via the
 * scorer-tuner service. No matcher code changes between Phase 0 and Phase 3 —
 * only the config source.
 */

const BASE_SCORE = 0.5;

export type BolMatch = "exact" | "last4" | "none";
export type TierLabel = "high" | "medium" | "low" | "uncertain";

export interface MatchFeatures {
  bolMatch: BolMatch;
  weightDeltaPct: number | null; // percent diff between load + OCR weight
  hasPhoto: boolean;
  driverSimilarity: number | null; // 0..1 fuzzy match on driver name
  autoMapTier: number; // 1, 2, 3, or 0 (no hit)
  wellAssigned: boolean;
  hasTicket: boolean;
  hasRate: boolean;
  deliveredRecent: boolean; // within last 30 days
}

export interface FeatureContribution {
  feature: keyof MatchFeatures;
  value: number; // the normalized signal in [-X, +X], feature-dependent
  weight: number; // the weight applied from config
  contribution: number; // value * weight
}

export interface ScorerConfig {
  weights: Record<string, number>;
  version?: number; // set when loaded from scorer_config table in Phase 3
}

export interface MatchScore {
  score: number; // clamped [0, 1]
  drivers: FeatureContribution[];
  tier: TierLabel;
}

export const DEFAULT_CONFIG: ScorerConfig = {
  weights: {
    bolMatch: 0.2,
    weightDeltaPct: 0.1,
    hasPhoto: 0.1,
    driverSimilarity: 0.08,
    autoMapTier: 0.08,
    wellAssigned: 0.08,
    hasTicket: 0.04,
    hasRate: 0.04,
    deliveredRecent: 0.04,
  },
};

// ---------------------------------------------------------------------------
// Per-feature normalization — each returns a value roughly in [-1, +1]
// (except wellAssigned whose "false" is an extra-strong signal).
// Scaling lets a uniform `contribution = value * weight` invariant hold.
// ---------------------------------------------------------------------------

function bolMatchValue(v: BolMatch): number {
  if (v === "exact") return 1.0;
  if (v === "last4") return 0.66;
  return -0.5; // "none" — partial penalty, not catastrophic
}

function weightDeltaValue(pct: number | null): number {
  if (pct === null) return 0;
  if (pct <= 5) return 1.0;
  if (pct <= 20) return 0.33;
  return -1.0;
}

function autoMapTierValue(tier: number): number {
  if (tier === 1) return 1.0;
  if (tier === 2) return 0.5;
  if (tier === 3) return 0;
  return -0.5; // 0 or unknown — no cascade hit
}

// ---------------------------------------------------------------------------
// Tier bucketing — boundary values go UP (>= 0.80 is high, not medium)
// ---------------------------------------------------------------------------

function tierFor(score: number): TierLabel {
  if (score >= 0.8) return "high";
  if (score >= 0.6) return "medium";
  if (score >= 0.4) return "low";
  return "uncertain";
}

// ---------------------------------------------------------------------------
// The scorer
// ---------------------------------------------------------------------------

export function scoreMatch(
  features: MatchFeatures,
  config: ScorerConfig = DEFAULT_CONFIG,
): MatchScore {
  const w = config.weights;

  const entries: FeatureContribution[] = [
    {
      feature: "bolMatch",
      value: bolMatchValue(features.bolMatch),
      weight: w.bolMatch ?? 0,
      contribution: 0,
    },
    {
      feature: "weightDeltaPct",
      value: weightDeltaValue(features.weightDeltaPct),
      weight: w.weightDeltaPct ?? 0,
      contribution: 0,
    },
    {
      feature: "hasPhoto",
      value: features.hasPhoto ? 1 : -0.66,
      weight: w.hasPhoto ?? 0,
      contribution: 0,
    },
    {
      feature: "driverSimilarity",
      value: features.driverSimilarity ?? 0,
      weight: w.driverSimilarity ?? 0,
      contribution: 0,
    },
    {
      feature: "autoMapTier",
      value: autoMapTierValue(features.autoMapTier),
      weight: w.autoMapTier ?? 0,
      contribution: 0,
    },
    {
      feature: "wellAssigned",
      // Absence of a well is load-blocking; the normalized value reflects that
      value: features.wellAssigned ? 1 : -2.5,
      weight: w.wellAssigned ?? 0,
      contribution: 0,
    },
    {
      feature: "hasTicket",
      value: features.hasTicket ? 1 : 0,
      weight: w.hasTicket ?? 0,
      contribution: 0,
    },
    {
      feature: "hasRate",
      value: features.hasRate ? 1 : 0,
      weight: w.hasRate ?? 0,
      contribution: 0,
    },
    {
      feature: "deliveredRecent",
      value: features.deliveredRecent ? 1 : 0,
      weight: w.deliveredRecent ?? 0,
      contribution: 0,
    },
  ];

  for (const e of entries) {
    e.contribution = e.value * e.weight;
  }

  const sum = entries.reduce((acc, e) => acc + e.contribution, 0);
  const raw = BASE_SCORE + sum;
  const score = Math.max(0, Math.min(1, raw));

  entries.sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution),
  );

  return {
    score,
    drivers: entries,
    tier: tierFor(score),
  };
}
