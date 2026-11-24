-- Fork migrations (kepubify options, series releases) renumbered to 0163 on 2026-11-24 after upstream
-- took 0162 (book editions); databases that already ran them must treat every statement as a no-op.
CREATE TABLE IF NOT EXISTS "series_license_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"library_ids" integer[] DEFAULT '{}' NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_run_series" integer,
	"last_run_licensed" integer,
	"last_run_error" text,
	"stale_notified_at" date
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "series_licenses" (
	"series_id" integer PRIMARY KEY NOT NULL,
	"licensed" boolean DEFAULT false NOT NULL,
	"mangabaka_id" varchar(20),
	"matched_by" varchar(10),
	"publishers" text,
	"override" varchar(6),
	"auto_tracked_at" timestamp with time zone,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "series_release_tracking" (
	"series_id" integer PRIMARY KEY NOT NULL,
	"finished" boolean DEFAULT false NOT NULL,
	"checked_at" date,
	"check_notified_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
	"notified_stage" varchar(10),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_releases_status_chk" CHECK ("series_releases"."status" in ('upcoming', 'collected', 'skipped')),
	CONSTRAINT "series_releases_volume_not_empty_chk" CHECK (char_length("series_releases"."volume") >= 1),
	CONSTRAINT "series_releases_cover_length_chk" CHECK ("series_releases"."cover" is null or char_length("series_releases"."cover") <= 450000)
);
--> statement-breakpoint
ALTER TABLE "kobo_sync_settings" ADD COLUMN IF NOT EXISTS "kepub_custom_css" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "kobo_sync_settings" ADD COLUMN IF NOT EXISTS "kepub_fullscreen_reading_fixes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "kobo_sync_settings" ADD COLUMN IF NOT EXISTS "kepub_title_page" varchar(8) DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "kobo_sync_settings" ADD COLUMN IF NOT EXISTS "kepub_detect_cover" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'series_licenses_series_id_book_series_id_fk') THEN
		ALTER TABLE "series_licenses" ADD CONSTRAINT "series_licenses_series_id_book_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."book_series"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'series_release_tracking_series_id_book_series_id_fk') THEN
		ALTER TABLE "series_release_tracking" ADD CONSTRAINT "series_release_tracking_series_id_book_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."book_series"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'series_releases_series_id_book_series_id_fk') THEN
		ALTER TABLE "series_releases" ADD CONSTRAINT "series_releases_series_id_book_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."book_series"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'series_releases_created_by_users_id_fk') THEN
		ALTER TABLE "series_releases" ADD CONSTRAINT "series_releases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "series_releases_series_status_idx" ON "series_releases" USING btree ("series_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "series_releases_status_release_date_idx" ON "series_releases" USING btree ("status","release_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "series_releases_series_volume_open_uidx" ON "series_releases" USING btree ("series_id","volume") WHERE "series_releases"."status" = 'upcoming';--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kobo_sync_settings_kepub_title_page_chk') THEN
		ALTER TABLE "kobo_sync_settings" ADD CONSTRAINT "kobo_sync_settings_kepub_title_page_chk" CHECK ("kobo_sync_settings"."kepub_title_page" in ('auto', 'on', 'off'));
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kobo_sync_settings_kepub_custom_css_length_chk') THEN
		ALTER TABLE "kobo_sync_settings" ADD CONSTRAINT "kobo_sync_settings_kepub_custom_css_length_chk" CHECK (char_length("kobo_sync_settings"."kepub_custom_css") <= 10000);
	END IF;
END $$;
--> statement-breakpoint
-- Repairs upstream 0143 and 0144: databases from the old fork numbering skipped them because their
-- ledger held fork rows dated after both. A no-op wherever they already ran.
CREATE TABLE IF NOT EXISTS "koreader_device_names" (
    "user_id" integer NOT NULL,
    "device_id" varchar(100) NOT NULL,
    "name" varchar(100) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "koreader_device_names_user_id_device_id_pk" PRIMARY KEY("user_id","device_id")
);
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'koreader_device_names_user_id_users_id_fk') THEN
        ALTER TABLE "koreader_device_names" ADD CONSTRAINT "koreader_device_names_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;--> statement-breakpoint
ALTER TABLE "download_clients" ADD COLUMN IF NOT EXISTS "remove_completed_downloads" boolean DEFAULT false NOT NULL;
