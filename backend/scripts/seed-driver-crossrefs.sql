-- Seed driver_crossrefs from the current loads table.
-- Initial population: each observed driver_name becomes its own canonical
-- identity (source_name == canonical_name, confirmed=true).
-- Run manually:
--   docker exec -i esex-workbench-db psql -U postgres -d esexpress < scripts/seed-driver-crossrefs.sql

INSERT INTO driver_crossrefs (source_name, canonical_name, confirmed)
SELECT DISTINCT driver_name, driver_name, true
FROM loads
WHERE driver_name IS NOT NULL
ON CONFLICT (source_name) DO NOTHING;

-- Add a few known-variant aliases to demo cross-source resolution working
-- (these are synthetic — in prod, JotForm submissions would naturally produce
-- variants that need mapping, and auto-population would handle them in D3)
INSERT INTO driver_crossrefs (source_name, canonical_name, confirmed) VALUES
  ('Mike Johnson', 'Mike Johnson', true),
  ('M. Johnson', 'Mike Johnson', true),
  ('Johnson, Mike', 'Mike Johnson', true),
  ('Jose Ramirez', 'Jose Ramirez', true),
  ('J. Ramirez', 'Jose Ramirez', false),
  ('José Ramírez', 'Jose Ramirez', true)
ON CONFLICT (source_name) DO NOTHING;

SELECT
  count(*) as total_crossrefs,
  count(*) FILTER (WHERE confirmed) as confirmed_count,
  count(DISTINCT canonical_name) as distinct_canonicals
FROM driver_crossrefs;
