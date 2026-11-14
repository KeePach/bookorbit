import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { SeriesReleaseStatus } from '@bookorbit/types';

import { isUniqueViolation } from '../../common/utils/db-error.utils';
import { DB } from '../../db';
import * as schema from '../../db/schema';
import { seriesReleases, seriesReleaseTracking, type NewSeriesRelease, type SeriesReleaseRow, type SeriesReleaseTrackingRow } from '../../db/schema';

type Db = NodePgDatabase<typeof schema>;

export type SeriesReleaseInsert = Pick<NewSeriesRelease, 'seriesId' | 'volume' | 'releaseDate' | 'storeUrl' | 'note' | 'cover' | 'createdBy'>;
export type SeriesReleasePatch = Partial<Pick<NewSeriesRelease, 'volume' | 'releaseDate' | 'storeUrl' | 'note' | 'cover' | 'status'>>;
export type SeriesReleaseTrackingPatch = Partial<Pick<SeriesReleaseTrackingRow, 'finished' | 'checkedAt'>>;

@Injectable()
export class SeriesReleaseRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findTracking(seriesId: number): Promise<SeriesReleaseTrackingRow | null> {
    const [row] = await this.db.select().from(seriesReleaseTracking).where(eq(seriesReleaseTracking.seriesId, seriesId)).limit(1);
    return row ?? null;
  }

  /** Starts following the series, or changes how it is followed. */
  async upsertTracking(seriesId: number, patch: SeriesReleaseTrackingPatch): Promise<SeriesReleaseTrackingRow> {
    const [row] = await this.db
      .insert(seriesReleaseTracking)
      .values({ seriesId, ...patch })
      .onConflictDoUpdate({ target: seriesReleaseTracking.seriesId, set: { ...patch, updatedAt: new Date() } })
      .returning();
    return row;
  }

  /** Stops following the series and drops its upcoming volumes; volumes already collected stay as history. */
  async stopTracking(seriesId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(seriesReleases).where(and(eq(seriesReleases.seriesId, seriesId), eq(seriesReleases.status, 'upcoming')));
      await tx.delete(seriesReleaseTracking).where(eq(seriesReleaseTracking.seriesId, seriesId));
    });
  }

  /** Nearest date first, volumes without a date last. */
  listByStatus(seriesId: number, status: SeriesReleaseStatus): Promise<SeriesReleaseRow[]> {
    return this.db
      .select()
      .from(seriesReleases)
      .where(and(eq(seriesReleases.seriesId, seriesId), eq(seriesReleases.status, status)))
      .orderBy(sql`${seriesReleases.releaseDate} asc nulls last`, asc(seriesReleases.id));
  }

  async findById(seriesId: number, id: number): Promise<SeriesReleaseRow | null> {
    const [row] = await this.db
      .select()
      .from(seriesReleases)
      .where(and(eq(seriesReleases.seriesId, seriesId), eq(seriesReleases.id, id)))
      .limit(1);
    return row ?? null;
  }

  async countByStatus(seriesId: number, status: SeriesReleaseStatus): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(seriesReleases)
      .where(and(eq(seriesReleases.seriesId, seriesId), eq(seriesReleases.status, status)));
    return row?.total ?? 0;
  }

  /** Null when the series already has an upcoming volume with this label. */
  async insert(values: SeriesReleaseInsert): Promise<SeriesReleaseRow | null> {
    const [row] = await this.db.insert(seriesReleases).values(values).onConflictDoNothing().returning();
    return row ?? null;
  }

  /** Null when the entry is gone, or `conflict` when the new label is taken by another upcoming volume. */
  async update(seriesId: number, id: number, patch: SeriesReleasePatch): Promise<SeriesReleaseRow | null | 'conflict'> {
    try {
      const [row] = await this.db
        .update(seriesReleases)
        .set(patch)
        .where(and(eq(seriesReleases.seriesId, seriesId), eq(seriesReleases.id, id)))
        .returning();
      return row ?? null;
    } catch (error) {
      if (isUniqueViolation(error)) return 'conflict';
      throw error;
    }
  }

  async delete(seriesId: number, id: number): Promise<boolean> {
    const deleted = await this.db
      .delete(seriesReleases)
      .where(and(eq(seriesReleases.seriesId, seriesId), eq(seriesReleases.id, id)))
      .returning({ id: seriesReleases.id });
    return deleted.length > 0;
  }

  /**
   * Marks an upcoming volume as collected and, when asked, opens the next one with no date yet, in
   * one step so a failure cannot leave the series with neither.
   */
  async collect(
    seriesId: number,
    id: number,
    next: Omit<SeriesReleaseInsert, 'seriesId'> | null,
  ): Promise<{ collected: SeriesReleaseRow; next: SeriesReleaseRow | null } | null> {
    return this.db.transaction(async (tx) => {
      const [collected] = await tx
        .update(seriesReleases)
        .set({ status: 'collected' })
        .where(and(eq(seriesReleases.seriesId, seriesId), eq(seriesReleases.id, id), eq(seriesReleases.status, 'upcoming')))
        .returning();
      if (!collected) return null;
      if (!next) return { collected, next: null };
      const [opened] = await tx
        .insert(seriesReleases)
        .values({ ...next, seriesId })
        .onConflictDoNothing()
        .returning();
      return { collected, next: opened ?? null };
    });
  }
}
