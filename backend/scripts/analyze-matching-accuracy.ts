/**
 * One-off: analyze matching-v2 accuracy against the seeded dev DB.
 * Not part of the build — run manually:
 *   cd backend && tsx scripts/analyze-matching-accuracy.ts
 *
 * Outputs: tier distribution, agreement with current handlerStage, score
 * histogram, projected learning-curve accuracy at 7/30/90/180 day marks.
 */

import postgres from "postgres";
import { scoreMatch } from "../src/plugins/dispatch/services/match-scorer.service.js";
import { extractMatchFeatures } from "../src/plugins/dispatch/services/match-features.service.js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:dev@localhost:5434/esexpress";

const sql = postgres(DATABASE_URL, { prepare: false });

interface Row {
  id: number;
  handler_stage: string;
  auto_map_tier: number | null;
  photo_status: string | null;
  uncertain_reasons: string[] | null;
  well_id: number | null;
  bol_no: string | null;
  ticket_no: string | null;
  rate: string | null;
  driver_name: string | null;
  delivered_on: Date | null;
}

async function main() {
  const rows = await sql`
    SELECT
      a.id,
      a.handler_stage,
      a.auto_map_tier,
      a.photo_status,
      a.uncertain_reasons,
      a.well_id,
      l.bol_no,
      l.ticket_no,
      l.rate,
      l.driver_name,
      l.delivered_on,
      l.weight_lbs AS load_weight_lbs,
      (
        SELECT bs.ai_extracted_data->>'bolNo'
        FROM bol_submissions bs
        WHERE bs.matched_load_id = l.id
        ORDER BY bs.id DESC
        LIMIT 1
      ) AS ocr_bol_no,
      (
        SELECT (bs.ai_extracted_data->>'weight')::numeric
        FROM bol_submissions bs
        WHERE bs.matched_load_id = l.id
        ORDER BY bs.id DESC
        LIMIT 1
      ) AS ocr_weight_lbs
    FROM assignments a
    LEFT JOIN loads l ON l.id = a.load_id
  ` as unknown as Array<Row & {
    load_weight_lbs: number | null;
    ocr_bol_no: string | null;
    ocr_weight_lbs: number | null;
  }>;

  console.log(`\n=== Matching v2 accuracy snapshot ===`);
  console.log(`Dataset: ${rows.length} seeded assignments\n`);

  // Score every row — Phase 5 pulls real OCR from bol_submissions
  const scored = rows.map((r) => {
    const features = extractMatchFeatures({
      bolNo: r.bol_no,
      ticketNo: r.ticket_no,
      rate: r.rate,
      wellId: r.well_id,
      driverName: r.driver_name,
      photoStatus: r.photo_status,
      deliveredOn: r.delivered_on,
      autoMapTier: r.auto_map_tier,
      uncertainReasons: (r.uncertain_reasons ?? []) as string[],
      ocrBolNo: r.ocr_bol_no,
      ocrWeightLbs:
        r.ocr_weight_lbs != null ? Number(r.ocr_weight_lbs) : null,
      loadWeightLbs:
        r.load_weight_lbs != null ? Number(r.load_weight_lbs) : null,
    });
    const score = scoreMatch(features);
    return { row: r, features, score };
  });

  const phase5Coverage = rows.filter((r) => r.ocr_bol_no !== null).length;
  console.log(
    `Phase 5 OCR coverage: ${phase5Coverage}/${rows.length} rows (${((phase5Coverage / rows.length) * 100).toFixed(1)}%)`,
  );

  // --- Tier distribution ---
  const tierCounts = { high: 0, medium: 0, low: 0, uncertain: 0 };
  for (const s of scored) tierCounts[s.score.tier]++;

  console.log("Tier distribution (computed scores):");
  for (const [tier, count] of Object.entries(tierCounts)) {
    const pct = ((count / rows.length) * 100).toFixed(1);
    const bar = "█".repeat(Math.round(count / 2));
    console.log(`  ${tier.padEnd(10)} ${count.toString().padStart(3)} (${pct}%)  ${bar}`);
  }

  // --- Agreement with current handlerStage ---
  //   high/medium → should be ready_to_build/building/entered/cleared
  //   low/uncertain → should be uncertain
  let agree = 0,
    disagree = 0;
  for (const s of scored) {
    const stage = s.row.handler_stage;
    const tier = s.score.tier;
    const inConfidentStage =
      stage === "ready_to_build" ||
      stage === "building" ||
      stage === "entered" ||
      stage === "cleared";
    const inUncertainStage = stage === "uncertain";

    const scorerConfident = tier === "high" || tier === "medium";
    const scorerSkeptical = tier === "low" || tier === "uncertain";

    if (
      (scorerConfident && inConfidentStage) ||
      (scorerSkeptical && inUncertainStage)
    ) {
      agree++;
    } else {
      disagree++;
    }
  }
  const accuracy = (agree / rows.length) * 100;
  console.log(`\nScorer-vs-human agreement:`);
  console.log(`  agree:    ${agree} (${accuracy.toFixed(1)}%)`);
  console.log(`  disagree: ${disagree} (${(100 - accuracy).toFixed(1)}%)`);
  console.log(
    `  baseline: default weights, no learning yet — this IS the pre-tuning line`,
  );

  // --- Score histogram (10 bins) ---
  console.log(`\nScore histogram (0.0 - 1.0, 10 bins):`);
  const bins = new Array(10).fill(0);
  for (const s of scored) {
    const i = Math.min(9, Math.floor(s.score.score * 10));
    bins[i]++;
  }
  for (let i = 0; i < 10; i++) {
    const lo = (i / 10).toFixed(1);
    const hi = ((i + 1) / 10).toFixed(1);
    const bar = "█".repeat(bins[i]);
    console.log(
      `  ${lo}-${hi}  ${bins[i].toString().padStart(3)}  ${bar}`,
    );
  }

  // --- Feature signal analysis ---
  console.log(`\nFeature signal coverage:`);
  const featureCounts = {
    hasBolMatch: 0,
    hasPhoto: 0,
    hasDriverSig: 0,
    hasWeightSig: 0,
    hasWellAssigned: 0,
    hasTicket: 0,
    hasRate: 0,
    deliveredRecent: 0,
  };
  for (const s of scored) {
    if (s.features.bolMatch !== "none") featureCounts.hasBolMatch++;
    if (s.features.hasPhoto) featureCounts.hasPhoto++;
    if (s.features.driverSimilarity !== null) featureCounts.hasDriverSig++;
    if (s.features.weightDeltaPct !== null) featureCounts.hasWeightSig++;
    if (s.features.wellAssigned) featureCounts.hasWellAssigned++;
    if (s.features.hasTicket) featureCounts.hasTicket++;
    if (s.features.hasRate) featureCounts.hasRate++;
    if (s.features.deliveredRecent) featureCounts.deliveredRecent++;
  }
  for (const [f, n] of Object.entries(featureCounts)) {
    const pct = ((n / rows.length) * 100).toFixed(1);
    console.log(`  ${f.padEnd(18)} ${n.toString().padStart(3)} / ${rows.length}  (${pct}%)`);
  }

  // --- Projected learning trajectory ---
  console.log(`\n=== Projected accuracy over time ===`);
  console.log(`Assumptions:`);
  console.log(`  - Team writes ~50 decisions/day (Jessica + 4 builders)`);
  console.log(`  - Tuner runs nightly, logistic regression on rolling 30d window`);
  console.log(`  - Convergence rate ~ 1/sqrt(N) on classification error`);
  console.log(`  - Theoretical ceiling: ~92-95% (label noise + feature gaps)`);
  console.log("");

  const baselineAccuracy = accuracy / 100;
  const ceiling = 0.93;
  const dailyDecisions = 50;
  const projections: Array<{ day: number; decisions: number; acc: number }> = [];
  for (const day of [0, 1, 7, 14, 30, 60, 90, 180]) {
    const decisions = day * dailyDecisions;
    // Simple asymptotic curve: starts at baseline, rises toward ceiling with
    // rate tied to sqrt(decisions). Not a rigorous ML model — a defensible
    // projection given what Tuner Phase 3 should deliver.
    const gap = ceiling - baselineAccuracy;
    const progress = 1 - 1 / Math.sqrt(1 + decisions / 100);
    const acc = baselineAccuracy + gap * progress;
    projections.push({ day, decisions, acc });
  }

  console.log("  day   decisions   projected acc   delta vs baseline");
  console.log("  ---   ---------   -------------   ----------------");
  for (const p of projections) {
    const pct = (p.acc * 100).toFixed(1);
    const delta = ((p.acc - baselineAccuracy) * 100).toFixed(1);
    const sign = Number(delta) >= 0 ? "+" : "";
    const bar = "▓".repeat(Math.round(p.acc * 40));
    console.log(
      `  ${p.day.toString().padStart(3)}   ${p.decisions.toString().padStart(5)}       ${pct.padStart(5)}%         ${sign}${delta}%   ${bar}`,
    );
  }

  console.log(`\nCaveats:`);
  console.log(`  - Baseline uses default weights (intuition-driven). Phase 3`);
  console.log(`    tuner tightens these from real decisions.`);
  console.log(`  - Phase 1 features are approximations (bol_mismatch proxy,`);
  console.log(`    binary driver sim). Phase 5 upgrades to OCR-based signals —`);
  console.log(`    expect another 3-5% ceiling lift.`);
  console.log(`  - Trajectory assumes Jessica + 4 builders rate consistently.`);
  console.log(`    Inter-rater disagreement (Phase 5+ analysis) is the risk.`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
