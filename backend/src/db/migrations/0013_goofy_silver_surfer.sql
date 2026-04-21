CREATE TABLE "load_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"load_id" integer NOT NULL,
	"author_user_id" integer,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "load_comments" ADD CONSTRAINT "load_comments_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_comments" ADD CONSTRAINT "load_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_load_comments_load_id" ON "load_comments" USING btree ("load_id","created_at");