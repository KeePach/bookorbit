import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ACHIEVEMENT_EVENT_BOOK_STATUS_CHANGED } from '../../modules/achievement/achievement-events.service';
import { MangabakaApiError } from './mangabaka-sync-client.service';
import type { MangabakaSeriesBookRow } from './mangabaka-sync.repository';
import { MangabakaSyncService, describeBody } from './mangabaka-sync.service';

function makeRepo(rows: MangabakaSeriesBookRow[]) {
  return {
    findSettings: vi.fn().mockResolvedValue({ userId: 1, apiToken: 'mb-secret-abcd', enabled: true }),
    listSelected: vi.fn().mockResolvedValue([{ seriesId: 7, seriesName: 'Series', lastResult: null }]),
    findSelected: vi.fn().mockResolvedValue({ seriesId: 7, seriesName: 'Series', lastResult: null }),
    select: vi.fn().mockResolvedValue(undefined),
    unselect: vi.fn().mockResolvedValue(undefined),
    saveResult: vi.fn().mockResolvedValue(undefined),
    saveToken: vi.fn().mockResolvedValue(undefined),
    setEnabled: vi.fn().mockResolvedValue(undefined),
    deleteSettings: vi.fn().mockResolvedValue(undefined),
    selectedSeriesForBook: vi.fn().mockResolvedValue([7]),
    seriesExists: vi.fn().mockResolvedValue(true),
    seriesBooks: vi.fn().mockResolvedValue(rows),
    licensingMangabakaId: vi.fn().mockResolvedValue(null),
    userTimeZone: vi.fn().mockResolvedValue('America/Mexico_City'),
    listActiveUserIds: vi.fn().mockResolvedValue([1]),
  };
}

function makeClient() {
  return {
    checkToken: vi.fn().mockResolvedValue(undefined),
    series: vi
      .fn()
      .mockResolvedValue({ id: '10', title: 'S', url: 'https://mangabaka.org/manga/10/S', status: 'releasing', totalChapters: 50, finalVolume: 5 }),
    entry: vi.fn().mockResolvedValue(null),
    createEntry: vi.fn().mockResolvedValue(undefined),
    patchEntry: vi.fn().mockResolvedValue(undefined),
  };
}

const read = (id: number, providerId: string | null, finished = '2026-11-20T18:00:00Z'): MangabakaSeriesBookRow => ({
  bookId: id,
  status: 'read',
  startedAt: new Date('2026-11-01T18:00:00Z'),
  finishedAt: new Date(finished),
  providerId,
});

function build(rows: MangabakaSeriesBookRow[]) {
  const repo = makeRepo(rows);
  const client = makeClient();
  const events = new EventEmitter();
  const scope = { visibleIdsOrAllForUserId: vi.fn().mockResolvedValue(null) };
  const service = new MangabakaSyncService(repo as never, client as never, events as never, scope as never);
  return { repo, client, events, scope, service };
}

