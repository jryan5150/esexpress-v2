-- Phase 2 cleanup migration. Hand-crafted (not drizzle-generated) because:
--  1. Adding FK constraints AFTER backfill is safer than during table create
--     (backfill could violate FK; better to validate then enforce)
--  2. Renaming builder_routing.primary → is_primary needs the data column
--     rename, not just a schema redefinition

-- 1. FK CONSTRAINTS on the new normalized columns
ALTER TABLE "loads" ADD CONSTRAINT "loads_customer_id_customers_id_fk"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "loads" ADD CONSTRAINT "loads_carrier_id_fk_carriers_id_fk"
  FOREIGN KEY ("carrier_id_fk") REFERENCES "carriers"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "loads" ADD CONSTRAINT "loads_shipper_id_shippers_id_fk"
  FOREIGN KEY ("shipper_id") REFERENCES "shippers"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "wells" ADD CONSTRAINT "wells_operator_id_operators_id_fk"
  FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- 2. Indexes for the FK columns (FK without index = slow joins/cascades)
CREATE INDEX IF NOT EXISTS "idx_loads_customer_id" ON "loads" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_loads_carrier_id_fk" ON "loads" ("carrier_id_fk");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_loads_shipper_id" ON "loads" ("shipper_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wells_operator_id" ON "wells" ("operator_id");
--> statement-breakpoint

-- 3. Rename builder_routing.primary → is_primary (Postgres reserved word)
ALTER TABLE "builder_routing" RENAME COLUMN "primary" TO "is_primary";
