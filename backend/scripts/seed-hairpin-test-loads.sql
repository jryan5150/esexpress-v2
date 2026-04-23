-- Seed 3 clearly-labeled test loads for the Friday-drop Hairpin self-demo.
-- Each load is idempotent on load_no: re-running won't duplicate.
--
-- Purpose: the drop email invites the team to toggle Hairpin (A) on,
-- push these pre-seeded test loads to PCS, verify in PCS, then void
-- from v2 — proving the round-trip end-to-end. These loads are NEVER
-- pushed anywhere unless a human explicitly clicks Push in the UI.
--
-- Labeling is intentionally loud: driver_name, destination_name, and
-- notes all say "TEST" so no dispatcher accidentally advances them as
-- real work. raw_data.test_seed = true lets the UI filter them out of
-- normal workflows if we choose.

BEGIN;

-- 1. Loads (idempotent on load_no)
INSERT INTO loads (
  load_no, source, source_id,
  driver_name, truck_no, trailer_no, carrier_name, customer_name,
  product_description, origin_name, destination_name,
  weight_tons, bol_no, ticket_no, order_no,
  status, delivered_on, raw_data, created_at, updated_at
)
VALUES
  (
    'TEST-HAIRPIN-001', 'manual', 'TEST-HAIRPIN-001',
    'TEST DRIVER — Hairpin Demo', 'T-TEST-001', 'TR-TEST-001', 'ES Express LLC (TEST)', 'ES Express LLC (TEST)',
    '100M Test Product', 'TEST ORIGIN — Cayuga Sands', 'TEST DEMO — Hairpin Push Round-Trip',
    24.50, 'TEST-BOL-001', 'TEST-TKT-001', 'TEST-PO-001',
    'active', NOW(),
    jsonb_build_object(
      'test_seed', true,
      'purpose', 'Friday drop self-demo — push to Hairpin (A) round-trip',
      'seeded_at', NOW()::text,
      'seeded_by', 'backfill-script'
    ),
    NOW(), NOW()
  ),
  (
    'TEST-HAIRPIN-002', 'manual', 'TEST-HAIRPIN-002',
    'TEST DRIVER — Hairpin Demo', 'T-TEST-002', 'TR-TEST-002', 'ES Express LLC (TEST)', 'ES Express LLC (TEST)',
    '40/70 Test Product', 'TEST ORIGIN — River Ridge', 'TEST DEMO — Hairpin Push Round-Trip',
    25.30, 'TEST-BOL-002', 'TEST-TKT-002', 'TEST-PO-002',
    'active', NOW(),
    jsonb_build_object(
      'test_seed', true,
      'purpose', 'Friday drop self-demo — push to Hairpin (A) round-trip',
      'seeded_at', NOW()::text,
      'seeded_by', 'backfill-script'
    ),
    NOW(), NOW()
  ),
  (
    'TEST-HAIRPIN-003', 'manual', 'TEST-HAIRPIN-003',
    'TEST DRIVER — Hairpin Demo', 'T-TEST-003', 'TR-TEST-003', 'ES Express LLC (TEST)', 'ES Express LLC (TEST)',
    '100M Test Product', 'TEST ORIGIN — Hat Creek', 'TEST DEMO — Hairpin Push Round-Trip',
    26.10, 'TEST-BOL-003', 'TEST-TKT-003', 'TEST-PO-003',
    'active', NOW(),
    jsonb_build_object(
      'test_seed', true,
      'purpose', 'Friday drop self-demo — push to Hairpin (A) round-trip',
      'seeded_at', NOW()::text,
      'seeded_by', 'backfill-script'
    ),
    NOW(), NOW()
  )
ON CONFLICT DO NOTHING;

-- 2. Assignments — each load gets an assignment against well #1
--    (Alliance-Silver Hill-D Pad North, well doesn't matter for demo).
--    handler_stage = 'ready_to_build' so it appears in the push queue.
--    photo_status = 'attached' + auto_map_tier = 1 + score 1.000 means
--    the dispatch surface sees these as green-light Tier 1 matches.
INSERT INTO assignments (
  well_id, load_id, status, handler_stage, photo_status,
  auto_map_tier, auto_map_score, stage_changed_at,
  notes, match_audit, uncertain_reasons, status_history,
  created_at, updated_at
)
SELECT
  1, l.id, 'pending', 'ready_to_build', 'attached',
  1, 1.000, NOW(),
  'TEST LOAD — safe to push to Hairpin (A). Do not push to ES Express (B). Pre-seeded for Friday-drop self-demo.',
  jsonb_build_object(
    'tierBeforeRules', 1, 'tierAfterRules', 1,
    'rulesApplied', '[]'::jsonb,
    'reason', 'Test-seed load — synthetic Tier 1 for demo purposes',
    'suggestion', jsonb_build_object('wellId', 1, 'wellName', 'Alliance-Silver HIll-D Pad North', 'matchType', 'exact_name', 'score', 1.0),
    'alternatives', '[]'::jsonb,
    'evidence', jsonb_build_object(
      'exactNameMatch', true, 'exactAliasMatch', false, 'propxJobIdMatch', false,
      'fuzzyMatch', false, 'confirmedMapping', true, 'crossSourceBoost', false,
      'aboveConfidenceFloor', true
    )
  ),
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'status', 'stage:ready_to_build',
      'changedAt', NOW()::text,
      'changedBy', NULL,
      'changedByName', 'Test-Seed',
      'notes', 'Pre-seeded for Friday-drop self-demo'
    )
  ),
  NOW(), NOW()
FROM loads l
WHERE l.load_no IN ('TEST-HAIRPIN-001', 'TEST-HAIRPIN-002', 'TEST-HAIRPIN-003')
  AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.load_id = l.id);

-- 3. Photo rows — link a real JotForm image URL to each test assignment
--    so photoGateCheck passes and the push actually attaches a file.
--    Using one known-good URL from a recent bol_submission for all three
--    — same photo reused is fine for a demo.
INSERT INTO photos (
  load_id, assignment_id, source, source_url, type, pcs_uploaded, created_at
)
SELECT
  a.load_id, a.id, 'jotform',
  'https://hairpintrucking.jotform.com/uploads/!team_241077335536053/240655800307047/6527552916677160126/image.jpg',
  'bol', false, NOW()
FROM assignments a
JOIN loads l ON l.id = a.load_id
WHERE l.load_no IN ('TEST-HAIRPIN-001', 'TEST-HAIRPIN-002', 'TEST-HAIRPIN-003')
  AND NOT EXISTS (
    SELECT 1 FROM photos p WHERE p.assignment_id = a.id
  );

COMMIT;

-- Verify
SELECT l.load_no, l.driver_name, l.destination_name, l.weight_tons,
       a.id AS assignment_id, a.handler_stage, a.photo_status,
       (SELECT COUNT(*) FROM photos p WHERE p.assignment_id = a.id) AS photo_count
FROM loads l
JOIN assignments a ON a.load_id = l.id
WHERE l.load_no LIKE 'TEST-HAIRPIN-%'
ORDER BY l.load_no;
