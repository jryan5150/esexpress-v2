/**
 * Fetch full PCS load detail for diagnostic — explores Stops array
 * to see origin/destination/dates available for bridging to v2.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/pcs-load-detail.ts 284505
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getAccessToken } from "../src/plugins/pcs/services/pcs-auth.service.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const loadId = process.argv[2];
if (!loadId) {
  console.error("Usage: pcs-load-detail.ts <loadId>");
  process.exit(1);
}

const pg = postgres(DATABASE_URL, { prepare: false });
// biome-ignore lint/suspicious/noExplicitAny: drizzle
const db = drizzle(pg) as any;

async function main() {
  const bearer = await getAccessToken(db);
  const companyId = process.env.PCS_COMPANY_ID ?? "";
  const companyLetter = process.env.PCS_COMPANY_LTR ?? "B";
  const baseUrl = process.env.PCS_BASE_URL ?? "https://api.pcssoft.com";
  const url = `${baseUrl}/dispatching/v1/load/${loadId}`;

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

  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
}

try {
  await main();
} finally {
  await pg.end();
}
