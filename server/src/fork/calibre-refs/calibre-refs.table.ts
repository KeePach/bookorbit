import { index, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { books } from '../../db/schema';

// Fork-owned table. It is deliberately not exported from db/schema/index.ts, so drizzle-kit and the
// upstream migration journal never see it; CalibreRefsRepository creates it on startup instead.
export const forkBookCalibreRefs = pgTable(
  'fork_book_calibre_refs',
  {
    bookId: integer('book_id')
      .primaryKey()
      .references(() => books.id, { onDelete: 'cascade' }),
    calibreUuid: varchar('calibre_uuid', { length: 36 }).notNull(),
    calibreBookId: integer('calibre_book_id'),
    opfMtime: timestamp('opf_mtime', { withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('fork_book_calibre_refs_uuid_idx').on(t.calibreUuid)],
);

export const FORK_BOOK_CALIBRE_REFS_DDL = [
  `CREATE TABLE IF NOT EXISTS fork_book_calibre_refs (
    book_id integer PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
    calibre_uuid varchar(36) NOT NULL,
    calibre_book_id integer,
    opf_mtime timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS fork_book_calibre_refs_uuid_idx ON fork_book_calibre_refs (calibre_uuid)`,
];
