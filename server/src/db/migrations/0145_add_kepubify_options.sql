ALTER TABLE "kobo_sync_settings" ADD COLUMN "kepub_custom_css" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "kobo_sync_settings" ADD COLUMN "kepub_fullscreen_reading_fixes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "kobo_sync_settings" ADD COLUMN "kepub_title_page" varchar(8) DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "kobo_sync_settings" ADD COLUMN "kepub_detect_cover" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "kobo_sync_settings" ADD CONSTRAINT "kobo_sync_settings_kepub_title_page_chk" CHECK ("kobo_sync_settings"."kepub_title_page" in ('auto', 'on', 'off'));--> statement-breakpoint
ALTER TABLE "kobo_sync_settings" ADD CONSTRAINT "kobo_sync_settings_kepub_custom_css_length_chk" CHECK (char_length("kobo_sync_settings"."kepub_custom_css") <= 10000);