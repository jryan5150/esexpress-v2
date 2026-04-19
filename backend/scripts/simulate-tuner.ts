/**
 * Simulate a Phase 3 tuner pass on the seeded dev DB.
 *
 * Approach: treat every seed row as a labeled decision — rows in handler_stage
 * ∈ {ready_to_build, building, entered, cleared} are "confident" (label=1),
 * rows in 'uncertain' are "skeptical" (label=0). Fit the scorer's 9 weights
 * via gradient descent on a mean-squared-error objective against these labels,
 * holding BASE_SCORE and per-feature value mappings constant (tuner only moves
 * weights, not the normalization layer).
 *
 * Outputs baseline vs. tuned weights + post-tuning scorer accuracy.
 *
 * Not production code — a demonstration that labeled decisions → weight
 * improvement works with the existing scoring architecture.
 *
 *   cd backend && tsx scripts/simulate-tuner.ts
 */

import postgres from "postgres";
import {
  scoreMatch,
  DEFAULT_CONFIG,
  type ScorerConfig,
  type MatchFeatures,
} from "../src/plugins/dispatch/services/match-scorer.service.js";
import { extractMatchFeatures } from "../src/plugins/dispatch/services/match-features.service.js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:dev@localhost:5434/esexpress";

const sql = postgres(DATABASE_URL, { prepare: false });

interface LabeledExample {
  features: MatchFeatures;
  label: 0 | 1; // 1 = confident stage, 0 = uncertain
}

async function loadExamples(): Promise<LabeledExample[]> {
  const rows = await sql`
    SELECT
      a.id, a.handler_stage, a.auto_map_tier, a.photo_status,
      a.uncertain_reasons, a.well_id,
      l.bol_no, l.ticket_no, l.rate, l.driver_name, l.delivered_on,
      l.weight_lbs AS load_weight_lbs,
      (SELECT bs.ai_extracted_data->>'bolNo' FROM bol_submissions bs
       WHERE bs.matched_load_id = l.id ORDER BY bs.id DESC LIMIT 1)
        AS ocr_bol_no,
      (SELECT (bs.ai_extracted_data->>'weight')::numeric FROM bol_submissions bs
       WHERE bs.matched_load_id = l.id ORDER BY bs.id DESC LIMIT 1)
        AS ocr_weight_lbs
    FROM assignments a
    LEFT JOIN loads l ON l.id = a.load_id
  `;

  return rows.map((r: Record<string, unknown>) => {
    const features = extractMatchFeatures({
      bolNo: r.bol_no as string | null,
      ticketNo: r.ticket_no as string | null,
      rate: r.rate as string | null,
      wellId: r.well_id as number | null,
      driverName: r.driver_name as string | null,
      photoStatus: r.photo_status as string | null,
      deliveredOn: r.delivered_on as Date | null,
      autoMapTier: r.auto_map_tier as number | null,
      uncertainReasons: (r.uncertain_reasons ?? []) as string[],
      ocrBolNo: (r.ocr_bol_no as string | null) ?? null,
      ocrWeightLbs:
        r.ocr_weight_lbs != null ? Number(r.ocr_weight_lbs) : null,
      loadWeightLbs:
        r.load_weight_lbs != null ? Number(r.load_weight_lbs) : null,
    });
    const stage = r.handler_stage as string;
    const label: 0 | 1 = stage === "uncertain" ? 0 : 1;
    return { features, label };
  });
}

function accuracy(examples: LabeledExample[], config: ScorerConfig): number {
  let correct = 0;
  for (const ex of examples) {
    const s = scoreMatch(ex.features, config);
    const pred = s.score >= 0.6 ? 1 : 0; // predict "confident" when score >= medium tier
    if (pred === ex.label) correct++;
  }
  return correct / examples.length;
}

/**
 * One pass of gradient descent on the weights. Loss = mean squared error
 * between predicted score and label. Gradient for a weight w_i is
 *   d loss / d w_i = mean( 2 * (score - label) * value_i )
 * where value_i is the feature's normalized value on that example.
 *
 * Clamps new weights to [0, 1] so the scorer stays interpretable
 * (all-positive contributions sum toward the score in a bounded way).
 */
