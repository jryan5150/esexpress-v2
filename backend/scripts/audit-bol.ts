/**
 * Deep audit: where does a BOL show up in the system?
 * Reports presence across every source so we can distinguish
 * "genuinely not landed yet" from "landed but the search missed it".
 *
 * Usage:
 *   cd backend
 *   DATABASE_URL=... npx tsx scripts/audit-bol.ts AU2604172552098
 */
import postgres from "postgres";

const BOL = process.argv[2] ?? "AU2604172552098";
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

(async () => {
  console.log(`\nAuditing BOL: ${BOL}\n${"=".repeat(60)}\n`);

  const loadHits = await sql`
    SELECT id, source, source_id, load_no, bol_no, ticket_no,
           driver_name, truck_no, delivered_on,
           historical_complete, created_at
    FROM loads
    WHERE bol_no = ${BOL} OR ticket_no = ${BOL} OR load_no = ${BOL}
    LIMIT 10
  `;
  console.log(`[loads]                 ${loadHits.length} hit(s)`);
  for (const r of loadHits) {
    console.log(
      `  id=${r.id} src=${r.source} loadNo=${r.load_no} bol=${r.bol_no} ` +
        `ticket=${r.ticket_no} driver=${r.driver_name} truck=${r.truck_no} ` +
        `delivered=${r.delivered_on} histComplete=${r.historical_complete}`,
    );
  }

  const jotformHits = await sql`
    SELECT id, jotform_submission_id, bol_no, driver_name, truck_no,
           status, matched_load_id, match_method,
           created_at, submitted_at
    FROM jotform_imports
    WHERE bol_no = ${BOL}
    LIMIT 10
  `;
  console.log(
    `\n[jotform_imports]       ${jotformHits.length} hit(s) where bol_no exactly = ${BOL}`,
  );
  for (const r of jotformHits) {
    console.log(
      `  id=${r.id} submitted=${r.submitted_at} status=${r.status} ` +
        `matchedLoad=${r.matched_load_id} method=${r.match_method} ` +
        `driver=${r.driver_name} truck=${r.truck_no}`,
    );
  }

  if (loadHits.length > 0) {
    const loadIds = loadHits.map((l: { id: number }) => l.id);
    const jotformByLoad = await sql`
      SELECT id, bol_no, status, matched_load_id, image_urls, photo_url, submitted_at
      FROM jotform_imports
      WHERE matched_load_id = ANY(${loadIds})
      LIMIT 20
    `;
    console.log(
      `\n[jotform_imports]       ${jotformByLoad.length} hit(s) matched to load ids [${loadIds.join(",")}]`,
    );
    for (const r of jotformByLoad) {
      const imgCount = Array.isArray(r.image_urls)
        ? r.image_urls.length
        : r.photo_url
          ? 1
          : 0;
      console.log(
        `  id=${r.id} submitted=${r.submitted_at} bol=${r.bol_no} ` +
          `status=${r.status} photos=${imgCount}`,
      );
    }
  }

  const photoHits = await sql`
    SELECT p.id, p.source, p.assignment_id, p.load_id,
           p.source_url, p.type, p.created_at
    FROM photos p
    LEFT JOIN loads l ON l.id = p.load_id
    WHERE l.bol_no = ${BOL} OR l.ticket_no = ${BOL}
    LIMIT 10
  `;
  console.log(
    `\n[photos]                ${photoHits.length} hit(s) via load BOL/ticket match`,
  );
  for (const r of photoHits) {
    console.log(
      `  id=${r.id} src=${r.source} assignment=${r.assignment_id} ` +
        `load=${r.load_id} type=${r.type}`,
    );
  }

  const bolSubHits = await sql`
    SELECT id, matched_load_id, status,
           ai_extracted_data->>'bolNumber' as extracted_bol_number,
           ai_extracted_data->>'bolNo' as extracted_bol_no,
           jsonb_array_length(COALESCE(photos, '[]'::jsonb)) as photo_count
    FROM bol_submissions
    WHERE ai_extracted_data->>'bolNumber' = ${BOL}
       OR ai_extracted_data->>'bolNo' = ${BOL}
    LIMIT 10
  `;
  console.log(
    `\n[bol_submissions]       ${bolSubHits.length} hit(s) where Vision OCR extracted BOL=${BOL}`,
  );
  for (const r of bolSubHits) {
    console.log(
      `  id=${r.id} matchedLoad=${r.matched_load_id} status=${r.status} ` +
        `extractedBolNumber=${r.extracted_bol_number} extractedBolNo=${r.extracted_bol_no} ` +
        `photoCount=${r.photo_count}`,
    );
  }

  console.log(`\n${"=".repeat(60)}\nAudit complete.\n`);
  await sql.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
