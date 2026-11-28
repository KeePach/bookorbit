import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { MangabakaSyncResult, ReadStatus } from '@bookorbit/types';

import { resolveTimeZone } from '../../common/utils/timezone.utils';
import { DB } from '../../db';
import * as schema from '../../db/schema';
import { bookProviderIds, bookSeries, bookSeriesMemberships, books, seriesLicenses, userBookStatus, users } from '../../db/schema';
import { FORK_MANGABAKA_SYNC_DDL, forkMangabakaSyncSeries, forkMangabakaSyncSettings } from './mangabaka-sync.table';

export type MangabakaSyncSettingsRow = typeof forkMangabakaSyncSettings.$inferSelect;

export interface MangabakaSyncSeriesRow {
  seriesId: number;
  seriesName: string;
  lastResult: MangabakaSyncResult | null;
}

export interface MangabakaSeriesBookRow {
  bookId: number;
  status: ReadStatus | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  providerId: string | null;
}

/** The provider key BookOrbit stores MangaBaka ids under (same as the licensing check). */
const MANGABAKA_PROVIDER = 'mangabaka';

@Injectable()
export class MangabakaSyncRepository implements OnModuleInit {
  constructor(@Inject(DB) private readonly db: NodePgDatabase<typeof schema>) {}

  async onModuleInit(): Promise<void> {
    for (const statement of FORK_MANGABAKA_SYNC_DDL) {
      await this.db.execute(sql.raw(statement));
    }
  }

  async findSettings(userId: number): Promise<MangabakaSyncSettingsRow | null> {
    const [row] = await this.db.select().from(forkMangabakaSyncSettings).where(eq(forkMangabakaSyncSettings.userId, userId)).limit(1);
    return row ?? null;
  }

  async saveToken(userId: number, apiToken: string): Promise<void> {
    await this.db
      .insert(forkMangabakaSyncSettings)
      .values({ userId, apiToken })
      .onConflictDoUpdate({ target: forkMangabakaSyncSettings.userId, set: { apiToken, updatedAt: new Date() } });
  }

  async setEnabled(userId: number, enabled: boolean): Promise<void> {
    await this.db.update(forkMangabakaSyncSettings).set({ enabled, updatedAt: new Date() }).where(eq(forkMangabakaSyncSettings.userId, userId));
  }

  async deleteSettings(userId: number): Promise<void> {
    await this.db.delete(forkMangabakaSyncSettings).where(eq(forkMangabakaSyncSettings.userId, userId));
  }

  /** Users with a saved token and sync switched on. */
  async listActiveUserIds(): Promise<number[]> {
    const rows = await this.db
      .select({ userId: forkMangabakaSyncSettings.userId })
      .from(forkMangabakaSyncSettings)
      .where(eq(forkMangabakaSyncSettings.enabled, true))
      .orderBy(asc(forkMangabakaSyncSettings.userId));
    return rows.map((row) => row.userId);
  }

  async listSelected(userId: number): Promise<MangabakaSyncSeriesRow[]> {
    return this.db
      .select({ seriesId: forkMangabakaSyncSeries.seriesId, seriesName: bookSeries.name, lastResult: forkMangabakaSyncSeries.lastResult })
      .from(forkMangabakaSyncSeries)
      .innerJoin(bookSeries, eq(bookSeries.id, forkMangabakaSyncSeries.seriesId))
      .where(eq(forkMangabakaSyncSeries.userId, userId))
      .orderBy(asc(bookSeries.name));
  }

  async findSelected(userId: number, seriesId: number): Promise<MangabakaSyncSeriesRow | null> {
    const [row] = await this.db
      .select({ seriesId: forkMangabakaSyncSeries.seriesId, seriesName: bookSeries.name, lastResult: forkMangabakaSyncSeries.lastResult })
      .from(forkMangabakaSyncSeries)
      .innerJoin(bookSeries, eq(bookSeries.id, forkMangabakaSyncSeries.seriesId))
      .where(and(eq(forkMangabakaSyncSeries.userId, userId), eq(forkMangabakaSyncSeries.seriesId, seriesId)))
      .limit(1);
    return row ?? null;
  }

