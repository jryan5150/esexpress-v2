/**
 * PCS Calibration Run — reconciles v2 against PCS as ground truth.
 *
 * PCS's GetLoads returns the customer's currently-open work (status=
 * Arrived, awaiting invoicing/finalization). For ES Express that's
 * ~44 loads at any given moment — the operational pipeline
 * Scout/Steph/Jessica are working through daily. Every one of these
 * SHOULD be in v2 on the right well. Any miss is a real gap.
 *
 * What this run produces:
 *   1. Per-PCS-load classification — perfect match, v2-has-on-wrong-well,
 *      not-in-v2, etc.
 *   2. Per-well reconciliation count — PCS's view vs v2's view.
 *   3. Photo coverage check — for each PCS load with BillOfLading
 *      attachment, does v2 have a matching photo.
 *   4. data_integrity_runs audit entry with the full JSON result.
 *   5. Markdown report at docs/2026-04-23-calibration-report.md.
 *
 * Matches against v2 via 3 keys (ranked by specificity):
 *   A. stops[Consignee].referenceNumber → loads.ticket_no / load_no / bol_no
 *      (exact — should be the same scale-ticket number)
 *   B. stops[Consignee].companyName → wells.name OR loads.destination_name
 *      (normalized — well name match)
 *   C. loadReference → loads.load_no / ticket_no
 *      (fallback — PCS customer load number)
 *
 * Usage:
 *   DATABASE_URL=... PCS_CLIENT_ID=... PCS_CLIENT_SECRET=...
 *   npx tsx scripts/pcs-calibration-run.ts [--div=B]
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, sql, and, or, inArray } from "drizzle-orm";
import { readFileSync, writeFileSync } from "node:fs";
import {
  loads,
  assignments,
  wells,
  dataIntegrityRuns,
} from "../src/db/schema.js";

const DATABASE_URL = process.env.DATABASE_URL;
const PCS_CLIENT_ID = process.env.PCS_CLIENT_ID;
const PCS_CLIENT_SECRET = process.env.PCS_CLIENT_SECRET;
const PCS_COMPANY_ID = process.env.PCS_COMPANY_ID ?? "138936";
const PCS_BASE = process.env.PCS_BASE_URL ?? "https://api.pcssoft.com";
if (!DATABASE_URL || !PCS_CLIENT_ID || !PCS_CLIENT_SECRET) {
  console.error("DATABASE_URL + PCS_CLIENT_ID + PCS_CLIENT_SECRET required");
  process.exit(1);
}

const divArg = process.argv.find((a) => a.startsWith("--div="));
const DIV = divArg ? divArg.slice(6) : "B"; // default ES Express

interface PcsStop {
  order: string | number;
  type: "Shipper" | "Consignee";
  companyName?: string;
  referenceNumber?: string | null;
  availableFrom?: string;
  address?: { city?: string; countrySubDivisionCode?: string };
}

interface PcsLoad {
  loadId: string | number;
  status: string;
  loadReference?: string | null;
  reference1?: string | null;
  billToId?: string;
  billToName?: string;
  totalWeight?: string | number | null;
  milesBilled?: string | number | null;
  stops?: PcsStop[];
  notes?: string | null;
}

const pg = postgres(DATABASE_URL, { prepare: false });
// biome-ignore lint/suspicious/noExplicitAny: drizzle type
const db = drizzle(pg) as any;

async function getPcsToken(): Promise<string> {
  const res = await fetch(`${PCS_BASE}/authorization/v1/tokens/oauth`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: PCS_CLIENT_ID as string,
      client_secret: PCS_CLIENT_SECRET as string,
    }),
  });
  if (!res.ok) throw new Error(`OAuth failed ${res.status}`);
  const j = (await res.json()) as { access_token: string };
  return j.access_token;
}

async function fetchPcsLoads(token: string): Promise<PcsLoad[]> {
  // Well-tested: 180-day `from` returns the current open set (~44 loads).
  // The `from` param doesn't actually filter by date in practice; server
  // returns open/current loads with stops included.
  const from = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
    .toISOString()
    .substring(0, 10);
  const res = await fetch(
    `${PCS_BASE}/dispatching/v1/load?from=${from}&includestops=true`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": PCS_COMPANY_ID,
        "X-Company-Letter": DIV,
        Accept: "application/json",
      },
    },
  );
  if (!res.ok)
    throw new Error(`GetLoads failed ${res.status}: ${await res.text()}`);
  return (await res.json()) as PcsLoad[];
}

async function fetchAttachmentsForLoad(
  token: string,
  loadId: string | number,
): Promise<{ attachments: Array<{ attachmentType: string; name?: string }> }> {
  const res = await fetch(`${PCS_BASE}/file/v1/load/${loadId}/attachments`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Company-Id": PCS_COMPANY_ID,
      "X-Company-Letter": DIV,
    },
  });
  if (!res.ok) return { attachments: [] };
  return (await res.json()) as {
    attachments: Array<{ attachmentType: string; name?: string }>;
  };
}

function consignee(pl: PcsLoad): PcsStop | null {
  return pl.stops?.find((s) => s != null && s.type === "Consignee") ?? null;
}

function shipper(pl: PcsLoad): PcsStop | null {
  return pl.stops?.find((s) => s != null && s.type === "Shipper") ?? null;
}

type MatchResult = {
  pcsLoadId: string | number;
  pcsLoadReference: string | null;
  pcsStatus: string;
  pcsStops: {
    shipper: string | null;
    consignee: string | null;
    consigneeRef: string | null;
  };
  pcsAttachments: string[];
  v2AssignmentId: number | null;
  v2LoadId: number | null;
  v2Ticket: string | null;
  v2LoadNo: string | null;
  v2BolNo: string | null;
  v2Well: string | null;
  v2WellMatchesPcs: boolean | null;
  v2HasPhoto: boolean | null;
  matchMethod:
    | "stop_reference"
    | "loadReference_to_ticket"
    | "loadReference_to_loadNo"
    | "loadReference_to_bol"
    | "companyName_to_well"
    | "companyName_to_destination"
    | "none";
  classification:
    | "perfect"
    | "v2_on_wrong_well"
    | "v2_no_photo"
    | "not_in_v2"
    | "weak_match";
};

async function findV2Match(pl: PcsLoad): Promise<MatchResult> {
  const ref = pl.loadReference ?? null;
  const cons = consignee(pl);
  const ship = shipper(pl);
  const stopRef = cons?.referenceNumber ?? null;
  const consigneeName = cons?.companyName ?? null;
  const shipperName = ship?.companyName ?? null;

  const attachments: string[] = []; // filled by caller
  const result: MatchResult = {
    pcsLoadId: pl.loadId,
    pcsLoadReference: ref,
    pcsStatus: pl.status,
    pcsStops: {
      shipper: shipperName,
      consignee: consigneeName,
      consigneeRef: stopRef,
    },
    pcsAttachments: attachments,
    v2AssignmentId: null,
    v2LoadId: null,
    v2Ticket: null,
    v2LoadNo: null,
    v2BolNo: null,
    v2Well: null,
    v2WellMatchesPcs: null,
    v2HasPhoto: null,
    matchMethod: "none",
    classification: "not_in_v2",
  };

  // Priority A: stop.referenceNumber exact match against ticket/load/bol
  if (stopRef) {
    const [row] = await db
      .select({
        assignmentId: assignments.id,
        loadId: loads.id,
        ticketNo: loads.ticketNo,
        loadNo: loads.loadNo,
        bolNo: loads.bolNo,
        destinationName: loads.destinationName,
        wellName: wells.name,
      })
      .from(loads)
      .leftJoin(assignments, eq(assignments.loadId, loads.id))
      .leftJoin(wells, eq(assignments.wellId, wells.id))
      .where(
        or(
          eq(loads.ticketNo, stopRef),
          eq(loads.loadNo, stopRef),
          eq(loads.bolNo, stopRef),
        ),
      )
      .limit(1);
    if (row) {
      result.v2AssignmentId = row.assignmentId ?? null;
      result.v2LoadId = row.loadId;
      result.v2Ticket = row.ticketNo;
      result.v2LoadNo = row.loadNo;
      result.v2BolNo = row.bolNo;
      result.v2Well = row.wellName ?? row.destinationName;
      result.matchMethod = "stop_reference";
    }
  }

  // Priority B: loadReference → ticket/load/bol
  if (result.matchMethod === "none" && ref) {
    const [row] = await db
      .select({
        assignmentId: assignments.id,
        loadId: loads.id,
        ticketNo: loads.ticketNo,
        loadNo: loads.loadNo,
        bolNo: loads.bolNo,
        destinationName: loads.destinationName,
        wellName: wells.name,
      })
      .from(loads)
      .leftJoin(assignments, eq(assignments.loadId, loads.id))
      .leftJoin(wells, eq(assignments.wellId, wells.id))
      .where(
        or(
          eq(loads.ticketNo, ref),
          eq(loads.loadNo, ref),
          eq(loads.bolNo, ref),
        ),
      )
      .limit(1);
    if (row) {
      result.v2AssignmentId = row.assignmentId ?? null;
      result.v2LoadId = row.loadId;
      result.v2Ticket = row.ticketNo;
      result.v2LoadNo = row.loadNo;
      result.v2BolNo = row.bolNo;
      result.v2Well = row.wellName ?? row.destinationName;
      if (row.ticketNo === ref) result.matchMethod = "loadReference_to_ticket";
      else if (row.loadNo === ref)
        result.matchMethod = "loadReference_to_loadNo";
      else result.matchMethod = "loadReference_to_bol";
    }
  }

  // Priority C: companyName match against wells or destinationName (weak)
  if (result.matchMethod === "none" && consigneeName) {
    // Try wells first
    const wellRows = await db
      .select({ name: wells.name })
      .from(wells)
      .where(
        or(
          eq(wells.name, consigneeName),
          sql`${wells.aliases}::text ILIKE ${`%"${consigneeName}"%`}`,
        ),
      )
      .limit(1);
    if (wellRows.length > 0) {
      result.v2Well = wellRows[0].name;
      result.matchMethod = "companyName_to_well";
    } else {
      // Try destination_name via loads
      const destRows = await db
        .select({ destinationName: loads.destinationName })
        .from(loads)
        .where(eq(loads.destinationName, consigneeName))
        .limit(1);
      if (destRows.length > 0) {
        result.v2Well = destRows[0].destinationName;
        result.matchMethod = "companyName_to_destination";
      }
    }
  }

  // Classify based on match + well correctness + photo presence
  if (result.matchMethod === "none") {
    result.classification = "not_in_v2";
    return result;
  }

  // Check well correctness: if PCS's consigneeName normalizes to v2Well, ok
  if (consigneeName && result.v2Well) {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    result.v2WellMatchesPcs = norm(consigneeName) === norm(result.v2Well);
  }

  // Check photo presence on v2 side
  if (result.v2AssignmentId) {
    const [photoRow] = await db.execute(sql`
      SELECT
        (EXISTS(SELECT 1 FROM photos WHERE assignment_id = ${result.v2AssignmentId}) OR
         EXISTS(SELECT 1 FROM photos WHERE load_id = ${result.v2LoadId})) AS has_photo
    `);
    result.v2HasPhoto = Boolean(
      (photoRow as { has_photo?: boolean } | undefined)?.has_photo,
    );
  }

  if (
    result.matchMethod === "stop_reference" ||
    result.matchMethod === "loadReference_to_ticket"
  ) {
    if (result.v2WellMatchesPcs === false) {
      result.classification = "v2_on_wrong_well";
    } else if (result.v2HasPhoto === false) {
      result.classification = "v2_no_photo";
    } else {
      result.classification = "perfect";
    }
  } else {
    result.classification = "weak_match";
  }

  return result;
}

async function main() {
  console.log(`\n=== PCS Calibration Run — ${new Date().toISOString()} ===`);
  console.log(`Division: ${DIV}, Company: ${PCS_COMPANY_ID}\n`);

  const token = await getPcsToken();
  console.log("✓ OAuth token acquired");

  const pcsLoads = await fetchPcsLoads(token);
  console.log(`✓ Pulled ${pcsLoads.length} PCS loads\n`);

  // Log run start
  const [runEntry] = await db
    .insert(dataIntegrityRuns)
    .values({
      scriptName: "pcs-calibration-run",
      ranBy: "jace",
      rowCountBefore: pcsLoads.length,
      dryRun: false,
      status: "running",
      metadata: { division: DIV, timestamp: new Date().toISOString() },
    })
    .returning({ id: dataIntegrityRuns.id });

  // For each PCS load, fetch attachments + find v2 match
  const results: MatchResult[] = [];
  for (let i = 0; i < pcsLoads.length; i++) {
    const pl = pcsLoads[i];
    const attRes = await fetchAttachmentsForLoad(token, pl.loadId);
    const attachments = (attRes.attachments ?? []).map((a) => a.attachmentType);
    const match = await findV2Match(pl);
    match.pcsAttachments = attachments;
    results.push(match);
    if ((i + 1) % 10 === 0)
      console.log(`  processed ${i + 1}/${pcsLoads.length}`);
  }

  // Summary stats
  const summary = {
    total: results.length,
    perfect: results.filter((r) => r.classification === "perfect").length,
    wrongWell: results.filter((r) => r.classification === "v2_on_wrong_well")
      .length,
    noPhoto: results.filter((r) => r.classification === "v2_no_photo").length,
    weakMatch: results.filter((r) => r.classification === "weak_match").length,
    notInV2: results.filter((r) => r.classification === "not_in_v2").length,
    withPcsBol: results.filter((r) => r.pcsAttachments.includes("BillOfLading"))
      .length,
    pcsBolButNoV2Photo: results.filter(
      (r) =>
        r.pcsAttachments.includes("BillOfLading") && r.v2HasPhoto === false,
    ).length,
  };

  console.log("\n=== Summary ===");
  console.log(JSON.stringify(summary, null, 2));

  // Per-well breakdown
  const byWell: Record<
    string,
    { pcs: number; matchedInV2: number; wrongWell: number; notInV2: number }
  > = {};
  for (const r of results) {
    const key = r.pcsStops.consignee ?? "(unknown)";
    if (!byWell[key])
      byWell[key] = { pcs: 0, matchedInV2: 0, wrongWell: 0, notInV2: 0 };
    byWell[key].pcs += 1;
    if (r.classification === "perfect" || r.classification === "v2_no_photo")
      byWell[key].matchedInV2 += 1;
    if (r.classification === "v2_on_wrong_well") byWell[key].wrongWell += 1;
    if (r.classification === "not_in_v2") byWell[key].notInV2 += 1;
  }

  // Generate markdown report
  const reportPath =
    "/home/jryan/projects/work/esexpress-v2/docs/2026-04-23-calibration-report.md";
  const lines: string[] = [];
  lines.push(`# PCS Calibration Report — ${new Date().toISOString()}`);
  lines.push("");
  lines.push(
    `Division: ES Express (letter=${DIV}) · Account: ${PCS_COMPANY_ID}`,
  );
  lines.push("");
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`- Total currently-open PCS loads: **${summary.total}**`);
  lines.push(
    `- Perfect match (v2 has, right well, photo present): **${summary.perfect}**`,
  );
  lines.push(`- v2 has match on **wrong well**: **${summary.wrongWell}**`);
  lines.push(`- v2 has match, missing photo: **${summary.noPhoto}**`);
  lines.push(`- Weak match (companyName only): **${summary.weakMatch}**`);
  lines.push(`- **Not in v2 (missed ingest)**: **${summary.notInV2}**`);
  lines.push("");
  lines.push(`### Photo coverage`);
  lines.push(
    `- PCS loads with BillOfLading attached: **${summary.withPcsBol}**`,
  );
  lines.push(
    `- Of those, **not** present in v2's photo pipeline: **${summary.pcsBolButNoV2Photo}**`,
  );
  lines.push("");
  lines.push(`## Per-well reconciliation`);
  lines.push("");
  lines.push(
    `| Consignee (PCS) | PCS | v2 matched | v2 wrong well | Not in v2 |`,
  );
  lines.push(`|---|---:|---:|---:|---:|`);
  for (const [well, counts] of Object.entries(byWell).sort(
    (a, b) => b[1].pcs - a[1].pcs,
  )) {
    lines.push(
      `| ${well} | ${counts.pcs} | ${counts.matchedInV2} | ${counts.wrongWell} | ${counts.notInV2} |`,
    );
  }
  lines.push("");
  lines.push(`## Classified results (detail)`);
  lines.push("");
  for (const cls of [
    "not_in_v2",
    "v2_on_wrong_well",
    "v2_no_photo",
    "weak_match",
    "perfect",
  ] as const) {
    const bucket = results.filter((r) => r.classification === cls);
    if (bucket.length === 0) continue;
    lines.push(`### ${cls} (${bucket.length})`);
    lines.push(``);
    lines.push(
      `| PCS loadId | PCS ref | Consignee | Stop ref | v2 ticket | v2 well | photo |`,
    );
    lines.push(`|---|---|---|---|---|---|---|`);
    for (const r of bucket.slice(0, 40)) {
      lines.push(
        `| ${r.pcsLoadId} | ${r.pcsLoadReference ?? "—"} | ${r.pcsStops.consignee ?? "—"} | ${r.pcsStops.consigneeRef ?? "—"} | ${r.v2Ticket ?? r.v2LoadNo ?? "—"} | ${r.v2Well ?? "—"} | ${r.v2HasPhoto === null ? "—" : r.v2HasPhoto ? "✓" : "✗"} |`,
      );
    }
    if (bucket.length > 40) lines.push(`\n_…and ${bucket.length - 40} more_`);
    lines.push(``);
  }

  writeFileSync(reportPath, lines.join("\n"));
  console.log(`\n✓ Report written to ${reportPath}`);

  await db
    .update(dataIntegrityRuns)
    .set({
      completedAt: new Date(),
      status: "completed",
      rowCountAfter: summary.total,
      notes: `perfect=${summary.perfect} wrongWell=${summary.wrongWell} noPhoto=${summary.noPhoto} weak=${summary.weakMatch} notInV2=${summary.notInV2}`,
      metadata: {
        division: DIV,
        summary,
        byWell,
        reportPath,
      },
    })
    .where(eq(dataIntegrityRuns.id, runEntry.id));

  console.log(`✓ data_integrity_runs id=${runEntry.id} completed`);
}

try {
  await main();
} catch (err) {
  console.error(
    "Calibration run failed:",
    err instanceof Error ? err.stack : err,
  );
  process.exitCode = 1;
} finally {
  await pg.end();
}
