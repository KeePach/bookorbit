import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import {
  SERIES_RELEASE_MAX_OPEN_PER_SERIES,
  SERIES_RELEASE_NOTE_MAX_LENGTH,
  SERIES_RELEASE_VOLUME_MAX_LENGTH,
  type SeriesRelease,
  type SeriesReleaseCollectResult,
  type SeriesReleaseImportRequest,
  type SeriesReleaseImportResult,
  type SeriesReleaseOverviewRelease,
  type SeriesReleaseOverviewSeries,
  type SeriesReleasesOverviewResponse,
  type SeriesReleasesResponse,
  type SeriesReleaseTracking,
} from '@bookorbit/types';

import type { RequestUser } from '../../common/types/request-user';
import type { SeriesReleaseRow, SeriesReleaseTrackingRow } from '../../db/schema';
import { LibraryService } from '../library/library.service';
import { SeriesRepository } from '../series/series.repository';
import type { CreateSeriesReleaseDto } from './dto/create-series-release.dto';
import type { UpdateSeriesReleaseDto } from './dto/update-series-release.dto';
import type { UpdateSeriesReleaseTrackingDto } from './dto/update-series-release-tracking.dto';
import { SeriesReleaseRepository, type SeriesReleasePatch } from './series-release.repository';
import { bumpVolume, isIsoDate, normalizeCover, normalizeHttpUrl, todayIso } from './series-release.validation';

type ReleaseFields = Pick<SeriesReleasePatch, 'releaseDate' | 'storeUrl' | 'note' | 'cover'>;

