-- =============================================================================
-- Jessica 3:30 call — live alias map for 5 orphan PropX destinations
-- =============================================================================
-- Context: Jessica's daily-count sheet names wells with her internal shorthand
-- (e.g. "Liberty Titan DNR Chili 117X"). PropX writes destination_name as the
-- raw trailing well descriptor (e.g. "DNR - Chili 117X"). The auto-mapper
-- reads wells.aliases but those mismatch by carrier prefix.
--
-- Result: 537 PropX loads (Apr 14-21) are orphaned — no assignment row — and
-- therefore invisible in Jessica's Load Center. Ship-ready fix: add aliases so
-- PropX's destination_name strings map to the wells we already have.
--
-- Run plan on the 3:30 call:
--   1. Run section §0 (inspection) — show current orphan counts
--   2. Confirm each pair with Jessica on the call
--   3. Run sections §1-§3 for the confident matches (flip to run-this-mode)
--   4. Run sections §4-§5 once Jessica confirms the guesses
--   5. Run section §6 — fire the auto-mapper re-run via curl (commented below)
--   6. Run section §0 again — confirm orphan count dropped
-- =============================================================================

-- -----------------------------------------------------------------------------
-- §0  Inspection: current orphan counts per destination (run before + after)
-- -----------------------------------------------------------------------------

SELECT l.destination_name,
       COUNT(*)                                       AS orphan_loads,
       MIN(DATE(l.delivered_on AT TIME ZONE 'America/Chicago')) AS earliest,
       MAX(DATE(l.delivered_on AT TIME ZONE 'America/Chicago')) AS latest,
       COUNT(DISTINCT l.driver_name)                 AS drivers
FROM loads l
LEFT JOIN assignments a ON a.load_id = l.id
WHERE l.source = 'propx'
  AND a.id IS NULL
  AND l.delivered_on >= '2026-04-14'
GROUP BY 1
ORDER BY 2 DESC;

-- Expected BEFORE (2026-04-21 audit):
--   Wells 1/2/3                           365
--   Bledsoe                                64
--   DNR - Chili 117X                       47
--   ASJ 4&16-11-11 HC East                 42
--   G07A IRELAND WILLIAMS 1HH 2HH 3HH      19
--   TOTAL                                 537

-- -----------------------------------------------------------------------------
-- §1  CONFIDENT MATCH #1  —  DNR - Chili 117X
--      Jessica's sheet calls it: "Liberty Titan DNR Chili 117X"
--      47 orphans, 4 drivers
-- -----------------------------------------------------------------------------

-- Preview: does the target well exist?
SELECT id, name, aliases FROM wells
WHERE name ILIKE '%Titan%DNR%Chili%' OR name ILIKE '%DNR%Chili%';

-- If not found, create it:
-- INSERT INTO wells (name, aliases, status, needs_rate_info)
-- VALUES ('Liberty Titan DNR Chili 117X',
--         '["DNR - Chili 117X"]'::jsonb, 'active', false);

-- If found, append alias:
-- UPDATE wells
-- SET aliases = COALESCE(aliases, '[]'::jsonb) || '["DNR - Chili 117X"]'::jsonb,
--     updated_at = NOW()
-- WHERE name = 'Liberty Titan DNR Chili 117X';

-- -----------------------------------------------------------------------------
-- §2  CONFIDENT MATCH #2  —  ASJ 4&16-11-11 HC East
--      Jessica's sheet calls it: "Liberty HV Cobra Apex ASJ HC East"
--      42 orphans, 2 drivers
-- -----------------------------------------------------------------------------

SELECT id, name, aliases FROM wells
WHERE name ILIKE '%ASJ%' OR name ILIKE '%Cobra%Apex%';

-- INSERT or UPDATE (uncomment whichever applies):
-- INSERT INTO wells (name, aliases, status, needs_rate_info)
-- VALUES ('Liberty HV Cobra Apex ASJ HC East',
--         '["ASJ 4&16-11-11 HC East"]'::jsonb, 'active', false);

-- UPDATE wells
-- SET aliases = COALESCE(aliases, '[]'::jsonb) || '["ASJ 4&16-11-11 HC East"]'::jsonb,
--     updated_at = NOW()
-- WHERE name = 'Liberty HV Cobra Apex ASJ HC East';

-- -----------------------------------------------------------------------------
-- §3  CONFIDENT MATCH #3  —  G07A IRELAND WILLIAMS 1HH 2HH 3HH
--      Jessica's sheet calls it: "Liberty Browning TGNRG07A Ireland Williams"
--      19 orphans, 13 drivers (high driver count = recent spike)
-- -----------------------------------------------------------------------------

