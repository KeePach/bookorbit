import { boolean, integer, jsonb, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';

import type { MangabakaSyncResult } from '@bookorbit/types';

import { bookSeries, users } from '../../db/schema';

// Fork-owned tables, created by MangabakaSyncRepository on startup and deliberately not exported
// from db/schema/index.ts, so drizzle-kit and the upstream migration journal never see them.

/** One row per user who saved a MangaBaka personal access token. */
export const forkMangabakaSyncSettings = pgTable('fork_mangabaka_sync_settings', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  apiToken: varchar('api_token', { length: 512 }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/** The series a user chose to sync, with what the last sync did. */
export const forkMangabakaSyncSeries = pgTable(
  'fork_mangabaka_sync_series',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seriesId: integer('series_id')
      .notNull()
      .references(() => bookSeries.id, { onDelete: 'cascade' }),
    lastResult: jsonb('last_result').$type<MangabakaSyncResult>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.seriesId] })],
);

export const FORK_MANGABAKA_SYNC_DDL = [
  `CREATE TABLE IF NOT EXISTS fork_mangabaka_sync_settings (
    user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    api_token varchar(512) NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS fork_mangabaka_sync_series (
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    series_id integer NOT NULL REFERENCES book_series(id) ON DELETE CASCADE,
    last_result jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, series_id)
  )`,
  `CREATE INDEX IF NOT EXISTS fork_mangabaka_sync_series_series_idx ON fork_mangabaka_sync_series (series_id)`,
];
