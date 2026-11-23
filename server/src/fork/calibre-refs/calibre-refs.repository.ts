import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, gt, gte, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DB } from '../../db';
import * as schema from '../../db/schema';
import { books } from '../../db/schema';
import { FORK_BOOK_CALIBRE_REFS_DDL, forkBookCalibreRefs } from './calibre-refs.table';

export interface IndexableBook {
  id: number;
  folderPath: string;
}

export interface CalibreRefRow {
  bookId: number;
  opfMtime: Date;
}

export interface UuidBookMatch {
  uuid: string;
  bookId: number;
  bookFileId: number;
}

@Injectable()
export class CalibreRefsRepository implements OnModuleInit {
  constructor(@Inject(DB) private readonly db: NodePgDatabase<typeof schema>) {}

  async onModuleInit(): Promise<void> {
    for (const statement of FORK_BOOK_CALIBRE_REFS_DDL) {
      await this.db.execute(sql.raw(statement));
    }
  }

  /** Present books after `afterId`, in id order, optionally only those added or changed since `since`. */
  async findIndexableBooks(afterId: number, limit: number, since?: Date): Promise<IndexableBook[]> {
    const changedSince = since ? or(gte(books.addedAt, since), gte(books.updatedAt, since)) : undefined;
    return this.db
      .select({ id: books.id, folderPath: books.folderPath })
      .from(books)
      .where(and(gt(books.id, afterId), eq(books.status, 'present'), changedSince))
      .orderBy(asc(books.id))
      .limit(limit);
  }

  async findRefs(bookIds: number[]): Promise<CalibreRefRow[]> {
    if (bookIds.length === 0) return [];
    return this.db
      .select({ bookId: forkBookCalibreRefs.bookId, opfMtime: forkBookCalibreRefs.opfMtime })
      .from(forkBookCalibreRefs)
      .where(inArray(forkBookCalibreRefs.bookId, bookIds));
  }

  async upsertRef(bookId: number, calibreUuid: string, calibreBookId: number | null, opfMtime: Date): Promise<void> {
    await this.db
      .insert(forkBookCalibreRefs)
      .values({ bookId, calibreUuid, calibreBookId, opfMtime })
      .onConflictDoUpdate({
        target: forkBookCalibreRefs.bookId,
        set: { calibreUuid, calibreBookId, opfMtime, updatedAt: new Date() },
      });
  }

  async deleteRefs(bookIds: number[]): Promise<void> {
    if (bookIds.length === 0) return;
    await this.db.delete(forkBookCalibreRefs).where(inArray(forkBookCalibreRefs.bookId, bookIds));
  }

  /** Present books with a primary file whose Calibre uuid is one of `uuids`, limited to `libraryIds` unless null. */
  async findBooksByUuids(uuids: string[], libraryIds: number[] | null): Promise<UuidBookMatch[]> {
    if (uuids.length === 0 || (libraryIds !== null && libraryIds.length === 0)) return [];
    const rows = await this.db
      .select({ uuid: forkBookCalibreRefs.calibreUuid, bookId: books.id, bookFileId: books.primaryFileId })
      .from(forkBookCalibreRefs)
      .innerJoin(books, eq(books.id, forkBookCalibreRefs.bookId))
      .where(
        and(
          inArray(forkBookCalibreRefs.calibreUuid, uuids),
          eq(books.status, 'present'),
          isNotNull(books.primaryFileId),
          libraryIds ? inArray(books.libraryId, libraryIds) : undefined,
        ),
      );
    return rows.flatMap((row) => (row.bookFileId === null ? [] : [{ uuid: row.uuid, bookId: row.bookId, bookFileId: row.bookFileId }]));
  }
}