SELECT id, name, aliases FROM wells
WHERE name ILIKE '%Ireland%Williams%' OR name ILIKE '%G07A%' OR name ILIKE '%Browning%';

-- INSERT or UPDATE:
-- INSERT INTO wells (name, aliases, status, needs_rate_info)
-- VALUES ('Liberty Browning TGNRG07A Ireland Williams',
--         '["G07A IRELAND WILLIAMS 1HH 2HH 3HH"]'::jsonb, 'active', false);

-- UPDATE wells
-- SET aliases = COALESCE(aliases, '[]'::jsonb) || '["G07A IRELAND WILLIAMS 1HH 2HH 3HH"]'::jsonb,
--     updated_at = NOW()
-- WHERE name = 'Liberty Browning TGNRG07A Ireland Williams';

-- -----------------------------------------------------------------------------
-- §4  PENDING CONFIRMATION  —  Wells 1/2/3   (biggest impact: 365 orphans)
--      Jessica's sheet candidate: "Liberty HV Falcon Expand Wells"
--      (trailing "Wells" token suggests a match, but ask her explicitly)
-- -----------------------------------------------------------------------------
-- ASK JESSICA: "PropX is writing 'Wells 1/2/3' as the destination on 365 loads
-- Apr 14-21 across 18 drivers. Is that your Liberty HV Falcon Expand Wells job,
-- or is it something else?"
--
-- After confirmation, uncomment ONE of:

-- SELECT id, name, aliases FROM wells WHERE name ILIKE '%Falcon%Expand%';

-- UPDATE wells
-- SET aliases = COALESCE(aliases, '[]'::jsonb) || '["Wells 1/2/3"]'::jsonb,
--     updated_at = NOW()
-- WHERE name = 'Liberty HV Falcon Expand Wells';

-- OR if it's a different well, swap the WHERE. OR insert net-new.

-- -----------------------------------------------------------------------------
-- §5  PENDING CONFIRMATION  —  Bledsoe   (64 orphans, 10 drivers, Apr 14-17)
--      Not in Jessica's sheet at all. Likely a well she dropped tracking, or
--      a legitimately new PropX destination that didn't make her master list.
-- -----------------------------------------------------------------------------
-- ASK JESSICA: "PropX shows 64 loads to a destination called 'Bledsoe' between
-- Apr 14-17 with 10 distinct drivers. That's real volume. Is Bledsoe a real
-- well for you? Under what carrier/builder?"
--
-- After confirmation, uncomment:

-- SELECT id, name FROM wells WHERE name ILIKE '%Bledsoe%';

-- INSERT INTO wells (name, aliases, status, needs_rate_info)
-- VALUES ('Bledsoe', '[]'::jsonb, 'active', false);

-- -----------------------------------------------------------------------------
-- §6  TRIGGER AUTO-MAPPER RE-RUN  (after aliases added)
-- -----------------------------------------------------------------------------
-- Run from shell (NOT in psql) — needs admin JWT.
--
--   curl -sS -X POST "https://backend-production-7960.up.railway.app/api/v1/dispatch/auto-map/" \
--     -H "Authorization: Bearer $JWT" \
--     -H "Content-Type: application/json" \
--     -d '{"limit":5000,"batchSize":500,"fromDate":"2026-04-14"}'
--
-- Then poll for progress (refresh every ~10s):
--
--   curl -sS "https://backend-production-7960.up.railway.app/api/v1/dispatch/auto-map/status" \
--     -H "Authorization: Bearer $JWT"
--
-- Expected: ~537 loads processed, ~537 new Tier-1 assignments created (if all
-- 5 aliases added). If only §1-§3 confirmed, expect ~108 new assignments (47
-- + 42 + 19).

-- -----------------------------------------------------------------------------
-- §7  POST-RUN VERIFICATION
-- -----------------------------------------------------------------------------
-- Re-run §0 — orphan count per destination should have dropped to 0 for every
-- destination we aliased.
--
-- Also verify assignments were created:

-- SELECT DATE(l.delivered_on AT TIME ZONE 'America/Chicago') AS day,
--        l.destination_name,
--        COUNT(DISTINCT a.id) AS new_assignments
-- FROM loads l
-- JOIN assignments a ON a.load_id = l.id
-- WHERE l.source = 'propx'
--   AND l.destination_name IN (
--     'DNR - Chili 117X',
--     'ASJ 4&16-11-11 HC East',
--     'G07A IRELAND WILLIAMS 1HH 2HH 3HH',
--     'Wells 1/2/3',
--     'Bledsoe'
--   )
--   AND a.assigned_by_name = 'Auto-Mapper'
--   AND a.created_at >= NOW() - INTERVAL '10 minutes'
-- GROUP BY 1, 2
-- ORDER BY 1 DESC, 2;
