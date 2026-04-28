/**
 * PCS AddLoad shape probe — fires multiple wire-shape variants back-to-back
 * to definitively isolate what (if anything) makes a difference. No v2 DB
 * seeding — pure HTTP probes against api.pcssoft.com.
 *
 * Variants tested:
 *   1. Path A (4/22 working shape): camelCase + all 3 headers via api.addLoad()
 *      → already confirmed 500 via pcs-test-push.mjs run, included for parity
 *   2. Post-4/23 shape: PascalCase + Authorization + X-Company-Id ONLY
 *   3. Post-4/23 shape + X-Company-Letter restored
 *   4. Minimal: PascalCase + Authorization only
 *
 * Each variant logs:
 *   - Wire body (full JSON)
 *   - Headers used
 *   - HTTP status + response body + response headers
 *
 * Usage (with all env injected):
 *   node scripts/pcs-shape-probe.mjs
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getAccessToken } from "../dist/plugins/pcs/services/pcs-auth.service.js";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pg = postgres(process.env.DATABASE_URL, { prepare: false });
const db = drizzle(pg);

const PCS_BASE = process.env.PCS_BASE_URL ?? "https://api.pcssoft.com";
const PCS_COMPANY_ID = process.env.PCS_COMPANY_ID ?? "";
const URL = `${PCS_BASE}/dispatching/v1/load`;

const stamp = new Date()
  .toISOString()
  .replace(/[:T.-]/g, "")
  .slice(0, 14);

// Body shape variants — kept small + identical-payload-content so the only
// thing changing is field-case and which headers we send.
const camelBody = {
  loadClass: "TL",
  status: "Dispatched",
  office: { code: "1" },
  billToId: "V646",
  billToName: "ES Express",
  totalWeight: 50000,
  loadReference: `PROBE-CAMEL-${stamp}`,
  notes: "v2 shape probe — camelCase variant",
};

const pascalBody = {
  Status: "Dispatched",
  LoadClass: "TL",
  Office: { Code: 1 },
  BillToId: "V646",
  BillToName: "ES Express",
  TotalWeight: 50000,
  LoadReference: `PROBE-PASCAL-${stamp}`,
  Notes: "v2 shape probe — PascalCase variant",
};

async function probe(name, body, headers) {
  const url = URL;
  const serialized = JSON.stringify(body);
  const start = Date.now();
  console.log(`\n──── ${name} ────`);
  console.log("URL:    ", url);
  console.log("Headers:", Object.keys(headers).join(", "));
  console.log("Body:   ", serialized);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: serialized,
    });
  } catch (err) {
    console.log("EXCEPTION:", err instanceof Error ? err.message : String(err));
    return;
  }
  const elapsed = Date.now() - start;
  const text = await res.text().catch(() => "");
  const respHeaders = {};
  res.headers.forEach((v, k) => {
    respHeaders[k] = v;
  });
  console.log(`STATUS:  ${res.status} (${elapsed}ms)`);
  console.log("RESP HDRS:", JSON.stringify(respHeaders, null, 2));
  console.log("RESP BODY:", text.slice(0, 600));
}

async function main() {
  console.log("=== PCS AddLoad shape probe ===");
  console.log("Time:   ", new Date().toISOString());
  console.log("PCS_BASE:", PCS_BASE);
  console.log("Company:", PCS_COMPANY_ID);

  const bearer = await getAccessToken(db);
  console.log(
    `Bearer: ${bearer.slice(0, 20)}...${bearer.slice(-8)} (${bearer.length} chars)`,
  );

  // V1: camelCase + all 3 headers (4/22 baseline minus generator-client transport)
  await probe(
    "V1: camelCase + Auth + X-Company-Id + X-Company-Letter=B",
    camelBody,
    {
      Authorization: `Bearer ${bearer}`,
      "X-Company-Id": PCS_COMPANY_ID,
      "X-Company-Letter": "B",
    },
  );

  // V2: PascalCase + Auth + X-Company-Id (post-4/23 current main shape pre-revert)
  await probe("V2: PascalCase + Auth + X-Company-Id (no letter)", pascalBody, {
    Authorization: `Bearer ${bearer}`,
    "X-Company-Id": PCS_COMPANY_ID,
  });

  // V3: PascalCase + all 3 headers (post-4/23 + letter)
  await probe(
    "V3: PascalCase + Auth + X-Company-Id + X-Company-Letter=B",
    pascalBody,
    {
      Authorization: `Bearer ${bearer}`,
      "X-Company-Id": PCS_COMPANY_ID,
      "X-Company-Letter": "B",
    },
  );

  // V4: minimal — PascalCase + Auth only
  await probe("V4: PascalCase + Auth only (no company headers)", pascalBody, {
    Authorization: `Bearer ${bearer}`,
  });

  // V5: same as V3 but A instead of B
  await probe(
    "V5: PascalCase + Auth + X-Company-Id + X-Company-Letter=A",
    pascalBody,
    {
      Authorization: `Bearer ${bearer}`,
      "X-Company-Id": PCS_COMPANY_ID,
      "X-Company-Letter": "A",
    },
  );
}

try {
  await main();
} finally {
  await pg.end();
}
