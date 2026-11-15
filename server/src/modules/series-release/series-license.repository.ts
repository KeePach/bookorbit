import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { SeriesLicenseOverride } from '@bookorbit/types';

import { DB } from '../../db';
import * as schema from '../../db/schema';
import {
  bookProviderIds,
  bookSeries,
  bookSeriesMemberships,
  books,
  seriesLicenses,
  seriesLicenseSettings,
  type SeriesLicenseRow,
  type SeriesLicenseSettingsRow,
} from '../../db/schema';
import type { LicenseMatch } from './series-license-matcher';

type Db = NodePgDatabase<typeof schema>;

const SETTINGS_ID = 1;

@Injectable()
export class SeriesLicenseRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async getSettings(): Promise<SeriesLicenseSettingsRow | null> {
    const [row] = await this.db.select().from(seriesLicenseSettings).where(eq(seriesLicenseSettings.id, SETTINGS_ID));
    return row ?? null;
  }

  async saveLibraries(libraryIds: number[]): Promise<SeriesLicenseSettingsRow> {
    const [row] = await this.db
      .insert(seriesLicenseSettings)
      .values({ id: SETTINGS_ID, libraryIds })
      .onConflictDoUpdate({ target: seriesLicenseSettings.id, set: { libraryIds } })
      .returning();
    return row;
  }

  async saveRunResult(result: {
    lastRunAt: Date;
    lastRunSeries: number | null;
    lastRunLicensed: number | null;
    lastRunError: string | null;
  }): Promise<void> {
    await this.db
      .insert(seriesLicenseSettings)
      .values({ id: SETTINGS_ID, libraryIds: [], ...result })
      .onConflictDoUpdate({ target: seriesLicenseSettings.id, set: result });
  }

  async setStaleNotified(day: string): Promise<void> {
    await this.db.update(seriesLicenseSettings).set({ staleNotifiedAt: day }).where(eq(seriesLicenseSettings.id, SETTINGS_ID));
  }

  /** Every series with at least one book in the given libraries, by id and name. */
  async listCandidates(libraryIds: number[]): Promise<{ seriesId: number; name: string }[]> {
    if (libraryIds.length === 0) return [];
    return this.db
      .selectDistinct({ seriesId: bookSeries.id, name: bookSeries.name })
      .from(bookSeries)
      .innerJoin(bookSeriesMemberships, eq(bookSeriesMemberships.seriesId, bookSeries.id))
      .innerJoin(books, eq(books.id, bookSeriesMemberships.bookId))
      .where(inArray(books.libraryId, libraryIds));
  }

  /**
   * The MangaBaka id BookOrbit's metadata matches stored for each series' books, the most
   * common one winning when books disagree. Ids are reduced to their leading digits, the
   * same way the userscript read them.
   */
  async listMangabakaIds(libraryIds: number[]): Promise<Map<number, string>> {
    if (libraryIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        seriesId: bookSeriesMemberships.seriesId,
        externalId: bookProviderIds.externalId,
        uses: sql<number>`cast(count(*) as int)`,
      })
      .from(bookProviderIds)
      .innerJoin(bookSeriesMemberships, eq(bookSeriesMemberships.bookId, bookProviderIds.bookId))
      .innerJoin(books, eq(books.id, bookProviderIds.bookId))
      .where(and(eq(bookProviderIds.provider, 'mangabaka'), inArray(books.libraryId, libraryIds)))
      .groupBy(bookSeriesMemberships.seriesId, bookProviderIds.externalId);
    const best = new Map<number, { id: string; uses: number }>();
    for (const row of rows) {
      const numeric = /^(\d+)/.exec(String(row.externalId));
      if (!numeric) continue;
      const current = best.get(row.seriesId);
      if (!current || row.uses > current.uses) best.set(row.seriesId, { id: numeric[1], uses: row.uses });
    }
    return new Map([...best].map(([seriesId, value]) => [seriesId, value.id]));
  }

  /** Writes a run's results, keeping each row's human override and auto-track memory. */
  async upsertMatches(matches: LicenseMatch[], checkedAt: Date): Promise<void> {
    for (let start = 0; start < matches.length; start += 500) {
      const slice = matches.slice(start, start + 500);
      await this.db
        .insert(seriesLicenses)
        .values(
          slice.map((match) => ({
            seriesId: match.seriesId,
            licensed: match.licensed,
            mangabakaId: match.mangabakaId,
            matchedBy: match.matchedBy,
            publishers: match.publishers,
            checkedAt,
          })),
        )
        .onConflictDoUpdate({
          target: seriesLicenses.seriesId,
          set: {
            licensed: sql`excluded.licensed`,
            mangabakaId: sql`excluded.mangabaka_id`,
            matchedBy: sql`excluded.matched_by`,
            publishers: sql`excluded.publishers`,
            checkedAt: sql`excluded.checked_at`,
          },
        });
    }
  }

  async findForSeries(seriesId: number): Promise<SeriesLicenseRow | null> {
    const [row] = await this.db.select().from(seriesLicenses).where(eq(seriesLicenses.seriesId, seriesId));
    return row ?? null;
  }

  async setOverride(seriesId: number, override: SeriesLicenseOverride | null): Promise<SeriesLicenseRow> {
    const [row] = await this.db
      .insert(seriesLicenses)
      .values({ seriesId, override })
      .onConflictDoUpdate({ target: seriesLicenses.seriesId, set: { override } })
      .returning();
    return row;
  }

  /** Series that count as licensed (override honored) and were never auto-track-considered. */
  listAutoTrackCandidates(): Promise<{ seriesId: number }[]> {
    return this.db
      .select({ seriesId: seriesLicenses.seriesId })
      .from(seriesLicenses)
      .where(
        and(
          isNull(seriesLicenses.autoTrackedAt),
          or(eq(seriesLicenses.override, 'always'), and(eq(seriesLicenses.licensed, true), sql`${seriesLicenses.override} is distinct from 'never'`)),
        ),
      );
  }

  async markAutoTracked(seriesIds: number[], at: Date): Promise<void> {
    if (seriesIds.length === 0) return;
    await this.db.update(seriesLicenses).set({ autoTrackedAt: at }).where(inArray(seriesLicenses.seriesId, seriesIds));
  }
}
