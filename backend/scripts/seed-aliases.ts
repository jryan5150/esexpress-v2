// Seed customer + well aliases so v2 reconciles the sheet's freeform
// spellings against the canonical entities. Captures what we found in
// the 2026-04-27 tri-recon:
//   - Liberty appears as 5 spellings in the sheet
//   - Logistix IQ appears as 4 spellings
//   - Some sheet wells are short-form of the v2 well name
//
// All seeds are marked confirmed=false. Jess (or admin) confirms in
// a future admin UI; until then they're working hypotheses surfaced
// via /diag/aliases.
//
// Run:
//   set -a; source .env; set +a
//   tsx backend/scripts/seed-aliases.ts             # DRY-RUN
//   tsx backend/scripts/seed-aliases.ts --execute   # write

import postgres from "postgres";

const EXECUTE = process.argv.includes("--execute");

// Customer alias seeds — sheet spelling → canonical customer name
const CUSTOMER_ALIASES = [
  // Liberty variants → "Liberty Energy Services, LLC"
  { sourceName: "Liberty", canonical: "Liberty Energy Services, LLC" },
  { sourceName: "Liberty(FSC)", canonical: "Liberty Energy Services, LLC" },
  { sourceName: "Liberty (FSC)", canonical: "Liberty Energy Services, LLC" },
  { sourceName: "LIberty", canonical: "Liberty Energy Services, LLC" }, // sheet typo
  // Logistix IQ variants → canonical
  { sourceName: "LogstixIQ", canonical: "Logistix IQ" }, // sheet typo (missing i)
  { sourceName: "Logistix", canonical: "Logistix IQ" },
  { sourceName: "LogistixIQ", canonical: "Logistix IQ" },
  // JRT — sheet uses "JRT", canonical from PCS is "JRT Trucking Inc"
  { sourceName: "JRT", canonical: "JRT Trucking Inc" },
];

// Well alias seeds — known short-form variants → v2 canonical well.name
// (additive to existing wells.aliases array)
const WELL_ALIASES: Array<{ canonical: string; aliases: string[] }> = [
  {
    canonical: "Logistix IQ Exco DF DGB Little 6-7-8",
    aliases: [
      "Logistix IQ Exco DF DGB Little",
      "Exco DF DGB Little 6-7-8",
      "Exco DF DGB Little",
      "DGB Little",
      "DGB Little 6-7-8",
    ],
  },
  // Sheet uses short well names; v2 prefixes with the operator/pad.
  // Adding the short forms as aliases lets sheet rows match v2 wells.
  { canonical: "Liberty MGY Oryx", aliases: ["MGY Oryx"] },
];

async function main() {
  const url = process.env.DATABASE_URL!;
  if (url.includes("interchange.proxy.rlwy.net"))
    throw new Error("Refusing phantom DB");
  const sql = postgres(url, { prepare: false, max: 1 });

  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY-RUN"}\n`);

  // ── Resolve canonical customer IDs ────────────────────────────────
  console.log(`=== Customer alias seeds ===`);
  const wantedCustomers = new Set(CUSTOMER_ALIASES.map((a) => a.canonical));
  const customers = (await sql`
    SELECT id, name FROM customers
    WHERE name = ANY(${Array.from(wantedCustomers)}::text[])`) as unknown as Array<{
    id: number;
    name: string;
  }>;
  const customerByName = new Map(customers.map((c) => [c.name, c.id]));

  for (const cName of wantedCustomers) {
    if (!customerByName.has(cName))
      console.log(
        `  ⚠️  canonical customer not found: "${cName}" — alias seeds for this will resolve to NULL canonical_customer_id`,
      );
  }

  for (const a of CUSTOMER_ALIASES) {
    const canonId = customerByName.get(a.canonical);
    const existing = (await sql`
      SELECT id, source_name, canonical_name, canonical_customer_id, confirmed
      FROM customer_mappings WHERE source_name = ${a.sourceName}`) as unknown as Array<{
      id: number;
      source_name: string;
      canonical_name: string;
      canonical_customer_id: number | null;
      confirmed: boolean;
    }>;
    const existsLine = existing[0]
      ? ` (existing: canonical=${existing[0].canonical_name}, custId=${existing[0].canonical_customer_id ?? "NULL"}, confirmed=${existing[0].confirmed})`
      : ` (new)`;
    console.log(
      `  "${a.sourceName.padEnd(20)}" → "${a.canonical}" custId=${canonId ?? "NULL"}${existsLine}`,
    );

    if (EXECUTE) {
      await sql`
        INSERT INTO customer_mappings (source_name, canonical_name, canonical_customer_id, confirmed)
        VALUES (${a.sourceName}, ${a.canonical}, ${canonId ?? null}, false)
        ON CONFLICT (source_name) DO UPDATE
          SET canonical_name = EXCLUDED.canonical_name,
              canonical_customer_id = EXCLUDED.canonical_customer_id`;
    }
  }

  // ── Resolve canonical well IDs and merge aliases array ────────────
  console.log(`\n=== Well alias seeds ===`);
  for (const w of WELL_ALIASES) {
    const found = (await sql`
      SELECT id, name, aliases FROM wells WHERE name = ${w.canonical}`) as unknown as Array<{
      id: number;
      name: string;
      aliases: string[] | null;
    }>;
    if (!found[0]) {
      console.log(
        `  ⚠️  canonical well not found: "${w.canonical}" — skipping`,
      );
      continue;
    }
    const existing = new Set(found[0].aliases ?? []);
    const toAdd = w.aliases.filter((a) => !existing.has(a));
    console.log(
      `  "${w.canonical}" — existing aliases: [${[...existing].join(", ") || "(none)"}], adding: [${toAdd.join(", ") || "(none)"}]`,
    );
    if (EXECUTE && toAdd.length > 0) {
      const merged = [...new Set([...existing, ...toAdd])];
      // postgres.js: passing JSON.stringify(arr) inline + ::jsonb cast
      // wraps the array in another quote layer (jsonb_typeof becomes
      // 'string' instead of 'array'). Use sql.unsafe parameter binding
      // to avoid the double-encoding.
      await sql.unsafe(`UPDATE wells SET aliases = $1::jsonb WHERE id = $2`, [
        JSON.stringify(merged),
        found[0].id,
      ]);
    }
  }

  if (!EXECUTE) {
    console.log(`\nDRY-RUN: pass --execute to write.`);
  } else {
    console.log(`\n✓ Aliases seeded.`);
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