  async select(userId: number, seriesId: number): Promise<void> {
    await this.db.insert(forkMangabakaSyncSeries).values({ userId, seriesId }).onConflictDoNothing();
  }

  async unselect(userId: number, seriesId: number): Promise<void> {
    await this.db
      .delete(forkMangabakaSyncSeries)
      .where(and(eq(forkMangabakaSyncSeries.userId, userId), eq(forkMangabakaSyncSeries.seriesId, seriesId)));
  }

  async saveResult(userId: number, seriesId: number, result: MangabakaSyncResult): Promise<void> {
    await this.db
      .update(forkMangabakaSyncSeries)
      .set({ lastResult: result })
      .where(and(eq(forkMangabakaSyncSeries.userId, userId), eq(forkMangabakaSyncSeries.seriesId, seriesId)));
  }

  /** The selected series a book belongs to, for the user whose status changed. */
  async selectedSeriesForBook(userId: number, bookId: number): Promise<number[]> {
    const rows = await this.db
      .select({ seriesId: bookSeriesMemberships.seriesId })
      .from(bookSeriesMemberships)
      .innerJoin(
        forkMangabakaSyncSeries,
        and(eq(forkMangabakaSyncSeries.seriesId, bookSeriesMemberships.seriesId), eq(forkMangabakaSyncSeries.userId, userId)),
      )
      .where(eq(bookSeriesMemberships.bookId, bookId));
    return rows.map((row) => row.seriesId);
  }

  async seriesExists(seriesId: number): Promise<boolean> {
    const [row] = await this.db.select({ id: bookSeries.id }).from(bookSeries).where(eq(bookSeries.id, seriesId)).limit(1);
    return Boolean(row);
  }

  /**
   * The series' books the user can see (present files only), with the user's status and each
   * book's MangaBaka provider id. `libraryIds` null means every library.
   */
  async seriesBooks(userId: number, seriesId: number, libraryIds: number[] | null): Promise<MangabakaSeriesBookRow[]> {
    if (libraryIds !== null && libraryIds.length === 0) return [];
    const rows = await this.db
      .select({
        bookId: books.id,
        status: userBookStatus.status,
        startedAt: userBookStatus.startedAt,
        finishedAt: userBookStatus.finishedAt,
        providerId: bookProviderIds.externalId,
      })
      .from(bookSeriesMemberships)
      .innerJoin(books, eq(books.id, bookSeriesMemberships.bookId))
      .leftJoin(userBookStatus, and(eq(userBookStatus.bookId, books.id), eq(userBookStatus.userId, userId)))
      .leftJoin(bookProviderIds, and(eq(bookProviderIds.bookId, books.id), eq(bookProviderIds.provider, MANGABAKA_PROVIDER)))
      .where(
        and(
          eq(bookSeriesMemberships.seriesId, seriesId),
          eq(books.status, 'present'),
          libraryIds === null ? undefined : inArray(books.libraryId, libraryIds),
        ),
      )
      .orderBy(asc(books.id));
    return rows.map((row) => ({ ...row, status: (row.status as ReadStatus | null) ?? null }));
  }

  /** The MangaBaka id the licensing check matched the series to, if any. */
  async licensingMangabakaId(seriesId: number): Promise<string | null> {
    const [row] = await this.db.select({ id: seriesLicenses.mangabakaId }).from(seriesLicenses).where(eq(seriesLicenses.seriesId, seriesId)).limit(1);
    return row?.id ?? null;
  }

  async userTimeZone(userId: number): Promise<string> {
    const [row] = await this.db.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1);
    return resolveTimeZone((row?.settings as { timezone?: unknown } | null)?.timezone, process.env.TZ || 'UTC');
  }
}
