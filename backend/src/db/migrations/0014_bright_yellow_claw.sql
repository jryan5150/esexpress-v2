CREATE TABLE "carriers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phase" text DEFAULT 'phase1' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carriers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "wells" ADD COLUMN "rate_per_ton" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "wells" ADD COLUMN "ffc_rate" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "wells" ADD COLUMN "fsc_rate" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "wells" ADD COLUMN "mileage_from_loader" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "wells" ADD COLUMN "customer_name" text;--> statement-breakpoint
ALTER TABLE "wells" ADD COLUMN "carrier_id" integer;--> statement-breakpoint
ALTER TABLE "wells" ADD COLUMN "loader_sandplant" text;--> statement-breakpoint
ALTER TABLE "wells" ADD CONSTRAINT "wells_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Seed the three known carriers. Everyone starts in phase1 (Jessica
-- validates all their loads). The phase-flip to phase2 (builder
-- self-validates) happens per-carrier once PCS REST dispatch is live.
INSERT INTO "carriers" ("name", "phase", "active") VALUES
  ('Liberty', 'phase1', true),
  ('Logistiq', 'phase1', true),
  ('JRT', 'phase1', true)
ON CONFLICT ("name") DO NOTHING;