import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import * as zlib from 'node:zlib';

import type { SeriesLicense, SeriesLicenseOverride, SeriesLicensingOverview } from '@bookorbit/types';

import type { RequestUser } from '../../common/types/request-user';
import type { SeriesLicenseRow } from '../../db/schema';
import { LibraryService } from '../library/library.service';
import { SeriesRepository } from '../series/series.repository';
import { LicenseMatcher } from './series-license-matcher';
import { SeriesLicenseRepository } from './series-license.repository';
import { SeriesReleaseRepository } from './series-release.repository';

/** Nightly MangaBaka dump; streamed straight through the parser, never written to disk. */
const DUMP_URL = 'https://api.mangabaka.org/v1/database/series.jsonl.zst';

export function toSeriesLicense(row: SeriesLicenseRow | null): SeriesLicense | null {
  if (!row) return null;
  return {
    licensed: row.licensed,
    mangabakaId: row.mangabakaId,
    matchedBy: row.matchedBy ?? null,
    publishers: row.publishers,
    override: row.override ?? null,
    checkedAt: row.checkedAt.toISOString(),
  };
}

/**
 * The native version of the userscript's "import the MangaBaka database" step. A run is started
 * by hand from the releases page (the daily reminder pass nags when the data is a month old),
 * downloads the nightly dump as a stream, matches the configured libraries' series by stored
 * MangaBaka id or unique title, saves the verdicts, and turns tracking on for licensed series
 * that were never considered before.
 */
@Injectable()
export class SeriesLicenseService {
  private readonly logger = new Logger(SeriesLicenseService.name);
  private running: { startedAt: Date; lines: number } | null = null;

  constructor(
    private readonly licenseRepo: SeriesLicenseRepository,
    private readonly releaseRepo: SeriesReleaseRepository,
    private readonly seriesRepo: SeriesRepository,
    private readonly libraryService: LibraryService,
  ) {}

  async overview(): Promise<SeriesLicensingOverview> {
    const settings = await this.licenseRepo.getSettings();
    return {
      settings: { libraryIds: settings?.libraryIds ?? [] },
      status: {
        running: this.running !== null,
        progressLines: this.running?.lines ?? null,
        lastRunAt: settings?.lastRunAt ? settings.lastRunAt.toISOString() : null,
        lastRunSeries: settings?.lastRunSeries ?? null,
        lastRunLicensed: settings?.lastRunLicensed ?? null,
        lastRunError: settings?.lastRunError ?? null,
      },
    };
  }

  async setLibraries(libraryIds: number[]): Promise<SeriesLicensingOverview> {
    await this.licenseRepo.saveLibraries([...new Set(libraryIds)]);
    return this.overview();
  }

  /** Kicks a run off in the background; the card polls `overview` while it works. */
  async startRun(): Promise<void> {
    if (this.running) throw new ConflictException('A licensing check is already running');
    const settings = await this.licenseRepo.getSettings();
    if (!settings || settings.libraryIds.length === 0) {
      throw new BadRequestException('Pick the libraries to check first');
    }
    this.running = { startedAt: new Date(), lines: 0 };
    void this.execute(settings.libraryIds).finally(() => {
      this.running = null;
    });
  }

  async updateOverride(user: RequestUser, seriesId: number, override: SeriesLicenseOverride | null): Promise<SeriesLicense> {
    await this.assertEditable(user, seriesId);
    return toSeriesLicense(await this.licenseRepo.setOverride(seriesId, override))!;
  }

  private async execute(libraryIds: number[]): Promise<void> {
    const event = 'series_license.check';
    const startedAt = new Date();
    try {
      const [candidates, knownIds] = await Promise.all([this.licenseRepo.listCandidates(libraryIds), this.licenseRepo.listMangabakaIds(libraryIds)]);
      const matcher = new LicenseMatcher(
        candidates.map((candidate) => ({
          seriesId: candidate.seriesId,
          name: candidate.name,
          mangabakaId: knownIds.get(candidate.seriesId) ?? null,
        })),
      );
      await this.streamDump((line) => {
        try {
          matcher.feed(JSON.parse(line));
        } catch {
          // One broken line should not sink a million-line import.
        }
        if (this.running) this.running.lines = matcher.linesSeen;
      });
      const matches = matcher.finish();
      await this.licenseRepo.upsertMatches(matches, startedAt);
      const tracked = await this.autoTrack();
      const licensed = matches.filter((match) => match.licensed).length;
      await this.licenseRepo.saveRunResult({
        lastRunAt: startedAt,
        lastRunSeries: matches.length,
        lastRunLicensed: licensed,
        lastRunError: null,
      });
      this.logger.log(
        `[${event}] [end] lines=${matcher.linesSeen} series=${matches.length} licensed=${licensed} autoTracked=${tracked} - licensing check finished`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.licenseRepo
        .saveRunResult({ lastRunAt: startedAt, lastRunSeries: null, lastRunLicensed: null, lastRunError: message })
        .catch(() => undefined);
      this.logger.error(`[${event}] [fail] error="${message}" - licensing check failed`);
    }
  }

  /** Turns tracking on once per licensed series; a later manual untrack is respected. */
  private async autoTrack(): Promise<number> {
    const candidates = await this.licenseRepo.listAutoTrackCandidates();
    if (candidates.length === 0) return 0;
    let created = 0;
    for (const { seriesId } of candidates) {
      const existing = await this.releaseRepo.findTracking(seriesId);
      if (!existing) {
        await this.releaseRepo.upsertTracking(seriesId, {});
        created++;
      }
    }
    await this.licenseRepo.markAutoTracked(
      candidates.map((candidate) => candidate.seriesId),
      new Date(),
    );
    return created;
  }

  private async streamDump(onLine: (line: string) => void): Promise<void> {
    const createZstd = (zlib as { createZstdDecompress?: () => import('node:stream').Transform }).createZstdDecompress;
    if (!createZstd) throw new Error('This Node build cannot decompress zstd; Node 24 or newer is needed');
    const response = await fetch(DUMP_URL);
    if (!response.ok || !response.body) throw new Error(`MangaBaka download failed: HTTP ${response.status}`);
    const input = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]).pipe(createZstd());
    const lines = createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      if (line.trim()) onLine(line);
    }
  }

  private async assertEditable(user: RequestUser, seriesId: number): Promise<void> {
    const editable = await this.libraryService.findEditableLibraryIds(user);
    const detail =
      editable.length === 0
        ? null
        : await this.seriesRepo.findDetail({
            seriesId,
            userId: user.id,
            libraryIds: editable,
            contentFilters: user.isSuperuser ? undefined : user.contentFilters,
          });
    if (!detail) throw new ForbiddenException('This series is not yours to change');
  }
}
