/**
 * Cross-check / discrepancy detection.
 *
 * Compares each matched PCS load against its v2 counterpart and persists
 * discrepancies into the `discrepancies` table. Open discrepancies are
 * upserted (one per subject_key+type); when a previously-open discrepancy
 * is no longer detected, it gets `resolved_at = now()` so the history
 * survives.
 *
 * Six discrepancy types — see schema.ts DISCREPANCY_TYPES.
 *
 * Called from pcs-sync.service.ts inside the matched-loop, plus a
 * post-loop sweep for orphan_destination (v2-internal aggregate).
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import {
  assignments,
  discrepancies,
  loads,
  wells,
} from "../../../db/schema.js";
import { similarityScore, normalizeName } from "../../dispatch/lib/fuzzy.js";

const ORPHAN_SUGGESTION_THRESHOLD = 0.6;

interface PcsLoadSummary {
  status?: string | null;
  totalWeight?: string | number | null;
  loadReference?: string | null;
}

interface PcsConsigneeStop {
  companyName?: string | null;
}

interface PcsRating {
  lineHaulRate?: string | number | null;
}

interface PcsLoadFullDetail extends PcsLoadSummary {
  rating?: PcsRating | null;
  documents?: Array<{ type?: string | null }> | null;
}

interface ComputedDiscrepancy {
  subjectKey: string;
  assignmentId: number | null;
  loadId: number | null;
  discrepancyType:
    | "status_drift"
    | "weight_drift"
    | "well_mismatch"
    | "photo_gap"
    | "rate_drift"
    | "orphan_destination";
  severity: "info" | "warning" | "critical";
  v2Value: string | null;
  pcsValue: string | null;
  message: string;
  metadata?: Record<string, unknown>;
}

// PCS status → expected v2 handler_stage(s). When PCS state would only be
// reached AFTER v2 has done some work, we list the v2 stages that COULD
// be valid alongside it. Anything else = drift.
const STATUS_COMPATIBILITY: Record<string, ReadonlyArray<string>> = {
  Dispatched: ["ready_to_build", "building", "cleared"],
  Arrived: ["cleared", "building", "ready_to_build"],
  Cancelled: ["uncertain", "cleared"], // cleared OK if v2 saw the cancel and processed
  Posted: ["ready_to_build", "building", "cleared"],
  Available: ["uncertain", "ready_to_build"],
};

const WEIGHT_DRIFT_TOLERANCE = 0.05; // 5% relative difference threshold
const RATE_DRIFT_TOLERANCE = 0.05;
const ORPHAN_DEST_THRESHOLD = 3; // alert when 3+ loads share an unmapped destination

/**
 * Per-matched-load compute. Called once per matched (assignmentId, pl)
 * pair from inside pcs-sync's matched-loop. Returns the computed open
 * discrepancies; caller is responsible for persisting via persistOpen.
 */
