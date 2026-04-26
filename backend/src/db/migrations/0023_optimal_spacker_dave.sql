CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"pcs_bill_to_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "operators" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operators_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "shipper_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_name" text NOT NULL,
	"shipper_id" integer,
	"confidence" numeric(4, 3) DEFAULT '0',
	"confirmed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "shipper_mappings_source_name_unique" UNIQUE("source_name")
);
--> statement-breakpoint
CREATE TABLE "shippers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"state" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shippers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "customer_mappings" ADD COLUMN "canonical_customer_id" integer;--> statement-breakpoint
ALTER TABLE "loads" ADD COLUMN "customer_id" integer;--> statement-breakpoint
ALTER TABLE "loads" ADD COLUMN "carrier_id_fk" integer;--> statement-breakpoint
ALTER TABLE "loads" ADD COLUMN "shipper_id" integer;--> statement-breakpoint
ALTER TABLE "wells" ADD COLUMN "operator_id" integer;--> statement-breakpoint
ALTER TABLE "shipper_mappings" ADD CONSTRAINT "shipper_mappings_shipper_id_shippers_id_fk" FOREIGN KEY ("shipper_id") REFERENCES "public"."shippers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_mappings" ADD CONSTRAINT "customer_mappings_canonical_customer_id_customers_id_fk" FOREIGN KEY ("canonical_customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;