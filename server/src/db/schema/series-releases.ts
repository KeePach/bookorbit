import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, pgTable, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import { users } from './auth';
import { bookSeries } from './series';

/** A series someone follows for volumes that are not in the library yet. */
export const seriesReleaseTracking = pgTable('series_release_tracking', {
  seriesId: integer('series_id')
    .primaryKey()
    .references(() => bookSeries.id, { onDelete: 'cascade' }),
  // No more volumes are expected, so none is suggested after the last one.
  finished: boolean('finished').notNull().default(false),
  // The last day someone looked for a release date.
  checkedAt: date('checked_at', { mode: 'string' }),
  // The last day the "time to check for a date" reminder went out, so it nags monthly, not daily.
  checkNotifiedAt: date('check_notified_at', { mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

export type SeriesReleaseTrackingRow = typeof seriesReleaseTracking.$inferSelect;

/** A volume of a series that is not in the library yet, entered by hand. */
export const seriesReleases = pgTable(
  'series_releases',
  {
    id: serial('id').primaryKey(),
    seriesId: integer('series_id')
      .notNull()
      .references(() => bookSeries.id, { onDelete: 'cascade' }),
    volume: varchar('volume', { length: 60 }).notNull(),
    releaseDate: date('release_date', { mode: 'string' }),
    storeUrl: varchar('store_url', { length: 2000 }),
    note: varchar('note', { length: 1000 }),
    // An https link or a small inline picture; the limit matches SERIES_RELEASE_COVER_MAX_LENGTH.
    cover: text('cover'),
    status: varchar('status', { length: 12 }).$type<'upcoming' | 'collected' | 'skipped'>().notNull().default('upcoming'),
    // How far the reminders got for this volume ('soon', then 'today'), so each fires once.
    notifiedStage: varchar('notified_stage', { length: 10 }).$type<'soon' | 'today'>(),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index('series_releases_series_status_idx').on(t.seriesId, t.status),
    index('series_releases_status_release_date_idx').on(t.status, t.releaseDate),
    uniqueIndex('series_releases_series_volume_open_uidx')
      .on(t.seriesId, t.volume)
      .where(sql`${t.status} = 'upcoming'`),
    check('series_releases_status_chk', sql`${t.status} in ('upcoming', 'collected', 'skipped')`),
    check('series_releases_volume_not_empty_chk', sql`char_length(${t.volume}) >= 1`),
    check('series_releases_cover_length_chk', sql`${t.cover} is null or char_length(${t.cover}) <= 450000`),
  ],
);

export type SeriesReleaseRow = typeof seriesReleases.$inferSelect;
export type NewSeriesRelease = typeof seriesReleases.$inferInsert;

/**
 * What the MangaBaka database said about a series the last time its dump was checked.
 * `override` is the human's veto over a wrong title match; `autoTrackedAt` remembers that
 * tracking was already turned on (or found on) once, so an untracked series is not re-tracked.
 */
export const seriesLicenses = pgTable('series_licenses', {
  seriesId: integer('series_id')
    .primaryKey()
    .references(() => bookSeries.id, { onDelete: 'cascade' }),
  licensed: boolean('licensed').notNull().default(false),
  mangabakaId: varchar('mangabaka_id', { length: 20 }),
  matchedBy: varchar('matched_by', { length: 10 }).$type<'id' | 'title'>(),
  /** English publishers, comma-joined, for the series page line. */
  publishers: text('publishers'),
  override: varchar('override', { length: 6 }).$type<'always' | 'never'>(),
  autoTrackedAt: timestamp('auto_tracked_at', { withTimezone: true }),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One row of licensing configuration and run state; `id` is always 1. */
export const seriesLicenseSettings = pgTable('series_license_settings', {
  id: integer('id').primaryKey().default(1),
  /** The libraries whose series are checked and auto-tracked (the manga ones). */
  libraryIds: integer('library_ids').array().notNull().default([]),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastRunSeries: integer('last_run_series'),
  lastRunLicensed: integer('last_run_licensed'),
  lastRunError: text('last_run_error'),
  /** The last day the "licensing data is stale" reminder went out. */
  staleNotifiedAt: date('stale_notified_at', { mode: 'string' }),
});

export type SeriesLicenseRow = typeof seriesLicenses.$inferSelect;
export type SeriesLicenseSettingsRow = typeof seriesLicenseSettings.$inferSelect;
