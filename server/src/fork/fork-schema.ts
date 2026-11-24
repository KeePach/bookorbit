import { Logger, type Provider } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DB } from '../db';
import * as schema from '../db/schema';

/**
 * Schema only this fork has: the series release and licensing tables, and the kepubify options on
 * kobo_sync_settings. It is created here at startup instead of in a drizzle migration, so the
 * migrations folder stays identical to upstream's and a sync never has to renumber a fork migration.
 * The TS definitions stay in db/schema (series-releases.ts, kobo.ts) because the code queries them;
 * drizzle-kit is never run in the fork. Every statement is idempotent: on a database that already
 * has these objects (from the old fork migration 0163) nothing changes.
 */
export const FORK_SCHEMA_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS "series_license_settings" (
    "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
    "library_ids" integer[] DEFAULT '{}' NOT NULL,
    "last_run_at" timestamp with time zone,
    "last_run_series" integer,
    "last_run_licensed" integer,
    "last_run_error" text,
    "stale_notified_at" date
  )`,
  `CREATE TABLE IF NOT EXISTS "series_licenses" (
    "series_id" integer PRIMARY KEY NOT NULL,
    "licensed" boolean DEFAULT false NOT NULL,
    "mangabaka_id" varchar(20),
    "matched_by" varchar(10),
    "publishers" text,
    "override" varchar(6),
    "auto_tracked_at" timestamp with time zone,
    "checked_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "series_release_tracking" (
    "series_id" integer PRIMARY KEY NOT NULL,
    "finished" boolean DEFAULT false NOT NULL,
    "checked_at" date,
    "check_notified_at" date,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "series_releases" (
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
  )`,
  `ALTER TABLE "kobo_sync_settings" ADD COLUMN IF NOT EXISTS "kepub_custom_css" text DEFAULT '' NOT NULL`,
  `ALTER TABLE "kobo_sync_settings" ADD COLUMN IF NOT EXISTS "kepub_fullscreen_reading_fixes" boolean DEFAULT false NOT NULL`,
  `ALTER TABLE "kobo_sync_settings" ADD COLUMN IF NOT EXISTS "kepub_title_page" varchar(8) DEFAULT 'auto' NOT NULL`,
  `ALTER TABLE "kobo_sync_settings" ADD COLUMN IF NOT EXISTS "kepub_detect_cover" boolean DEFAULT false NOT NULL`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'series_licenses_series_id_book_series_id_fk') THEN
      ALTER TABLE "series_licenses" ADD CONSTRAINT "series_licenses_series_id_book_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."book_series"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'series_release_tracking_series_id_book_series_id_fk') THEN
      ALTER TABLE "series_release_tracking" ADD CONSTRAINT "series_release_tracking_series_id_book_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."book_series"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'series_releases_series_id_book_series_id_fk') THEN
      ALTER TABLE "series_releases" ADD CONSTRAINT "series_releases_series_id_book_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."book_series"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'series_releases_created_by_users_id_fk') THEN
      ALTER TABLE "series_releases" ADD CONSTRAINT "series_releases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    END IF;
  END $$`,
  `CREATE INDEX IF NOT EXISTS "series_releases_series_status_idx" ON "series_releases" USING btree ("series_id","status")`,
  `CREATE INDEX IF NOT EXISTS "series_releases_status_release_date_idx" ON "series_releases" USING btree ("status","release_date")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "series_releases_series_volume_open_uidx" ON "series_releases" USING btree ("series_id","volume") WHERE "series_releases"."status" = 'upcoming'`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kobo_sync_settings_kepub_title_page_chk') THEN
      ALTER TABLE "kobo_sync_settings" ADD CONSTRAINT "kobo_sync_settings_kepub_title_page_chk" CHECK ("kobo_sync_settings"."kepub_title_page" in ('auto', 'on', 'off'));
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kobo_sync_settings_kepub_custom_css_length_chk') THEN
      ALTER TABLE "kobo_sync_settings" ADD CONSTRAINT "kobo_sync_settings_kepub_custom_css_length_chk" CHECK (char_length("kobo_sync_settings"."kepub_custom_css") <= 10000);
    END IF;
  END $$`,
];

export const FORK_SCHEMA_READY = Symbol('FORK_SCHEMA_READY');

/**
 * Nest awaits async factories while it creates providers, which happens before any onModuleInit,
 * onApplicationBootstrap or scheduled job runs and before the server listens, so nothing can query
 * these tables or columns before they exist. A failure here stops the app from starting.
 */
export const forkSchemaProvider: Provider = {
  provide: FORK_SCHEMA_READY,
  inject: [DB],
  useFactory: async (db: NodePgDatabase<typeof schema>): Promise<true> => {
    const startedAt = Date.now();
    await db.transaction(async (tx) => {
      for (const statement of FORK_SCHEMA_DDL) {
        await tx.execute(sql.raw(statement));
      }
    });
    new Logger('ForkSchema').log(`fork schema ready (${FORK_SCHEMA_DDL.length} statements, ${Date.now() - startedAt} ms)`);
    return true;
  },
};