function gradientStep(
  examples: LabeledExample[],
  config: ScorerConfig,
  lr: number,
): ScorerConfig {
  const featureKeys = Object.keys(DEFAULT_CONFIG.weights);
  const grads: Record<string, number> = Object.fromEntries(
    featureKeys.map((k) => [k, 0]),
  );

  for (const ex of examples) {
    const s = scoreMatch(ex.features, config);
    const err = s.score - ex.label;
    for (const d of s.drivers) {
      const key = d.feature as string;
      grads[key] = (grads[key] ?? 0) + 2 * err * d.value;
    }
  }

  const n = examples.length;
  const newWeights: Record<string, number> = { ...config.weights };
  for (const k of featureKeys) {
    newWeights[k] = Math.max(
      0,
      Math.min(1, (newWeights[k] ?? 0) - lr * (grads[k] / n)),
    );
  }
  return { ...config, weights: newWeights };
}

async function main() {
  const examples = await loadExamples();
  console.log(`\n=== Tuner simulation on ${examples.length} labeled examples ===`);
  console.log(
    `Labels: ${examples.filter((e) => e.label === 1).length} confident, ${examples.filter((e) => e.label === 0).length} uncertain\n`,
  );

  const baselineAcc = accuracy(examples, DEFAULT_CONFIG);
  console.log(`Baseline accuracy (default weights): ${(baselineAcc * 100).toFixed(1)}%`);
  console.log(`Baseline weights:`);
  for (const [k, v] of Object.entries(DEFAULT_CONFIG.weights)) {
    console.log(`  ${k.padEnd(20)} ${v.toFixed(3)}`);
  }

  // 200 iterations, learning rate 0.05 — converges quickly on 60 examples
  let config: ScorerConfig = DEFAULT_CONFIG;
  const checkpoints = [10, 50, 100, 200];
  let lastAcc = baselineAcc;
  for (let iter = 1; iter <= 200; iter++) {
    config = gradientStep(examples, config, 0.05);
    if (checkpoints.includes(iter)) {
      const acc = accuracy(examples, config);
      console.log(
        `\nAfter ${iter.toString().padStart(3)} iterations: ${(acc * 100).toFixed(1)}% accuracy (Δ +${((acc - baselineAcc) * 100).toFixed(1)}%)`,
      );
      lastAcc = acc;
    }
  }

  console.log(`\nTuned weights (after 200 iterations):`);
  for (const k of Object.keys(DEFAULT_CONFIG.weights)) {
    const before = DEFAULT_CONFIG.weights[k];
    const after = config.weights[k] ?? 0;
    const delta = after - before;
    const sign = delta >= 0 ? "+" : "";
    console.log(
      `  ${k.padEnd(20)} ${before.toFixed(3)} → ${after.toFixed(3)}   (${sign}${delta.toFixed(3)})`,
    );
  }

  // Tier distribution after tuning
  const tiers = { high: 0, medium: 0, low: 0, uncertain: 0 };
  for (const ex of examples) {
    const s = scoreMatch(ex.features, config);
    tiers[s.tier]++;
  }
  console.log(`\nTier distribution after tuning:`);
  for (const [tier, count] of Object.entries(tiers)) {
    const pct = ((count / examples.length) * 100).toFixed(1);
    console.log(`  ${tier.padEnd(10)} ${count.toString().padStart(2)} (${pct}%)`);
  }

  // What did the tuner say about each uncertain row?
  const uncertainRows = examples.filter((e) => e.label === 0);
  let scorerCaught = 0;
  for (const ex of uncertainRows) {
    const s = scoreMatch(ex.features, config);
    if (s.score < 0.6) scorerCaught++;
  }
  console.log(
    `\nUncertain-row detection: ${scorerCaught}/${uncertainRows.length} correctly scored below 0.6 after tuning`,
  );

  console.log(`\n=== Summary ===`);
  console.log(`  Baseline:        ${(baselineAcc * 100).toFixed(1)}%`);
  console.log(`  After tuning:    ${(lastAcc * 100).toFixed(1)}%`);
  console.log(`  Improvement:     +${((lastAcc - baselineAcc) * 100).toFixed(1)} percentage points`);
  console.log(
    `  ...on 60 examples. Production team generates ~50 decisions/day —`,
  );
  console.log(
    `  by day 14 the tuner has ~700 labels to work with, and by day 90 it`,
  );
  console.log(
    `  has 4500. Larger sample = higher confidence on weight estimates.`,
  );

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
