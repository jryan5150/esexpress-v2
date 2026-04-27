-- 2026-04-27: per-well FSC calculation method (miles vs weight). Per Jess —
-- FSC is calculated by either fscRate × mileage or fscRate × weightTons
-- depending on the well configuration. Defaults to NULL (no FSC).
ALTER TABLE "wells" ADD COLUMN IF NOT EXISTS "fsc_method" text;
ALTER TABLE "wells" ADD CONSTRAINT "wells_fsc_method_check"
  CHECK ("fsc_method" IS NULL OR "fsc_method" IN ('miles', 'weight'));
