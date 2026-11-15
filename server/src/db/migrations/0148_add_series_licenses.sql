CREATE TABLE IF NOT EXISTS "series_licenses" (
	"series_id" integer PRIMARY KEY NOT NULL,
	"licensed" boolean DEFAULT false NOT NULL,
	"mangabaka_id" varchar(20),
	"matched_by" varchar(10),
	"publishers" text,
	"override" varchar(6),
	"auto_tracked_at" timestamp with time zone,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_licenses_series_id_book_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."book_series"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "series_license_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"library_ids" integer[] DEFAULT '{}' NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_run_series" integer,
	"last_run_licensed" integer,
	"last_run_error" text,
	"stale_notified_at" date
);