export function toSeriesRelease(row: SeriesReleaseRow): SeriesRelease {
  return {
    id: row.id,
    seriesId: row.seriesId,
    volume: row.volume,
    releaseDate: row.releaseDate,
    storeUrl: row.storeUrl,
    note: row.note,
    cover: row.cover,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toSeriesReleaseTracking(seriesId: number, row: SeriesReleaseTrackingRow | null): SeriesReleaseTracking {
  if (!row) return { seriesId, tracking: false, finished: false, checkedAt: null };
  // Starting to follow counts as a check: whoever set it up has just looked at the announcements,
  // so the "time to check for a date" reminder waits its full interval instead of firing at once.
  return { seriesId, tracking: true, finished: row.finished, checkedAt: row.checkedAt ?? todayIso(row.createdAt) };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseSeriesId(value: unknown): number | null {
  const id = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

@Injectable()
export class SeriesReleaseService {
  constructor(
    private readonly releaseRepo: SeriesReleaseRepository,
    private readonly seriesRepo: SeriesRepository,
    private readonly libraryService: LibraryService,
  ) {}

  /**
   * Every tracked series the caller can see, with its upcoming volumes. The series with the
   * nearest date come first; series whose volumes all lack a date follow, by name.
   */
  async overview(user: RequestUser): Promise<SeriesReleasesOverviewResponse> {
    const libraryIds = await this.libraryService.findAccessibleLibraryIds(user);
    if (libraryIds.length === 0) return { series: [] };

    const tracked = await this.releaseRepo.listTracked(libraryIds, user.isSuperuser ? undefined : user.contentFilters);
    const open = await this.releaseRepo.listOpenForSeries(tracked.map((row) => row.seriesId));
    const releasesBySeries = new Map<number, SeriesReleaseOverviewRelease[]>();
    for (const row of open) {
      const list = releasesBySeries.get(row.seriesId) ?? [];
      list.push({ id: row.id, volume: row.volume, releaseDate: row.releaseDate, storeUrl: row.storeUrl, note: row.note });
      releasesBySeries.set(row.seriesId, list);
    }

    const series: SeriesReleaseOverviewSeries[] = tracked.map((row) => ({
      seriesId: row.seriesId,
      name: row.name,
      finished: row.finished,
      // The day tracking started counts as a check, as in toSeriesReleaseTracking.
      checkedAt: row.checkedAt ?? todayIso(row.createdAt),
      releases: releasesBySeries.get(row.seriesId) ?? [],
    }));
    const nearest = (entry: SeriesReleaseOverviewSeries) => entry.releases[0]?.releaseDate ?? '9999-99-99';
    series.sort((a, b) => nearest(a).localeCompare(nearest(b)) || a.name.localeCompare(b.name));
    return { series };
  }

  async get(user: RequestUser, seriesId: number): Promise<SeriesReleasesResponse> {
    const accessible = await this.libraryService.findAccessibleLibraryIds(user);
    if (!(await this.canSee(user, seriesId, accessible))) throw new NotFoundException('Series not found');

    const [tracking, rows, canEdit] = await Promise.all([
      this.releaseRepo.findTracking(seriesId),
      this.releaseRepo.listByStatus(seriesId, 'upcoming'),
      this.canSee(user, seriesId, await this.libraryService.findEditableLibraryIds(user)),
    ]);
    return { tracking: toSeriesReleaseTracking(seriesId, tracking), releases: rows.map(toSeriesRelease), canEdit };
  }

  async create(user: RequestUser, seriesId: number, dto: CreateSeriesReleaseDto): Promise<SeriesRelease> {
    await this.assertEditable(user, seriesId);
    const fields = this.readFields(dto);
    const volume = this.readVolume(dto.volume);
    if ((await this.releaseRepo.countByStatus(seriesId, 'upcoming')) >= SERIES_RELEASE_MAX_OPEN_PER_SERIES) {
      throw new BadRequestException(`A series can hold at most ${SERIES_RELEASE_MAX_OPEN_PER_SERIES} upcoming volumes`);
    }

    // Adding a volume means more are coming, so it also clears "no more volumes".
    await this.releaseRepo.upsertTracking(seriesId, { finished: false });
    const row = await this.releaseRepo.insert({
      seriesId,
      volume,
      releaseDate: fields.releaseDate ?? null,
      storeUrl: fields.storeUrl ?? null,
      note: fields.note ?? null,
      cover: fields.cover ?? null,
      createdBy: user.id,
    });
    if (!row) throw new ConflictException('This volume is already listed as upcoming');
    return toSeriesRelease(row);
  }

  async update(user: RequestUser, seriesId: number, releaseId: number, dto: UpdateSeriesReleaseDto): Promise<SeriesRelease> {
    await this.assertEditable(user, seriesId);
    const existing = await this.releaseRepo.findById(seriesId, releaseId);
    if (!existing) throw new NotFoundException('Release not found');

    const patch: SeriesReleasePatch = { ...this.readFields(dto) };
    if (dto.volume !== undefined) patch.volume = this.readVolume(dto.volume);
    if (dto.status !== undefined) patch.status = dto.status;
    if (Object.keys(patch).length === 0) return toSeriesRelease(existing);

    const row = await this.releaseRepo.update(seriesId, releaseId, patch);
    if (row === 'conflict') throw new ConflictException('This volume is already listed as upcoming');
    if (!row) throw new NotFoundException('Release not found');
    return toSeriesRelease(row);
  }

  async remove(user: RequestUser, seriesId: number, releaseId: number): Promise<void> {
    await this.assertEditable(user, seriesId);
    if (!(await this.releaseRepo.delete(seriesId, releaseId))) throw new NotFoundException('Release not found');
  }

  /** The volume arrived. It is closed and, unless the series is finished, the next one is opened with no date yet. */
  async collect(user: RequestUser, seriesId: number, releaseId: number): Promise<SeriesReleaseCollectResult> {
    await this.assertEditable(user, seriesId);
    const existing = await this.releaseRepo.findById(seriesId, releaseId);
    if (!existing || existing.status !== 'upcoming') throw new NotFoundException('Upcoming volume not found');

    const tracking = await this.releaseRepo.findTracking(seriesId);
    const nextVolume = tracking?.finished ? null : bumpVolume(existing.volume);
    const result = await this.releaseRepo.collect(
      seriesId,
      releaseId,
      nextVolume && nextVolume.length <= SERIES_RELEASE_VOLUME_MAX_LENGTH
        ? { volume: nextVolume, releaseDate: null, storeUrl: null, note: null, cover: null, createdBy: user.id }
        : null,
    );
    if (!result) throw new NotFoundException('Upcoming volume not found');

    // The next volume starts out as "just looked, no date yet".
    if (result.next) await this.releaseRepo.upsertTracking(seriesId, { checkedAt: todayIso() });
    return { collected: toSeriesRelease(result.collected), next: result.next ? toSeriesRelease(result.next) : null };
  }

  async updateTracking(user: RequestUser, seriesId: number, dto: UpdateSeriesReleaseTrackingDto): Promise<SeriesReleaseTracking> {
    await this.assertEditable(user, seriesId);

    if (dto.tracking === false) {
      await this.releaseRepo.stopTracking(seriesId);
      return toSeriesReleaseTracking(seriesId, null);
    }

    const patch: { finished?: boolean; checkedAt?: string } = {};
    if (dto.finished !== undefined) patch.finished = dto.finished;
    if (dto.checkedToday === true) patch.checkedAt = todayIso();
    if (dto.tracking !== true && Object.keys(patch).length === 0) {
      return toSeriesReleaseTracking(seriesId, await this.releaseRepo.findTracking(seriesId));
    }
    return toSeriesReleaseTracking(seriesId, await this.releaseRepo.upsertTracking(seriesId, patch));
  }

  /**
   * Reads the backup the userscript wrote. An entry is placed by BookOrbit's own series id; one it
   * cannot place is reported and skipped, never guessed at, so the rest still imports.
   */
  async importEntries(user: RequestUser, dto: SeriesReleaseImportRequest): Promise<SeriesReleaseImportResult> {
    const editableIds = await this.libraryService.findEditableLibraryIds(user);
    const editable = new Map<number, boolean>();
    const result: SeriesReleaseImportResult = { imported: 0, skipped: [] };

    for (const [index, entry] of dto.entries.entries()) {
      const raw = entry as Record<string, unknown>;
      const key = text(raw.title) || text(raw.volume) || `#${index + 1}`;
      const outcome = await this.importEntry(user, raw, editableIds, editable);
      if (outcome === 'imported') result.imported += 1;
      else result.skipped.push({ key, reason: outcome });
    }
    return result;
  }

  private async importEntry(user: RequestUser, raw: Record<string, unknown>, editableIds: number[], editable: Map<number, boolean>): Promise<string> {
    const seriesId = parseSeriesId(raw.sid);
    if (seriesId === null) return 'no_series_id';

    let canEdit = editable.get(seriesId);
    if (canEdit === undefined) {
      canEdit = await this.canSee(user, seriesId, editableIds);
      editable.set(seriesId, canEdit);
    }
    if (!canEdit) return 'series_not_editable';

    const volume = text(raw.volume);
    const finished = raw.finished === true;
    if (!volume && !finished) return 'no_volume';

    const checked = text(raw.checked);
    await this.releaseRepo.upsertTracking(seriesId, { finished, ...(isIsoDate(checked) ? { checkedAt: checked } : {}) });
    if (finished || !volume) return 'imported';

    if (volume.length > SERIES_RELEASE_VOLUME_MAX_LENGTH) return 'volume_too_long';
    if ((await this.releaseRepo.countByStatus(seriesId, 'upcoming')) >= SERIES_RELEASE_MAX_OPEN_PER_SERIES) return 'too_many_volumes';

    const note = text(raw.note);
    // The script let a link live in the note field; a link there is the store link.
    const noteUrl = normalizeHttpUrl(note);
    const date = text(raw.date);
    const row = await this.releaseRepo.insert({
      seriesId,
      volume,
      releaseDate: isIsoDate(date) ? date : null,
      storeUrl: normalizeHttpUrl(raw.store) ?? noteUrl,
      note: noteUrl ? null : note.slice(0, SERIES_RELEASE_NOTE_MAX_LENGTH) || null,
      cover: normalizeCover(raw.cover),
      createdBy: user.id,
    });
    return row ? 'imported' : 'already_listed';
  }

  private readVolume(value: string): string {
    const volume = value.trim();
    if (!volume) throw new BadRequestException('volume must not be empty');
    return volume;
  }

  /** Only the fields the caller sent: `undefined` leaves a field alone and `null` or an empty string clears it. */
  private readFields(input: { releaseDate?: string | null; storeUrl?: string | null; note?: string | null; cover?: string | null }): ReleaseFields {
    const fields: ReleaseFields = {};

    if (input.releaseDate !== undefined) {
      const value = text(input.releaseDate);
      if (value && !isIsoDate(value)) throw new BadRequestException('releaseDate must be a calendar day written YYYY-MM-DD');
      fields.releaseDate = value || null;
    }
    if (input.storeUrl !== undefined) {
      const value = text(input.storeUrl);
      const url = normalizeHttpUrl(value);
      if (value && !url) throw new BadRequestException('storeUrl must be an http or https link');
      fields.storeUrl = url;
    }
    if (input.note !== undefined) fields.note = text(input.note) || null;
    if (input.cover !== undefined) {
      const value = text(input.cover);
      const cover = normalizeCover(value);
      if (value && !cover) throw new BadRequestException('cover must be an https link or a small inline jpeg, png or webp image');
      fields.cover = cover;
    }
    return fields;
  }

  private async canSee(user: RequestUser, seriesId: number, libraryIds: number[]): Promise<boolean> {
    if (libraryIds.length === 0) return false;
    const detail = await this.seriesRepo.findDetail({
      seriesId,
      userId: user.id,
      libraryIds,
      contentFilters: user.isSuperuser ? undefined : user.contentFilters,
    });
    return detail !== null;
  }

  /** Not found when the series is out of sight, forbidden when it is visible but only to read. */
  private async assertEditable(user: RequestUser, seriesId: number): Promise<void> {
    const accessible = await this.libraryService.findAccessibleLibraryIds(user);
    if (!(await this.canSee(user, seriesId, accessible))) throw new NotFoundException('Series not found');
    if (!(await this.canSee(user, seriesId, await this.libraryService.findEditableLibraryIds(user)))) {
      throw new ForbiddenException('You cannot edit this series');
    }
  }
}
