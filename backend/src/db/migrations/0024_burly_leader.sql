CREATE TABLE "builder_routing" (
	"id" serial PRIMARY KEY NOT NULL,
	"builder_name" text NOT NULL,
	"customer_id" integer,
	"primary" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "builder_routing" ADD CONSTRAINT "builder_routing_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;