/**
 * Dump 3 raw PCS load records with ALL fields. Diagnostic only —
 * investigating v2/PCS identifier mismatch where GetLoads returns
 * loadReferences like "136115" that don't match any v2 load_no/bol_no/
 * ticket_no. Need to see driver/destination/date fields to pick a
 * fuzzy-join strategy.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getAccessToken } from "../src/plugins/pcs/services/pcs-auth.service.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const pg = postgres(DATABASE_URL, { prepare: false });
// biome-ignore lint/suspicious/noExplicitAny: drizzle
const db = drizzle(pg) as any;

async function main() {
  const bearer = await getAccessToken(db);
  const companyId = process.env.PCS_COMPANY_ID ?? "";
  const companyLetter = process.env.PCS_COMPANY_LTR ?? "B";
  const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fromDateParam = fromDate.toISOString().substring(0, 10);
  const baseUrl = process.env.PCS_BASE_URL ?? "https://api.pcssoft.com";
  const url = `${baseUrl}/dispatching/v1/load?from=${fromDateParam}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      "X-Company-Id": companyId,
      "X-Company-Letter": companyLetter,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const bodyText = await res.text();
    console.error(`PCS ${res.status}: ${bodyText}`);
    process.exit(1);
  }

  const loads = (await res.json()) as Record<string, unknown>[];
  console.log(`PCS returned ${loads.length} loads. Sample of 3:\n`);
  for (const pl of loads.slice(0, 3)) {
    console.log(JSON.stringify(pl, null, 2));
    console.log("---");
  }

  console.log("\nField summary across all loads:");
  const allKeys = new Set<string>();
  for (const pl of loads) for (const k of Object.keys(pl)) allKeys.add(k);
  console.log([...allKeys].sort().join(", "));
}

try {
  await main();
} finally {
  await pg.end();
}
