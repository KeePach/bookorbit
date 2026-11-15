ALTER TABLE "series_releases" ADD COLUMN IF NOT EXISTS "notified_stage" varchar(10);--> statement-breakpoint
ALTER TABLE "series_release_tracking" ADD COLUMN IF NOT EXISTS "check_notified_at" date;