export function computePerLoadDiscrepancies(args: {
  assignmentId: number;
  loadId: number;
  v2HandlerStage: string | null;
  v2WeightLbs: number | null;
  v2WellName: string | null;
  v2WellAliases: string[] | null;
  v2WellRatePerTon: number | null;
  pcs: PcsLoadSummary;
  pcsConsigneeCompany: string | null;
  pcsRating: PcsRating | null;
}): ComputedDiscrepancy[] {
  const out: ComputedDiscrepancy[] = [];
  const subjectKey = `assignment:${args.assignmentId}`;
  const base = {
    subjectKey,
    assignmentId: args.assignmentId,
    loadId: args.loadId,
  };

  // status_drift
  const pcsStatus = args.pcs.status?.trim() ?? null;
  const v2Stage = args.v2HandlerStage;
  if (pcsStatus && v2Stage) {
    const compatible = STATUS_COMPATIBILITY[pcsStatus];
    if (compatible && !compatible.includes(v2Stage)) {
      out.push({
        ...base,
        discrepancyType: "status_drift",
        severity: pcsStatus === "Cancelled" ? "warning" : "info",
        v2Value: v2Stage,
        pcsValue: pcsStatus,
        message: `v2 has this load at ${v2Stage}; PCS shows ${pcsStatus}.`,
      });
    }
  }

  // weight_drift
  const pcsWeightRaw = args.pcs.totalWeight;
  const pcsWeight =
    pcsWeightRaw == null
      ? null
      : typeof pcsWeightRaw === "string"
        ? Number.parseFloat(pcsWeightRaw)
        : pcsWeightRaw;
  if (
    args.v2WeightLbs != null &&
    pcsWeight != null &&
    Number.isFinite(pcsWeight) &&
    Number.isFinite(args.v2WeightLbs)
  ) {
    const max = Math.max(Math.abs(args.v2WeightLbs), Math.abs(pcsWeight));
    if (max > 0) {
      const drift = Math.abs(args.v2WeightLbs - pcsWeight) / max;
      if (drift > WEIGHT_DRIFT_TOLERANCE) {
        out.push({
          ...base,
          discrepancyType: "weight_drift",
          severity: drift > 0.15 ? "warning" : "info",
          v2Value: `${args.v2WeightLbs} lbs`,
          pcsValue: `${pcsWeight} lbs`,
          message: `Weight differs by ${(drift * 100).toFixed(1)}% — v2 ${args.v2WeightLbs} lbs vs PCS ${pcsWeight} lbs.`,
          metadata: { driftPct: drift },
        });
      }
    }
  }

  // well_mismatch
  if (args.v2WellName && args.pcsConsigneeCompany) {
    const v2Lower = args.v2WellName.toLowerCase().trim();
    const pcsLower = args.pcsConsigneeCompany.toLowerCase().trim();
    const aliases = (args.v2WellAliases ?? []).map((a) =>
      a.toLowerCase().trim(),
    );
    const matches =
      v2Lower === pcsLower ||
      aliases.includes(pcsLower) ||
      v2Lower.includes(pcsLower) ||
      pcsLower.includes(v2Lower);
    if (!matches) {
      out.push({
        ...base,
        discrepancyType: "well_mismatch",
        severity: "warning",
        v2Value: args.v2WellName,
        pcsValue: args.pcsConsigneeCompany,
        message: `v2 maps this load to "${args.v2WellName}"; PCS billed it to "${args.pcsConsigneeCompany}".`,
      });
    }
  }

  // rate_drift
  const pcsRate =
    args.pcsRating?.lineHaulRate == null
      ? null
      : typeof args.pcsRating.lineHaulRate === "string"
        ? Number.parseFloat(args.pcsRating.lineHaulRate)
        : args.pcsRating.lineHaulRate;
  if (
    args.v2WellRatePerTon != null &&
    pcsRate != null &&
    Number.isFinite(pcsRate) &&
    Number.isFinite(args.v2WellRatePerTon) &&
    args.v2WellRatePerTon > 0 &&
    pcsRate > 0
  ) {
    const max = Math.max(args.v2WellRatePerTon, pcsRate);
    const drift = Math.abs(args.v2WellRatePerTon - pcsRate) / max;
    if (drift > RATE_DRIFT_TOLERANCE) {
      out.push({
        ...base,
        discrepancyType: "rate_drift",
        severity: drift > 0.2 ? "critical" : "warning",
        v2Value: `$${args.v2WellRatePerTon}/ton`,
        pcsValue: `$${pcsRate}/ton`,
        message: `Rate differs by ${(drift * 100).toFixed(1)}% — v2 expects $${args.v2WellRatePerTon}/ton vs PCS billed $${pcsRate}/ton.`,
        metadata: { driftPct: drift },
      });
    }
  }

  return out;
}

