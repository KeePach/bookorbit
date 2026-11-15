import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { EMPTY_CONTENT_FILTER_RULES } from '@bookorbit/types';

import type { RequestUser } from '../../common/types/request-user';
import type { SeriesReleaseRow, SeriesReleaseTrackingRow } from '../../db/schema';
import type { CreateSeriesReleaseDto } from './dto/create-series-release.dto';
import { SeriesReleaseService, toSeriesRelease, toSeriesReleaseTracking } from './series-release.service';

const NOW = new Date('2026-11-14T12:00:00.000Z');

function makeUser(overrides?: Partial<RequestUser>): RequestUser {
  return {
    id: 7,
    username: 'reader',
    name: 'Reader',
    email: null,
    active: true,
    isSuperuser: false,
    isDefaultPassword: false,
    tokenVersion: 1,
    settings: {},
    avatarUrl: null,
    provisioningMethod: 'local',
    permissions: [],
    contentFilters: EMPTY_CONTENT_FILTER_RULES,
    ...overrides,
  };
}

function makeRow(overrides?: Partial<SeriesReleaseRow>): SeriesReleaseRow {
  return {
    id: 1,
    seriesId: 3,
    volume: '6',
    releaseDate: '2026-12-19',
    storeUrl: 'https://store.example/6',
    note: null,
    cover: null,
    status: 'upcoming',
    notifiedStage: null,
    createdBy: 7,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeTrackingRow(overrides?: Partial<SeriesReleaseTrackingRow>): SeriesReleaseTrackingRow {
  return { seriesId: 3, finished: false, checkedAt: null, checkNotifiedAt: null, createdAt: NOW, updatedAt: NOW, ...overrides };
}

/** The series is visible in libraries 1 and 2; only library 1 is editable unless stated. */
function makeService(options: { visible?: number[]; editable?: number[]; seriesLibraries?: number[] } = {}) {
  const { visible = [1, 2], editable = [1], seriesLibraries = [1] } = options;
  const releaseRepo = {
    findTracking: vi.fn().mockResolvedValue(null),
    upsertTracking: vi.fn().mockImplementation((seriesId: number, patch: object) => Promise.resolve(makeTrackingRow({ seriesId, ...patch }))),
    stopTracking: vi.fn().mockResolvedValue(undefined),
    listByStatus: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(makeRow()),
    countByStatus: vi.fn().mockResolvedValue(0),
    insert: vi.fn().mockImplementation((values: object) => Promise.resolve(makeRow(values))),
    update: vi.fn().mockResolvedValue(makeRow()),
    delete: vi.fn().mockResolvedValue(true),
    collect: vi.fn(),
    listTracked: vi.fn().mockResolvedValue([]),
    listOpenForSeries: vi.fn().mockResolvedValue([]),
  };
  const seriesRepo = {
    // Series 3 lives in `seriesLibraries`; every other id does not exist.
    findDetail: vi
      .fn()
      .mockImplementation((params: { seriesId: number; libraryIds: number[] }) =>
        Promise.resolve(params.seriesId === 3 && params.libraryIds.some((id) => seriesLibraries.includes(id)) ? { id: 3 } : null),
      ),
  };
  const libraryService = {
    findAccessibleLibraryIds: vi.fn().mockResolvedValue(visible),
    findEditableLibraryIds: vi.fn().mockResolvedValue(editable),
  };
  const licenseRepo = { findForSeries: vi.fn().mockResolvedValue(null) };
  const service = new SeriesReleaseService(releaseRepo as never, seriesRepo as never, libraryService as never, licenseRepo as never);
  return { service, releaseRepo, seriesRepo, libraryService, licenseRepo };
}

function createDto(overrides?: Partial<CreateSeriesReleaseDto>): CreateSeriesReleaseDto {
  return { volume: '6', ...overrides } as CreateSeriesReleaseDto;
}

describe('SeriesReleaseService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 14, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get', () => {
    it('returns the tracking state, the upcoming volumes and whether the caller may edit', async () => {
      const { service, releaseRepo } = makeService();
      releaseRepo.findTracking.mockResolvedValue(makeTrackingRow({ checkedAt: '2026-11-10' }));
      releaseRepo.listByStatus.mockResolvedValue([makeRow()]);

      const result = await service.get(makeUser(), 3);

      expect(releaseRepo.listByStatus).toHaveBeenCalledWith(3, 'upcoming');
      expect(result.tracking).toEqual({ seriesId: 3, tracking: true, finished: false, checkedAt: '2026-11-10' });
      expect(result.releases).toEqual([toSeriesRelease(makeRow())]);
      expect(result.canEdit).toBe(true);
    });

    it('reports an untracked series and a read-only caller', async () => {
      const { service } = makeService({ editable: [2] });

      const result = await service.get(makeUser(), 3);

      expect(result.tracking).toEqual({ seriesId: 3, tracking: false, finished: false, checkedAt: null });
      expect(result.canEdit).toBe(false);
    });

    it('does not reveal a series the caller cannot see', async () => {
      const { service, releaseRepo } = makeService({ visible: [2], seriesLibraries: [1] });

      await expect(service.get(makeUser(), 3)).rejects.toBeInstanceOf(NotFoundException);
      expect(releaseRepo.listByStatus).not.toHaveBeenCalled();
    });

    it('applies content filters to everyone except superusers', async () => {
      const { service, seriesRepo } = makeService();
      await service.get(makeUser(), 3);
      expect(seriesRepo.findDetail.mock.calls[0][0].contentFilters).toBe(EMPTY_CONTENT_FILTER_RULES);

      const admin = makeService();
      await admin.service.get(makeUser({ isSuperuser: true }), 3);
      expect(admin.seriesRepo.findDetail.mock.calls[0][0].contentFilters).toBeUndefined();
    });
  });

  describe('create', () => {
    it('adds the volume, clears "no more volumes" and records who added it', async () => {
      const { service, releaseRepo } = makeService();

      const result = await service.create(
        makeUser(),
        3,
        createDto({ releaseDate: '2026-12-19', storeUrl: ' https://store.example/6 ', note: ' preorder ' }),
      );

      expect(releaseRepo.upsertTracking).toHaveBeenCalledWith(3, { finished: false });
      expect(releaseRepo.insert).toHaveBeenCalledWith({
        seriesId: 3,
        volume: '6',
        releaseDate: '2026-12-19',
        storeUrl: 'https://store.example/6',
        note: 'preorder',
        cover: null,
        createdBy: 7,
      });
      expect(result.volume).toBe('6');
    });

    it('refuses a caller who can only read the series', async () => {
      const { service, releaseRepo } = makeService({ editable: [2] });

      await expect(service.create(makeUser(), 3, createDto())).rejects.toBeInstanceOf(ForbiddenException);
      expect(releaseRepo.insert).not.toHaveBeenCalled();
    });

    it('answers not found, not forbidden, for a series out of sight', async () => {
      const { service } = makeService({ visible: [2], editable: [2], seriesLibraries: [1] });

      await expect(service.create(makeUser(), 3, createDto())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a date that is not a real day, a bad link and a bad cover before writing anything', async () => {
      const { service, releaseRepo } = makeService();

      await expect(service.create(makeUser(), 3, createDto({ releaseDate: '2026-02-30' }))).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create(makeUser(), 3, createDto({ storeUrl: 'javascript:alert(1)' }))).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create(makeUser(), 3, createDto({ cover: 'http://img.example/c.jpg' }))).rejects.toBeInstanceOf(BadRequestException);
      expect(releaseRepo.upsertTracking).not.toHaveBeenCalled();
      expect(releaseRepo.insert).not.toHaveBeenCalled();
    });

    it('answers a conflict when the volume is already upcoming', async () => {
      const { service, releaseRepo } = makeService();
      releaseRepo.insert.mockResolvedValue(null);

      await expect(service.create(makeUser(), 3, createDto())).rejects.toBeInstanceOf(ConflictException);
    });

    it('stops at the limit of upcoming volumes per series', async () => {
      const { service, releaseRepo } = makeService();
      releaseRepo.countByStatus.mockResolvedValue(20);

      await expect(service.create(makeUser(), 3, createDto())).rejects.toBeInstanceOf(BadRequestException);
      expect(releaseRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('changes only what was sent and clears a field with null', async () => {
      const { service, releaseRepo } = makeService();

      await service.update(makeUser(), 3, 1, { releaseDate: null, note: 'moved' });

      expect(releaseRepo.update).toHaveBeenCalledWith(3, 1, { releaseDate: null, note: 'moved' });
    });

    it('returns the entry as it is when nothing was sent', async () => {
      const { service, releaseRepo } = makeService();

      const result = await service.update(makeUser(), 3, 1, {});

      expect(releaseRepo.update).not.toHaveBeenCalled();
      expect(result).toEqual(toSeriesRelease(makeRow()));
    });

    it('answers a conflict when the new label is taken and not found when the entry is gone', async () => {
      const { service, releaseRepo } = makeService();
      releaseRepo.update.mockResolvedValueOnce('conflict');
      await expect(service.update(makeUser(), 3, 1, { volume: '7' })).rejects.toBeInstanceOf(ConflictException);

      releaseRepo.findById.mockResolvedValue(null);
      await expect(service.update(makeUser(), 3, 99, { note: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the entry and reports a missing one', async () => {
      const { service, releaseRepo } = makeService();
      await service.remove(makeUser(), 3, 1);
      expect(releaseRepo.delete).toHaveBeenCalledWith(3, 1);

      releaseRepo.delete.mockResolvedValue(false);
      await expect(service.remove(makeUser(), 3, 1)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('collect', () => {
    it('closes the volume and opens the next one with no date, checked today', async () => {
      const { service, releaseRepo } = makeService();
      releaseRepo.findById.mockResolvedValue(makeRow({ volume: 'Vol. 6' }));
      releaseRepo.collect.mockResolvedValue({
        collected: makeRow({ status: 'collected' }),
        next: makeRow({ id: 2, volume: 'Vol. 7', releaseDate: null, storeUrl: null }),
      });

      const result = await service.collect(makeUser(), 3, 1);

      expect(releaseRepo.collect).toHaveBeenCalledWith(3, 1, {
        volume: 'Vol. 7',
        releaseDate: null,
        storeUrl: null,
        note: null,
        cover: null,
        createdBy: 7,
      });
      expect(releaseRepo.upsertTracking).toHaveBeenCalledWith(3, { checkedAt: '2026-11-14' });
      expect(result.collected.status).toBe('collected');
      expect(result.next?.volume).toBe('Vol. 7');
    });

    it('opens no next volume when the series is finished or the label has no number', async () => {
      const finished = makeService();
      finished.releaseRepo.findTracking.mockResolvedValue(makeTrackingRow({ finished: true }));
      finished.releaseRepo.collect.mockResolvedValue({ collected: makeRow({ status: 'collected' }), next: null });
      const done = await finished.service.collect(makeUser(), 3, 1);
      expect(finished.releaseRepo.collect).toHaveBeenCalledWith(3, 1, null);
      expect(done.next).toBeNull();
      expect(finished.releaseRepo.upsertTracking).not.toHaveBeenCalled();

      const special = makeService();
      special.releaseRepo.findById.mockResolvedValue(makeRow({ volume: 'Special' }));
      special.releaseRepo.collect.mockResolvedValue({ collected: makeRow({ status: 'collected' }), next: null });
      await special.service.collect(makeUser(), 3, 1);
      expect(special.releaseRepo.collect).toHaveBeenCalledWith(3, 1, null);
    });

    it('refuses a volume that is not upcoming', async () => {
      const { service, releaseRepo } = makeService();
      releaseRepo.findById.mockResolvedValue(makeRow({ status: 'collected' }));

      await expect(service.collect(makeUser(), 3, 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(releaseRepo.collect).not.toHaveBeenCalled();
    });

    it('reports a volume that was collected by someone else a moment earlier', async () => {
      const { service, releaseRepo } = makeService();
      releaseRepo.collect.mockResolvedValue(null);

      await expect(service.collect(makeUser(), 3, 1)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateTracking', () => {
    it('stops following the series and reports it untracked', async () => {
      const { service, releaseRepo } = makeService();

      const result = await service.updateTracking(makeUser(), 3, { tracking: false });

      expect(releaseRepo.stopTracking).toHaveBeenCalledWith(3);
      expect(result).toEqual(toSeriesReleaseTracking(3, null));
    });

    it('marks the series finished and checked today', async () => {
      const { service, releaseRepo } = makeService();

      const result = await service.updateTracking(makeUser(), 3, { finished: true, checkedToday: true });

      expect(releaseRepo.upsertTracking).toHaveBeenCalledWith(3, { finished: true, checkedAt: '2026-11-14' });
      expect(result).toMatchObject({ tracking: true, finished: true, checkedAt: '2026-11-14' });
    });

    it('starts following with no other change, and changes nothing for an empty request', async () => {
      const { service, releaseRepo } = makeService();
      await service.updateTracking(makeUser(), 3, { tracking: true });
      expect(releaseRepo.upsertTracking).toHaveBeenCalledWith(3, {});

      releaseRepo.upsertTracking.mockClear();
      await service.updateTracking(makeUser(), 3, {});
      expect(releaseRepo.upsertTracking).not.toHaveBeenCalled();
    });

    it('needs edit access', async () => {
      const { service } = makeService({ editable: [2] });
      await expect(service.updateTracking(makeUser(), 3, { finished: true })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('importEntries', () => {
    it('imports what it can place and reports the rest', async () => {
      const { service, releaseRepo } = makeService();
      releaseRepo.insert.mockResolvedValueOnce(makeRow()).mockResolvedValueOnce(null);

      const result = await service.importEntries(makeUser(), {
        entries: [
          {
            sid: 3,
            title: 'Series',
            volume: '6',
            date: '2026-12-19',
            store: 'https://store.example/6',
            cover: 'https://img.example/c.jpg',
            checked: '2026-11-01',
          },
          { title: 'No id', volume: '2' },
          { sid: '3', title: 'Again', volume: '6' },
          { sid: 3, title: 'Empty' },
          { sid: 99, title: 'Elsewhere', volume: '1' },
        ],
      });

      expect(result.imported).toBe(1);
      expect(result.skipped).toEqual([
        { key: 'No id', reason: 'no_series_id' },
        { key: 'Again', reason: 'already_listed' },
        { key: 'Empty', reason: 'no_volume' },
        { key: 'Elsewhere', reason: 'series_not_editable' },
      ]);
      expect(releaseRepo.insert.mock.calls[0][0]).toMatchObject({
        seriesId: 3,
        volume: '6',
        releaseDate: '2026-12-19',
        storeUrl: 'https://store.example/6',
        cover: 'https://img.example/c.jpg',
      });
      expect(releaseRepo.upsertTracking).toHaveBeenCalledWith(3, { finished: false, checkedAt: '2026-11-01' });
    });

    it('treats a link in the note as the store link, as the script allowed', async () => {
      const { service, releaseRepo } = makeService();

      await service.importEntries(makeUser(), { entries: [{ sid: 3, volume: '6', note: 'https://store.example/6' }] });

      expect(releaseRepo.insert.mock.calls[0][0]).toMatchObject({ storeUrl: 'https://store.example/6', note: null });
    });

    it('drops an invalid date or cover instead of failing the entry', async () => {
      const { service, releaseRepo } = makeService();

      const result = await service.importEntries(makeUser(), {
        entries: [{ sid: 3, volume: '6', date: '12/19/2026', cover: 'javascript:alert(1)' }],
      });

      expect(result.imported).toBe(1);
      expect(releaseRepo.insert.mock.calls[0][0]).toMatchObject({ releaseDate: null, cover: null });
    });

    it('records a finished series without adding a volume', async () => {
      const { service, releaseRepo } = makeService();

      const result = await service.importEntries(makeUser(), { entries: [{ sid: 3, volume: '12', finished: true }] });

      expect(result.imported).toBe(1);
      expect(releaseRepo.upsertTracking).toHaveBeenCalledWith(3, { finished: true });
      expect(releaseRepo.insert).not.toHaveBeenCalled();
    });

    it('checks edit access once per series', async () => {
      const { service, seriesRepo } = makeService();

      await service.importEntries(makeUser(), {
        entries: [
          { sid: 3, volume: '6' },
          { sid: 3, volume: '7' },
          { sid: 3, volume: '8' },
        ],
      });

      expect(seriesRepo.findDetail).toHaveBeenCalledTimes(1);
    });
  });

  describe('overview', () => {
    it('groups the open volumes under their series, nearest date first, undated series last', async () => {
      const { service, releaseRepo } = makeService();
      releaseRepo.listTracked.mockResolvedValue([
        { seriesId: 3, name: 'Beta', finished: false, checkedAt: '2026-11-01', createdAt: NOW },
        { seriesId: 5, name: 'Alpha', finished: false, checkedAt: null, createdAt: NOW },
        { seriesId: 8, name: 'Gamma', finished: true, checkedAt: '2026-10-01', createdAt: NOW },
      ]);
      releaseRepo.listOpenForSeries.mockResolvedValue([
        makeRow({ id: 1, seriesId: 3, volume: '6', releaseDate: '2026-12-19' }),
        makeRow({ id: 2, seriesId: 3, volume: '7', releaseDate: null, storeUrl: null }),
        makeRow({ id: 4, seriesId: 5, volume: '2', releaseDate: null, storeUrl: null }),
      ]);

      const result = await service.overview(makeUser());

      expect(releaseRepo.listOpenForSeries).toHaveBeenCalledWith([3, 5, 8]);
      expect(result.series.map((entry) => entry.seriesId)).toEqual([3, 5, 8]);
      expect(result.series[0].releases.map((release) => release.volume)).toEqual(['6', '7']);
      expect(result.series[1]).toMatchObject({ name: 'Alpha', checkedAt: '2026-11-14', releases: [{ volume: '2' }] });
      expect(result.series[2].releases).toEqual([]);
      expect(result.series[0].releases[0]).not.toHaveProperty('cover');
    });

    it('passes content filters for ordinary users and none for superusers', async () => {
      const { service, releaseRepo } = makeService();
      await service.overview(makeUser());
      expect(releaseRepo.listTracked).toHaveBeenCalledWith([1, 2], EMPTY_CONTENT_FILTER_RULES);

      const admin = makeService();
      await admin.service.overview(makeUser({ isSuperuser: true }));
      expect(admin.releaseRepo.listTracked).toHaveBeenCalledWith([1, 2], undefined);
    });

    it('answers empty without queries when the caller can see no library', async () => {
      const { service, releaseRepo, libraryService } = makeService();
      libraryService.findAccessibleLibraryIds.mockResolvedValue([]);

      await expect(service.overview(makeUser())).resolves.toEqual({ series: [] });
      expect(releaseRepo.listTracked).not.toHaveBeenCalled();
    });
  });
});

describe('toSeriesReleaseTracking', () => {
  it('reads an absent row as not tracked', () => {
    expect(toSeriesReleaseTracking(3, null)).toEqual({ seriesId: 3, tracking: false, finished: false, checkedAt: null });
  });

  it('counts the day tracking started as a check, so the reminder waits its full interval', () => {
    expect(toSeriesReleaseTracking(3, makeTrackingRow())).toEqual({ seriesId: 3, tracking: true, finished: false, checkedAt: '2026-11-14' });
    expect(toSeriesReleaseTracking(3, makeTrackingRow({ checkedAt: '2026-11-01' })).checkedAt).toBe('2026-11-01');
  });
});
