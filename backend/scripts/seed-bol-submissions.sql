-- Seed bol_submissions for Phase 5 demo. Creates OCR-extracted data with
-- varying agreement levels so the real feature extractor has signal to show.
-- Not applied automatically — run manually:
--   docker exec -i esex-workbench-db psql -U postgres -d esexpress < scripts/seed-bol-submissions.sql

DELETE FROM bol_submissions;

-- Perfect matches for ready_to_build rows (BOL + weight align with load)
INSERT INTO bol_submissions (driver_id, driver_name, load_number, matched_load_id, match_method, match_score, ai_extracted_data, ai_confidence, status)
SELECT
  'D-' || l.id,
  l.driver_name,
  l.load_no,
  l.id,
  'load_no',
  95,
  jsonb_build_object(
    'ticketNo', l.ticket_no,
    'loadNumber', l.load_no,
    'bolNo', l.bol_no,
    'weight', (l.weight_tons::numeric * 2000),  -- tons -> lbs
    'driverName', l.driver_name,
    'deliveryDate', (l.delivered_on::date)::text
  ),
  92,
  'reconciled'
FROM loads l
JOIN assignments a ON a.load_id = l.id
WHERE a.handler_stage = 'ready_to_build'
LIMIT 10;

-- Partial matches for entered/cleared rows (BOL matches, weight slightly off)
INSERT INTO bol_submissions (driver_id, driver_name, load_number, matched_load_id, match_method, match_score, ai_extracted_data, ai_confidence, status)
SELECT
  'D-' || l.id,
  l.driver_name,
  l.load_no,
  l.id,
  'load_no',
  88,
  jsonb_build_object(
    'ticketNo', l.ticket_no,
    'loadNumber', l.load_no,
    'bolNo', l.bol_no,
    'weight', (l.weight_tons::numeric * 2000 * 1.03),  -- 3% weight drift (within tolerance)
    'driverName', l.driver_name,
    'deliveryDate', (l.delivered_on::date)::text
  ),
  85,
  'reconciled'
FROM loads l
JOIN assignments a ON a.load_id = l.id
WHERE a.handler_stage IN ('entered', 'cleared')
LIMIT 10;

-- BOL mismatches — OCR extracted a different BOL than the load record
-- (corresponds to bol_mismatch uncertain rows)
INSERT INTO bol_submissions (driver_id, driver_name, load_number, matched_load_id, match_method, match_score, ai_extracted_data, ai_confidence, status)
SELECT
  'D-' || l.id,
  l.driver_name,
  l.load_no,
  l.id,
  'driver_date_weight',
  62,
  jsonb_build_object(
    'ticketNo', l.ticket_no,
    'loadNumber', l.load_no,
    'bolNo', 'BOL-' || (random() * 100000)::int,  -- totally different BOL number
    'weight', (l.weight_tons::numeric * 2000),
    'driverName', l.driver_name,
    'deliveryDate', (l.delivered_on::date)::text
  ),
  70,
  'needs_review'
FROM loads l
JOIN assignments a ON a.load_id = l.id
WHERE a.uncertain_reasons @> '["bol_mismatch"]'::jsonb
LIMIT 3;

-- Weight mismatches — OCR weight differs by >20% from load weight
INSERT INTO bol_submissions (driver_id, driver_name, load_number, matched_load_id, match_method, match_score, ai_extracted_data, ai_confidence, status)
SELECT
  'D-' || l.id,
  l.driver_name,
  l.load_no,
  l.id,
  'load_no',
  75,
  jsonb_build_object(
    'ticketNo', l.ticket_no,
    'loadNumber', l.load_no,
    'bolNo', l.bol_no,  -- BOL matches
    'weight', (l.weight_tons::numeric * 2000 * 0.72),  -- 28% below (hard penalty band)
    'driverName', l.driver_name,
    'deliveryDate', (l.delivered_on::date)::text
  ),
  78,
  'needs_review'
FROM loads l
JOIN assignments a ON a.load_id = l.id
WHERE a.uncertain_reasons @> '["weight_mismatch"]'::jsonb
LIMIT 3;

SELECT
  count(*) as submissions_seeded,
  count(*) FILTER (WHERE match_score >= 85) as perfect,
  count(*) FILTER (WHERE match_score BETWEEN 70 AND 84) as partial,
  count(*) FILTER (WHERE match_score < 70) as poor
FROM bol_submissions;
