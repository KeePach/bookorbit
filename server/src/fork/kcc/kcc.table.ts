import { index, integer, jsonb, pgTable, serial, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import type { KccOptionValues } from '@bookorbit/types';

import { users } from '../../db/schema';

// Fork-owned table, created by KccRepository on startup and deliberately not exported from
// db/schema/index.ts, so drizzle-kit and the upstream migration journal never see it.
export const forkKccPresets = pgTable(
  'fork_kcc_presets',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    options: jsonb('options').$type<KccOptionValues>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('fork_kcc_presets_user_idx').on(t.userId), uniqueIndex('fork_kcc_presets_user_name_uidx').on(t.userId, t.name)],
);

export const FORK_KCC_DDL = [
  `CREATE TABLE IF NOT EXISTS fork_kcc_presets (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    options jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS fork_kcc_presets_user_idx ON fork_kcc_presets (user_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS fork_kcc_presets_user_name_uidx ON fork_kcc_presets (user_id, name)`,
];
