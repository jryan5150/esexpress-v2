-- Split the singular pcs_dispatch_enabled flag into per-company flags:
--   pcs_dispatch_enabled_hairpin  (A) — test division, safe for smoke-test
--   pcs_dispatch_enabled_esexpress (B) — ES Express production
--
-- Friday-drop context (2026-04-23): the drop email invites the team to
-- toggle A on themselves to push pre-seeded test loads to Hairpin and
-- verify round-trip in PCS. Independent flags let A stay on while B
-- stays off (or vice-versa) without the two paths sharing a gate.
--
-- Migration is additive and idempotent:
--   - Old `pcs_dispatch_enabled` row is preserved (legacy fallback)
--   - New rows are inserted with default 'false'
--   - If the legacy value is 'true', copy it into _esexpress to preserve
--     current production behavior (otherwise production would go dark on
--     deploy). Hairpin always defaults to 'false' — it's test, opt-in.
INSERT INTO "app_settings" (key, value, description)
VALUES (
  'pcs_dispatch_enabled_hairpin',
  'false',
  'PCS push enabled for Hairpin test division (company letter A). Safe to enable for smoke tests — pushes land in the test division, not production.'
)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO "app_settings" (key, value, description)
VALUES (
  'pcs_dispatch_enabled_esexpress',
  COALESCE(
    (SELECT value FROM "app_settings" WHERE key = 'pcs_dispatch_enabled'),
    'false'
  ),
  'PCS push enabled for ES Express production division (company letter B). Inherits from legacy pcs_dispatch_enabled on first migration.'
)
ON CONFLICT (key) DO NOTHING;