describe('MangabakaSyncService', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds the series with the furthest chapter read and days in the user time zone', async () => {
    const { service, client, repo } = build([read(1, '10v1'), read(2, '10v2', '2026-11-21T03:00:00Z'), read(3, null)]);
    const result = await service.syncSeries(1, 7);
    expect(client.createEntry).toHaveBeenCalledWith('mb-secret-abcd', '10', {
      state: 'reading',
      progress_chapter: 2,
      start_date: '2026-11-01',
    });
    expect(result).toMatchObject({ outcome: 'created', mangabakaId: '10', url: 'https://mangabaka.org/manga/10/S', progressChapter: 2 });
    expect(result.message).toContain('1 book has no MangaBaka id');
    expect(repo.saveResult).toHaveBeenCalledWith(1, 7, result);
  });

  it('writes to the series MangaBaka merged it into', async () => {
    const { service, client } = build([read(1, '10v1')]);
    client.series.mockResolvedValue({ id: '99', title: 'S', url: null, status: 'releasing', totalChapters: null, finalVolume: null });
    await service.syncSeries(1, 7);
    expect(client.entry).toHaveBeenCalledWith('mb-secret-abcd', '99');
    expect(client.createEntry).toHaveBeenCalledWith('mb-secret-abcd', '99', expect.anything());
  });

  it('patches only what is higher, and leaves an up-to-date entry alone', async () => {
    const { service, client } = build([read(1, '10v12')]);
    client.entry.mockResolvedValue({ state: 'reading', progressChapter: 11, progressVolume: null, startDate: '2026-01-01', finishDate: null });
    expect(await service.syncSeries(1, 7)).toMatchObject({ outcome: 'updated' });
    expect(client.patchEntry).toHaveBeenCalledWith('mb-secret-abcd', '10', { progress_chapter: 12 });

    client.patchEntry.mockClear();
    client.entry.mockResolvedValue({ state: 'reading', progressChapter: 40, progressVolume: null, startDate: '2026-01-01', finishDate: null });
    expect(await service.syncSeries(1, 7)).toMatchObject({ outcome: 'unchanged' });
    expect(client.patchEntry).not.toHaveBeenCalled();
  });

  it('skips without a token, when switched off, or without any MangaBaka id', async () => {
    const { service, repo, client } = build([read(1, null)]);
    expect(await service.syncSeries(1, 7)).toMatchObject({ outcome: 'skipped', message: expect.stringContaining('No book of this series') });
    repo.findSettings.mockResolvedValue({ userId: 1, apiToken: 't', enabled: false });
    expect(await service.syncSeries(1, 7)).toMatchObject({ outcome: 'skipped', message: expect.stringContaining('switched off') });
    repo.findSettings.mockResolvedValue(null);
    expect(await service.syncSeries(1, 7)).toMatchObject({ outcome: 'skipped', message: expect.stringContaining('No MangaBaka token') });
    expect(client.series).not.toHaveBeenCalled();
  });

  it('falls back to the licensing match when no book has an id', async () => {
    const { service, repo, client } = build([read(1, null)]);
    repo.licensingMangabakaId.mockResolvedValue('10');
    await service.syncSeries(1, 7);
    expect(client.series).toHaveBeenCalledWith('mb-secret-abcd', '10');
  });

  it('records a failure instead of throwing', async () => {
    const { service, client, repo } = build([read(1, '10v1')]);
    client.entry.mockRejectedValue(new MangabakaApiError('MangaBaka refused the token.', 401));
    const result = await service.syncSeries(1, 7);
    expect(result).toMatchObject({ outcome: 'error', message: 'MangaBaka refused the token.' });
    expect(repo.saveResult).toHaveBeenCalledWith(1, 7, result);
  });

  it('syncs a selected series a little after one of its books changes status', async () => {
    vi.useFakeTimers();
    const { service, events, client } = build([read(1, '10v1')]);
    service.onModuleInit();
    events.emit(ACHIEVEMENT_EVENT_BOOK_STATUS_CHANGED, { userId: 1, bookId: 1, newStatus: 'read', previousStatus: 'reading' });
    events.emit(ACHIEVEMENT_EVENT_BOOK_STATUS_CHANGED, { userId: 1, bookId: 1, newStatus: 'read', previousStatus: 'reading' });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(client.series).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.runAllTimersAsync();
    expect(client.createEntry).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });

  it('ignores status changes of books in series that are not selected', async () => {
    vi.useFakeTimers();
    const { service, events, repo, client } = build([read(1, '10v1')]);
    repo.selectedSeriesForBook.mockResolvedValue([]);
    service.onModuleInit();
    events.emit(ACHIEVEMENT_EVENT_BOOK_STATUS_CHANGED, { userId: 1, bookId: 1, newStatus: 'read', previousStatus: null });
    await vi.runAllTimersAsync();
    expect(client.series).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('turning a series on syncs it at once; off forgets it', async () => {
    const { service, repo, client } = build([read(1, '10v3')]);
    await service.setSelected(1, 7, true);
    expect(repo.select).toHaveBeenCalledWith(1, 7);
    expect(client.createEntry).toHaveBeenCalled();
    await service.setSelected(1, 7, false);
    expect(repo.unselect).toHaveBeenCalledWith(1, 7);
  });

  it('checks a new token before saving it, and never returns it', async () => {
    const { service, repo, client } = build([]);
    const settings = await service.updateSettings(1, { apiToken: ' mb-secret-abcd ' });
    expect(client.checkToken).toHaveBeenCalledWith('mb-secret-abcd');
    expect(repo.saveToken).toHaveBeenCalledWith(1, 'mb-secret-abcd');
    expect(settings).toMatchObject({ configured: true, tokenHint: 'abcd' });
    expect(JSON.stringify(settings)).not.toContain('secret');

    client.checkToken.mockRejectedValue(new MangabakaApiError('MangaBaka refused the token.', 401));
    const refused = await service.updateSettings(1, { apiToken: 'mb-bad' }).catch((e: { getResponse(): unknown }) => e.getResponse());
    expect(refused).toEqual({ errorCode: 'MANGABAKA_TOKEN_REFUSED', message: 'MangaBaka refused the token.' });
    await service.updateSettings(1, { apiToken: '' });
    expect(repo.deleteSettings).toHaveBeenCalledWith(1);
  });

  it('describes what was sent', () => {
    expect(describeBody({ state: 'completed', progress_chapter: 20, progress_volume: 3, finish_date: '2026-03-09' })).toBe(
      'Completed, chapter 20, volume 3, finished 2026-03-09',
    );
    expect(describeBody({ progress_chapter: 10.5 })).toBe('chapter 10.5');
  });
});
