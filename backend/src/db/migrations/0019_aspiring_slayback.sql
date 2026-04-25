CREATE TABLE "pcs_known_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"pcs_load_id" text NOT NULL,
	"shipper_ticket" text,
	"load_reference" text,
	"pcs_status" text,
	"shipper_company" text,
	"consignee_company" text,
	"pickup_date" text,
	"total_weight" text,
	"division" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pcs_known_tickets_load" ON "pcs_known_tickets" USING btree ("pcs_load_id");--> statement-breakpoint
CREATE INDEX "idx_pcs_known_tickets_ticket" ON "pcs_known_tickets" USING btree ("shipper_ticket");