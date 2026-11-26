import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { KccOptionValues } from '@bookorbit/types';

import { DB } from '../../db';
import * as schema from '../../db/schema';
import { bookFiles, bookMetadata, books, libraries } from '../../db/schema';
import { FORK_KCC_DDL, forkKccPresets } from './kcc.table';

export interface KccBookFile {
  bookId: number;
  libraryId: number;
  title: string | null;
  fileId: number;
  absolutePath: string;
  relPath: string | null;
  bookFolderPath: string;
  format: string | null;
  fileHash: string | null;
  fileWriteEnabled: boolean;
  excludePatterns: string[];
}

export type KccPresetRow = typeof forkKccPresets.$inferSelect;

@Injectable()
export class KccRepository implements OnModuleInit {
  constructor(@Inject(DB) private readonly db: NodePgDatabase<typeof schema>) {}

  async onModuleInit(): Promise<void> {
    for (const statement of FORK_KCC_DDL) {
      await this.db.execute(sql.raw(statement));
    }
  }

  /** The book's primary file and the library settings that decide what a conversion may do. */
  async findBookFile(bookId: number): Promise<KccBookFile | null> {
    const [row] = await this.db
      .select({
        bookId: books.id,
        libraryId: books.libraryId,
        title: bookMetadata.title,
        fileId: bookFiles.id,
        absolutePath: bookFiles.absolutePath,
        relPath: bookFiles.relPath,
        bookFolderPath: books.folderPath,
        format: bookFiles.format,
        fileHash: bookFiles.fileHash,
        fileWriteEnabled: libraries.fileWriteEnabled,
        excludePatterns: libraries.excludePatterns,
      })
      .from(books)
      .innerJoin(bookFiles, eq(bookFiles.id, books.primaryFileId))
      .innerJoin(libraries, eq(libraries.id, books.libraryId))
      .leftJoin(bookMetadata, eq(bookMetadata.bookId, books.id))
      .where(eq(books.id, bookId))
      .limit(1);
    return row ?? null;
  }

  /** True when another file row or book already uses `absolutePath`. */
  async pathTaken(absolutePath: string, exceptFileId: number): Promise<boolean> {
    const [file] = await this.db
      .select({ id: bookFiles.id })
      .from(bookFiles)
      .where(and(eq(bookFiles.absolutePath, absolutePath), ne(bookFiles.id, exceptFileId)))
      .limit(1);
    if (file) return true;
    const [book] = await this.db.select({ id: books.id }).from(books).where(eq(books.folderPath, absolutePath)).limit(1);
    return Boolean(book);
  }

  /**
   * Points the file row at its new name and format (Name.cbr -> Name.cbz). In a File as Book
   * library the book's folder path is the file itself, so it moves with it.
   */
  async moveBookFile(file: KccBookFile, absolutePath: string, relPath: string | null): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(bookFiles).set({ absolutePath, relPath, format: 'cbz', updatedAt: new Date() }).where(eq(bookFiles.id, file.fileId));
      await tx
        .update(books)
        .set({ folderPath: absolutePath })
        .where(and(eq(books.id, file.bookId), eq(books.folderPath, file.absolutePath)));
    });
  }

  listPresets(userId: number): Promise<KccPresetRow[]> {
    return this.db.select().from(forkKccPresets).where(eq(forkKccPresets.userId, userId)).orderBy(asc(forkKccPresets.name));
  }

  async findPreset(userId: number, id: number): Promise<KccPresetRow | null> {
    const [row] = await this.db
      .select()
      .from(forkKccPresets)
      .where(and(eq(forkKccPresets.userId, userId), eq(forkKccPresets.id, id)))
      .limit(1);
    return row ?? null;
  }

  async findPresetByName(userId: number, name: string): Promise<KccPresetRow | null> {
    const [row] = await this.db
      .select()
      .from(forkKccPresets)
      .where(and(eq(forkKccPresets.userId, userId), eq(forkKccPresets.name, name)))
      .limit(1);
    return row ?? null;
  }

  async createPreset(userId: number, name: string, options: KccOptionValues): Promise<KccPresetRow> {
    const [row] = await this.db.insert(forkKccPresets).values({ userId, name, options }).returning();
    return row;
  }

  async updatePreset(userId: number, id: number, name: string, options: KccOptionValues): Promise<KccPresetRow | null> {
    const [row] = await this.db
      .update(forkKccPresets)
      .set({ name, options, updatedAt: new Date() })
      .where(and(eq(forkKccPresets.userId, userId), eq(forkKccPresets.id, id)))
      .returning();
    return row ?? null;
  }

  async deletePreset(userId: number, id: number): Promise<boolean> {
    const rows = await this.db
      .delete(forkKccPresets)
      .where(and(eq(forkKccPresets.userId, userId), eq(forkKccPresets.id, id)))
      .returning({ id: forkKccPresets.id });
    return rows.length > 0;
  }
}
