import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { chunk } from '../../common/utils/batch.utils';
import { DB } from '../../db';
import * as schema from '../../db/schema';
import { bookFiles, bookMetadata, books, koreaderBookHashLinks, libraries } from '../../db/schema';

export interface TrackedFile {
  bookFileId: number;
  bookId: number;
  libraryId: number;
  title: string | null;
  fileHash: string | null;
  sizeBytes: number | null;
  format: string | null;
  role: string;
  mediaOverlayAvailable: boolean;
}

export interface LibrarySummary {
  id: number;
  name: string;
}

@Injectable()
export class FileUpdatesRepository {
  constructor(@Inject(DB) private readonly db: NodePgDatabase<typeof schema>) {}

  /** Files of present books, limited to `libraryIds` unless null. */
  async findFiles(bookFileIds: number[], libraryIds: number[] | null): Promise<TrackedFile[]> {
    if (bookFileIds.length === 0 || (libraryIds !== null && libraryIds.length === 0)) return [];
    return this.db
      .select({
        bookFileId: bookFiles.id,
        bookId: books.id,
        libraryId: books.libraryId,
        title: bookMetadata.title,
        fileHash: bookFiles.fileHash,
        sizeBytes: bookFiles.sizeBytes,
        format: bookFiles.format,
        role: bookFiles.role,
        mediaOverlayAvailable: bookFiles.mediaOverlayAvailable,
      })
      .from(bookFiles)
      .innerJoin(books, eq(books.id, bookFiles.bookId))
      .leftJoin(bookMetadata, eq(bookMetadata.bookId, books.id))
      .where(and(inArray(bookFiles.id, bookFileIds), eq(books.status, 'present'), libraryIds ? inArray(books.libraryId, libraryIds) : undefined));
  }

  async listLibraries(libraryIds: number[] | null): Promise<LibrarySummary[]> {
    if (libraryIds !== null && libraryIds.length === 0) return [];
    return this.db
      .select({ id: libraries.id, name: libraries.name })
      .from(libraries)
      .where(libraryIds ? inArray(libraries.id, libraryIds) : undefined)
      .orderBy(asc(libraries.displayOrder), asc(libraries.name));
  }

  /**
   * Deletes this user's hash links that point a device hash at exactly the given file. A link for
   * the file's own current hash is never a real link, so it is left alone.
   */
  async deleteHashLinks(userId: number, links: { hash: string; bookFileId: number }[]): Promise<number> {
    let deleted = 0;
    for (const batch of chunk(links, 200)) {
      const rows = await this.db
        .delete(koreaderBookHashLinks)
        .where(
          and(
            eq(koreaderBookHashLinks.userId, userId),
            or(...batch.map((link) => and(eq(koreaderBookHashLinks.hash, link.hash), eq(koreaderBookHashLinks.bookFileId, link.bookFileId)))),
            sql`not exists (select 1 from ${bookFiles} where ${bookFiles.id} = ${koreaderBookHashLinks.bookFileId} and ${bookFiles.fileHash} = ${koreaderBookHashLinks.hash})`,
          ),
        )
        .returning({ hash: koreaderBookHashLinks.hash });
      deleted += rows.length;
    }
    return deleted;
  }
}