/**
 * Persist a batch of computed discrepancies for a single subject.
 * Strategy: upsert each computed (insert if no open one of same type,
 * else update last_seen_at + values), then resolve any previously-open
 * discrepancies for this subject whose types are NOT in the computed set
 * (signal that the disagreement healed).
 *
 * `coveredTypes` lists which discrepancy types were actually evaluated
 * in this run. Only previously-open discrepancies of these types get
 * auto-resolved — a type that wasn't evaluated this run shouldn't be
 * spuriously closed.
 */
export async function persistDiscrepancies(
  db: Database,
  subjectKey: string,
  computed: ComputedDiscrepancy[],
  coveredTypes: ReadonlyArray<ComputedDiscrepancy["discrepancyType"]>,
): Promise<{ inserted: number; updated: number; resolved: number }> {
  let inserted = 0;
  let updated = 0;
  const now = new Date();
  const computedTypes = new Set(computed.map((c) => c.discrepancyType));

  for (const c of computed) {
    const result = await db
      .insert(discrepancies)
      .values({
        subjectKey: c.subjectKey,
        assignmentId: c.assignmentId,
        loadId: c.loadId,
        discrepancyType: c.discrepancyType,
        severity: c.severity,
        v2Value: c.v2Value,
        pcsValue: c.pcsValue,
        message: c.message,
        metadata: c.metadata ?? {},
        detectedAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [discrepancies.subjectKey, discrepancies.discrepancyType],
        targetWhere: isNull(discrepancies.resolvedAt),
        set: {
          severity: c.severity,
          v2Value: c.v2Value,
          pcsValue: c.pcsValue,
          message: c.message,
          metadata: c.metadata ?? {},
          lastSeenAt: now,
        },
      })
      .returning({
        id: discrepancies.id,
        insertedAt: discrepancies.detectedAt,
      });
    if (result[0]) {
      // crude inserted vs updated — if detected_at == now (within 1s),
      // it was an insert
      const isInsert =
        Math.abs(result[0].insertedAt.getTime() - now.getTime()) < 1000;
      if (isInsert) inserted += 1;
      else updated += 1;
    }
  }

  // Auto-resolve types we evaluated but didn't find this run
  const typesToCheck = coveredTypes.filter((t) => !computedTypes.has(t));
  let resolved = 0;
  if (typesToCheck.length > 0) {
    const resolvedRows = await db
      .update(discrepancies)
      .set({
        resolvedAt: now,
        resolutionNotes: "auto-resolved: no longer detected by sync",
      })
      .where(
        and(
          eq(discrepancies.subjectKey, subjectKey),
          isNull(discrepancies.resolvedAt),
          sql`${discrepancies.discrepancyType} = ANY(${sql.raw(`ARRAY[${typesToCheck.map((t) => `'${t}'`).join(",")}]::text[]`)})`,
        ),
      )
      .returning({ id: discrepancies.id });
    resolved = resolvedRows.length;
  }

  return { inserted, updated, resolved };
}

/**
 * Aggregate sweep — orphan_destination. v2-internal: finds destination
 * names with 3+ loads where no well_id is mapped on the assignment.
 * Subject key per destination, not per assignment.
 */
