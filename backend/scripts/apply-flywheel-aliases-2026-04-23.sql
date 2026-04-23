-- Flywheel alias additions 2026-04-23 (14 historical variants, 1984 loads impact)
BEGIN;
-- Roberts: 3 aliases (652 hist loads)
UPDATE wells SET aliases = (
  SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(COALESCE(aliases, '[]'::jsonb) || '["Cudd Eckard Roberts", "Liberty Easy Comstock Roberts", "HAL-War/Com Roberts"]'::jsonb) x
) WHERE name = 'Roberts';
-- Zappenduster: 1 aliases (293 hist loads)
UPDATE wells SET aliases = (
  SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(COALESCE(aliases, '[]'::jsonb) || '["Liberty Dynasty Zappenduster"]'::jsonb) x
) WHERE name = 'Zappenduster';
-- Jeanine: 1 aliases (286 hist loads)
UPDATE wells SET aliases = (
  SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(COALESCE(aliases, '[]'::jsonb) || '["Liberty HV Raptor Apex Jeanine"]'::jsonb) x
) WHERE name = 'Jeanine';
-- Jarzombek: 1 aliases (249 hist loads)
UPDATE wells SET aliases = (
  SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(COALESCE(aliases, '[]'::jsonb) || '["Liberty Barrett Warwick Jarzombek"]'::jsonb) x
) WHERE name = 'Jarzombek';
-- Lindsay Ranch 2: 2 aliases (190 hist loads)
UPDATE wells SET aliases = (
  SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(COALESCE(aliases, '[]'::jsonb) || '["Liberty Ghostrider Lindsay Ranch 2", "Liberty Ghostrider Lindsay Ranch"]'::jsonb) x
) WHERE name = 'Lindsay Ranch 2';
-- Lipsey: 1 aliases (167 hist loads)
UPDATE wells SET aliases = (
  SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(COALESCE(aliases, '[]'::jsonb) || '["Liberty HV Nighthawk MEP Lipsey"]'::jsonb) x
) WHERE name = 'Lipsey';
-- Napoo: 1 aliases (104 hist loads)
UPDATE wells SET aliases = (
  SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(COALESCE(aliases, '[]'::jsonb) || '["Liberty Dynasty Verdun Napoo"]'::jsonb) x
) WHERE name = 'Napoo';
-- Moro Creek: 1 aliases (22 hist loads)
UPDATE wells SET aliases = (
  SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(COALESCE(aliases, '[]'::jsonb) || '["Liberty Kiowa Verdun Moro Creek"]'::jsonb) x
) WHERE name = 'Moro Creek';
-- Hauglum: 1 aliases (17 hist loads)
UPDATE wells SET aliases = (
  SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(COALESCE(aliases, '[]'::jsonb) || '["Liberty Kiowa Verdun Hauglum"]'::jsonb) x
) WHERE name = 'Hauglum';
-- Cutthroat: 1 aliases (3 hist loads)
UPDATE wells SET aliases = (
  SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(COALESCE(aliases, '[]'::jsonb) || '["Liberty Kiowa Verdun Cutthroat"]'::jsonb) x
) WHERE name = 'Cutthroat';
-- Justapor: 1 aliases (1 hist loads)
UPDATE wells SET aliases = (
  SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(COALESCE(aliases, '[]'::jsonb) || '["Liberty Raptor MEP STX Justapor"]'::jsonb) x
) WHERE name = 'Justapor';
COMMIT;