import { BadRequestException, Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DB } from '../../../db';
import * as schema from '../../../db/schema';

import { isSafeKepubCss, kepubifyOptionsFromSettings, kepubifyOptionsKey, type KepubTitlePageMode } from './kepubify-options';

type Db = NodePgDatabase<typeof schema>;

export interface KoboSettings {
  readingThreshold: number;
  finishedThreshold: number;
  convertToKepub: boolean;
  forceEnableHyphenation: boolean;
  kepubCustomCss: string;
  kepubFullscreenReadingFixes: boolean;
  kepubTitlePage: KepubTitlePageMode;
  kepubDetectCover: boolean;
  kepubConversionLimitMb: number;
  twoWayProgressSync: boolean;
  syncBookOrbitAnnotationsToKobo: boolean;
  readAloudDelivery?: 'original' | 'audioless_epub' | null;
  storeSync: boolean;
  fullSizeCovers: boolean;
}

@Injectable()
export class KoboSettingsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async getSettings(userId: number): Promise<KoboSettings> {
    let row = await this.db.query.koboSyncSettings.findFirst({
      where: eq(schema.koboSyncSettings.userId, userId),
    });

    if (!row) {
      const [inserted] = await this.db.insert(schema.koboSyncSettings).values({ userId }).onConflictDoNothing().returning();
      row = inserted ?? (await this.db.query.koboSyncSettings.findFirst({ where: eq(schema.koboSyncSettings.userId, userId) }));
    }

    if (!row) throw new InternalServerErrorException('Failed to create kobo settings row');
    if ((row.twoWayProgressSync || row.syncBookOrbitAnnotationsToKobo) && !row.convertToKepub) {
      const [updated] = await this.db
        .update(schema.koboSyncSettings)
        .set({ convertToKepub: true, updatedAt: sql`now()` })
        .where(eq(schema.koboSyncSettings.userId, userId))
        .returning();
      row = updated ?? { ...row, convertToKepub: true };
      await this.markSnapshotDeliveryChanged(userId);
    }

    return {
      readingThreshold: row.readingThreshold,
      finishedThreshold: row.finishedThreshold,
      convertToKepub: row.convertToKepub,
      forceEnableHyphenation: row.forceEnableHyphenation,
      kepubCustomCss: row.kepubCustomCss,
      kepubFullscreenReadingFixes: row.kepubFullscreenReadingFixes,
      kepubTitlePage: row.kepubTitlePage,
      kepubDetectCover: row.kepubDetectCover,
      kepubConversionLimitMb: row.kepubConversionLimitMb,
      twoWayProgressSync: row.twoWayProgressSync,
      syncBookOrbitAnnotationsToKobo: row.syncBookOrbitAnnotationsToKobo,
      readAloudDelivery: row.readAloudDelivery,
      storeSync: row.storeSync,
      fullSizeCovers: row.fullSizeCovers,
    };
  }

  async updateSettings(userId: number, patch: Partial<KoboSettings>): Promise<KoboSettings> {
    const current = await this.getSettings(userId);

    const newReading = patch.readingThreshold ?? current.readingThreshold;
    const newFinished = patch.finishedThreshold ?? current.finishedThreshold;
    const newTwoWayProgressSync = patch.twoWayProgressSync ?? current.twoWayProgressSync;
    const newAnnotationSync = patch.syncBookOrbitAnnotationsToKobo ?? current.syncBookOrbitAnnotationsToKobo;
    const newConvertToKepub = newTwoWayProgressSync || newAnnotationSync ? true : (patch.convertToKepub ?? current.convertToKepub);

    if (newReading >= newFinished) {
      throw new BadRequestException('Reading threshold must be less than finished threshold');
    }

    const newCustomCss = patch.kepubCustomCss ?? current.kepubCustomCss;
    if (!isSafeKepubCss(newCustomCss)) {
      throw new BadRequestException('Custom CSS is too long or contains characters that are not allowed');
    }

    const [updated] = await this.db
      .update(schema.koboSyncSettings)
      .set({
        readingThreshold: newReading,
        finishedThreshold: newFinished,
        convertToKepub: newConvertToKepub,
        forceEnableHyphenation: patch.forceEnableHyphenation ?? current.forceEnableHyphenation,
        kepubCustomCss: newCustomCss,
        kepubFullscreenReadingFixes: patch.kepubFullscreenReadingFixes ?? current.kepubFullscreenReadingFixes,
        kepubTitlePage: patch.kepubTitlePage ?? current.kepubTitlePage,
        kepubDetectCover: patch.kepubDetectCover ?? current.kepubDetectCover,
        kepubConversionLimitMb: patch.kepubConversionLimitMb ?? current.kepubConversionLimitMb,
        twoWayProgressSync: newTwoWayProgressSync,
        syncBookOrbitAnnotationsToKobo: newAnnotationSync,
        readAloudDelivery: patch.readAloudDelivery === undefined ? current.readAloudDelivery : patch.readAloudDelivery,
        storeSync: patch.storeSync ?? current.storeSync,
        fullSizeCovers: patch.fullSizeCovers ?? current.fullSizeCovers,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.koboSyncSettings.userId, userId))
      .returning();

    if (!updated) {
      throw new InternalServerErrorException('Failed to update kobo settings row');
    }

    if (this.deliverySettingsChanged(current, updated)) {
      await this.markSnapshotDeliveryChanged(userId);
    }

    return {
      readingThreshold: updated.readingThreshold,
      finishedThreshold: updated.finishedThreshold,
      convertToKepub: updated.convertToKepub,
      forceEnableHyphenation: updated.forceEnableHyphenation,
      kepubCustomCss: updated.kepubCustomCss,
      kepubFullscreenReadingFixes: updated.kepubFullscreenReadingFixes,
      kepubTitlePage: updated.kepubTitlePage,
      kepubDetectCover: updated.kepubDetectCover,
      kepubConversionLimitMb: updated.kepubConversionLimitMb,
      twoWayProgressSync: updated.twoWayProgressSync,
      syncBookOrbitAnnotationsToKobo: updated.syncBookOrbitAnnotationsToKobo,
      readAloudDelivery: updated.readAloudDelivery,
      storeSync: updated.storeSync,
      fullSizeCovers: updated.fullSizeCovers,
    };
  }

  private deliverySettingsChanged(
    current: Pick<KoboSettings, 'convertToKepub' | 'kepubConversionLimitMb'> & Parameters<typeof kepubifyOptionsFromSettings>[0],
    updated: Pick<KoboSettings, 'convertToKepub' | 'kepubConversionLimitMb'> & Parameters<typeof kepubifyOptionsFromSettings>[0],
  ): boolean {
    if (current.convertToKepub !== updated.convertToKepub || current.kepubConversionLimitMb !== updated.kepubConversionLimitMb) return true;
    if (!current.convertToKepub && !updated.convertToKepub) return false;
    const before = kepubifyOptionsFromSettings(current);
    const after = kepubifyOptionsFromSettings(updated);
    return before.hyphenate !== after.hyphenate || kepubifyOptionsKey(before) !== kepubifyOptionsKey(after);
  }

  private async markSnapshotDeliveryChanged(userId: number): Promise<void> {
    await this.db.execute(sql`
      UPDATE ${schema.koboSnapshotBooks} AS sb
      SET synced = false,
          is_new = true,
          delivery_hash = NULL
      FROM ${schema.koboLibrarySnapshots} AS snap
      WHERE snap.id = sb.snapshot_id
        AND snap.user_id = ${userId}
        AND sb.pending_delete = false
        AND sb.removed_by_device = false
    `);
  }
}