export async function sweepOrphanDestinations(
  db: Database,
): Promise<{ created: number; resolved: number }> {
  const orphans = await db
    .select({
      destination: loads.destinationName,
      orphanCount: sql<number>`COUNT(*)::int`,
    })
    .from(loads)
    .leftJoin(assignments, eq(assignments.loadId, loads.id))
    .where(
      and(
        sql`${loads.destinationName} IS NOT NULL`,
        sql`${loads.destinationName} != ''`,
        isNull(assignments.wellId),
      ),
    )
    .groupBy(loads.destinationName)
    .having(sql`COUNT(*) >= ${ORPHAN_DEST_THRESHOLD}`);

  // Pull all wells once for fuzzy-match suggestions. Cheap (95 wells today).
  const allWells = await db
    .select({
      id: wells.id,
      name: wells.name,
      aliases: wells.aliases,
    })
    .from(wells);
  type WellCandidate = { id: number; name: string; candidate: string };
  const candidates: WellCandidate[] = [];
  for (const w of allWells) {
    candidates.push({
      id: w.id,
      name: w.name,
      candidate: normalizeName(w.name),
    });
    if (Array.isArray(w.aliases)) {
      for (const a of w.aliases) {
        if (typeof a === "string") {
          candidates.push({
            id: w.id,
            name: w.name,
            candidate: normalizeName(a),
          });
        }
      }
    }
  }

  function suggestWell(
    destination: string,
  ): { wellId: number; wellName: string; score: number } | undefined {
    const target = normalizeName(destination);
    if (!target) return undefined;
    let best: { wellId: number; wellName: string; score: number } | undefined;
    for (const c of candidates) {
      const score = similarityScore(target, c.candidate);
      if (
        score >= ORPHAN_SUGGESTION_THRESHOLD &&
        (!best || score > best.score)
      ) {
        best = { wellId: c.id, wellName: c.name, score };
      }
    }
    return best;
  }

  const now = new Date();
  let created = 0;
  for (const o of orphans) {
    if (!o.destination) continue;
    const subjectKey = `destination:${o.destination}`;
    const suggestion = suggestWell(o.destination);
    const message = suggestion
      ? `${o.orphanCount} loads point to "${o.destination}". Closest existing well is "${suggestion.wellName}" (${Math.round(suggestion.score * 100)}% match) — alias it there if it's the same well, or add as a new well.`
      : `${o.orphanCount} loads point to "${o.destination}" but no well is mapped. Add it to the wells master.`;
    const computed: ComputedDiscrepancy = {
      subjectKey,
      assignmentId: null,
      loadId: null,
      discrepancyType: "orphan_destination",
      severity: o.orphanCount >= 10 ? "warning" : "info",
      v2Value: null,
      pcsValue: o.destination,
      message,
      metadata: {
        orphanCount: o.orphanCount,
        ...(suggestion ? { suggestedWell: suggestion } : {}),
      },
    };
    const result = await db
      .insert(discrepancies)
      .values({
        subjectKey: computed.subjectKey,
        assignmentId: null,
        loadId: null,
        discrepancyType: computed.discrepancyType,
        severity: computed.severity,
        v2Value: null,
        pcsValue: computed.pcsValue,
        message: computed.message,
        metadata: computed.metadata,
        detectedAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [discrepancies.subjectKey, discrepancies.discrepancyType],
        targetWhere: isNull(discrepancies.resolvedAt),
        set: {
          severity: computed.severity,
          message: computed.message,
          metadata: computed.metadata,
          lastSeenAt: now,
        },
      })
      .returning({
        id: discrepancies.id,
        insertedAt: discrepancies.detectedAt,
      });
    if (result[0]) {
      const isInsert =
        Math.abs(result[0].insertedAt.getTime() - now.getTime()) < 1000;
      if (isInsert) created += 1;
    }
  }

  // Resolve orphan_destination discrepancies whose destination is now mapped
  // (i.e. no longer in the orphan list)
  const stillOrphanKeys = new Set(
    orphans
      .filter((o) => o.destination)
      .map((o) => `destination:${o.destination}`),
  );
  const openOrphans = await db
    .select({ id: discrepancies.id, subjectKey: discrepancies.subjectKey })
    .from(discrepancies)
    .where(
      and(
        eq(discrepancies.discrepancyType, "orphan_destination"),
        isNull(discrepancies.resolvedAt),
      ),
    );
  const toResolve = openOrphans
    .filter((d) => !stillOrphanKeys.has(d.subjectKey))
    .map((d) => d.id);
  let resolved = 0;
  if (toResolve.length > 0) {
    const r = await db
      .update(discrepancies)
      .set({
        resolvedAt: now,
        resolutionNotes: "auto-resolved: destination is now mapped to a well",
      })
      .where(inArray(discrepancies.id, toResolve))
      .returning({ id: discrepancies.id });
    resolved = r.length;
  }

  return { created, resolved };
}
