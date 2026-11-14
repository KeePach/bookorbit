CREATE TABLE IF NOT EXISTS "series_release_tracking" (
	"series_id" integer PRIMARY KEY NOT NULL,
	"finished" boolean DEFAULT false NOT NULL,
	"checked_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_release_tracking_series_id_book_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."book_series"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "series_releases" (
	"id" serial PRIMARY KEY NOT NULL,
	"series_id" integer NOT NULL,
	"volume" varchar(60) NOT NULL,
	"release_date" date,
	"store_url" varchar(2000),
	"note" varchar(1000),
	"cover" text,
	"status" varchar(12) DEFAULT 'upcoming' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_releases_series_id_book_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."book_series"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "series_releases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "series_releases_status_chk" CHECK ("series_releases"."status" in ('upcoming', 'collected', 'skipped')),
	CONSTRAINT "series_releases_volume_not_empty_chk" CHECK (char_length("series_releases"."volume") >= 1),
	CONSTRAINT "series_releases_cover_length_chk" CHECK ("series_releases"."cover" is null or char_length("series_releases"."cover") <= 450000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "series_releases_series_status_idx" ON "series_releases" USING btree ("series_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "series_releases_status_release_date_idx" ON "series_releases" USING btree ("status","release_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "series_releases_series_volume_open_uidx" ON "series_releases" USING btree ("series_id","volume") WHERE "series_releases"."status" = 'upcoming';
