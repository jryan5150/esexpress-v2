import { sql, type SQL } from "drizzle-orm";
import { loads } from "../../../db/schema.js";

export type Era = "live" | "archive";

/**
 * 2026-01-01T00:00:00 CDT (America/Chicago, DST) as ISO string.
 *
 * History: was 2026-01-01 originally → bumped to 2026-04-01 on 2026-04-14
 * after the team said Jan-Mar PropX/Logistiq were already reconciled
 * outside v2 → reset back to 2026-01-01 on 2026-04-24 after operator
 * confirmed they want the entire Jan-onward operational year visible
 * in the workbench (the cross-check loop now provides the validation
 * coverage that used to be manual reconciliation).
 *
 * Live era: deliveredOn >= 2026-01-01 → workbench, dispatch desk,
 * cross-check discrepancies. Archive era: deliveredOn < 2026-01-01 →
 * archive search page, retained for audit.
 */
export const ERA_CUTOFF = "2026-01-01T00:00:00-05:00";

/** Reconstruct the raw SQL text from Drizzle queryChunks for introspection. */
function sqlToString(s: SQL): string {
  return (s.queryChunks as Array<{ value?: string[] } | string>)
    .map((c) =>
      c &&
      typeof c === "object" &&
      Array.isArray((c as { value?: string[] }).value)
        ? (c as { value: string[] }).value.join("")
        : "",
    )
    .join("");
}

/**
 * Returns a Drizzle SQL condition that filters loads by era.
 * - 'live' (default): delivered_on >= ERA_CUTOFF (currently 2026-01-01)
 * - 'archive': delivered_on < ERA_CUTOFF
 *
 * Fails closed: unknown era values default to live.
 */
export function eraFilter(era: string | undefined): SQL {
  const condition =
    era === "archive"
      ? sql`${loads.deliveredOn} < ${ERA_CUTOFF}`
      : sql`${loads.deliveredOn} >= ${ERA_CUTOFF}`;

  // Attach a readable toString so callers can inspect the operator.
  condition.toString = () => sqlToString(condition);
  return condition;
}

/** Parse and validate era query param */
export function parseEra(value: string | undefined): Era {
  return value === "archive" ? "archive" : "live";
}
