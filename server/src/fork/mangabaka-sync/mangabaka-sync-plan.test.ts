import { describe, expect, it } from 'vitest';

import type { ReadStatus } from '@bookorbit/types';

import {
  planMangabakaEntry,
  reachedTheEnd,
  resolveMangabakaSeries,
  type MangabakaEntry,
  type MangabakaSeriesInfo,
  type SyncBook,
} from './mangabaka-sync-plan';

let nextId = 1;
function book(providerId: string | null, status: ReadStatus | null, days: { started?: string; finished?: string } = {}): SyncBook {
  return { bookId: nextId++, providerId, status, startedDay: days.started ?? null, finishedDay: days.finished ?? null };
}

const releasing: MangabakaSeriesInfo = { status: 'releasing', totalChapters: 139, finalVolume: 32 };
const finished: MangabakaSeriesInfo = { status: 'completed', totalChapters: 20, finalVolume: 3 };

function entry(patch: Partial<MangabakaEntry> = {}): MangabakaEntry {
  return { state: 'reading', progressChapter: null, progressVolume: null, startDate: null, finishDate: null, ...patch };
}

describe('resolveMangabakaSeries', () => {
  it('takes the id most books carry', () => {
    const books = [book('10v1', 'read'), book('10v2', 'read'), book('99vol1', 'read'), book(null, 'read')];
    expect(resolveMangabakaSeries(books, '55')).toEqual({ mangabakaId: '10', otherSeriesBooks: 1, booksWithoutId: 1 });
  });

  it('falls back to the licensing match only when no book has an id', () => {
    expect(resolveMangabakaSeries([book(null, 'read')], '55')).toEqual({ mangabakaId: '55', otherSeriesBooks: 0, booksWithoutId: 1 });
    expect(resolveMangabakaSeries([book(null, 'read')], null).mangabakaId).toBeNull();
  });
});

describe('planMangabakaEntry', () => {
  it('creates the entry with the furthest chapter and volume read', () => {
    const books = [
      book('10vol1v1', 'read', { started: '2026-01-02', finished: '2026-01-03' }),
      book('10vol1v5', 'read', { started: '2026-01-04', finished: '2026-01-05' }),
      book('10vol2v6', 'unread'),
    ];
    const plan = planMangabakaEntry(books, '10', releasing, null);
    expect(plan).toMatchObject({ action: 'create', body: { state: 'reading', progress_chapter: 5, progress_volume: 1, start_date: '2026-01-02' } });
    expect(plan.action === 'create' && plan.body.finish_date).toBeFalsy();
  });

  it('counts only read books for progress, not the one being read', () => {
    const plan = planMangabakaEntry([book('10v1', 'read'), book('10v2', 'reading')], '10', releasing, null);
    expect(plan).toMatchObject({ action: 'create', body: { state: 'reading', progress_chapter: 1 } });
  });

  it('picks the state in order: reading, rereading, paused, dropped, read, wanted', () => {
    const state = (statuses: ReadStatus[]) => {
      const plan = planMangabakaEntry(
        statuses.map((s, i) => book(`10v${i + 1}`, s)),
        '10',
        releasing,
        null,
      );
      return plan.action === 'create' ? plan.body.state : null;
    };
    expect(state(['read', 'reading', 'on_hold'])).toBe('reading');
    expect(state(['read', 'rereading'])).toBe('rereading');
    expect(state(['read', 'on_hold', 'abandoned'])).toBe('paused');
    expect(state(['read', 'abandoned'])).toBe('dropped');
    expect(state(['read', 'want_to_read'])).toBe('reading');
    expect(state(['want_to_read', 'unread'])).toBe('plan_to_read');
    expect(state(['unread'])).toBeNull();
  });

  it('sends nothing when nothing is read or wanted', () => {
    expect(planMangabakaEntry([book('10v1', 'unread')], '10', releasing, null)).toMatchObject({ action: 'none', reason: 'nothing_read' });
  });

  it('ignores books of another MangaBaka series and books without an id', () => {
    const plan = planMangabakaEntry([book('10v3', 'read'), book('99v50', 'read'), book(null, 'read')], '10', releasing, null);
    expect(plan).toMatchObject({ action: 'create', body: { progress_chapter: 3 } });
    expect(plan.local.countedBooks).toBe(1);
  });

  describe('completed', () => {
    it('only when MangaBaka says finished and the last listed chapter is read', () => {
      const books = Array.from({ length: 20 }, (_, i) => book(`10v${i + 1}`, 'read', { finished: `2026-02-${String(i + 1).padStart(2, '0')}` }));
      expect(planMangabakaEntry(books, '10', finished, null)).toMatchObject({
        action: 'create',
        body: { state: 'completed', progress_chapter: 20, finish_date: '2026-02-20' },
      });
      expect(planMangabakaEntry(books.slice(0, 19), '10', finished, null)).toMatchObject({ body: { state: 'reading' } });
      expect(planMangabakaEntry(books, '10', { ...finished, status: 'releasing' }, null)).toMatchObject({ body: { state: 'reading' } });
    });

    it('not while a book is still being read', () => {
      const plan = planMangabakaEntry([book('10v20', 'read'), book('10v19', 'reading')], '10', finished, null);
      expect(plan).toMatchObject({ body: { state: 'reading' } });
    });

    it('counts the final volume when the series is read by volume only', () => {
      const plan = planMangabakaEntry([book('10vol1', 'read'), book('10vol2', 'read'), book('10vol3', 'read')], '10', finished, null);
      expect(plan).toMatchObject({ body: { state: 'completed', progress_volume: 3 } });
    });

    it('uses MangaBaka chapter progress when it is ahead', () => {
      const plan = planMangabakaEntry([book('10v18', 'read')], '10', finished, entry({ progressChapter: 20 }));
      expect(plan).toMatchObject({ action: 'patch', body: { state: 'completed' } });
      expect(plan.action === 'patch' && plan.body.progress_chapter).toBeUndefined();
    });

    it('stays reading when MangaBaka lists no chapter count', () => {
      expect(reachedTheEnd({ status: 'completed', totalChapters: null, finalVolume: null }, 50, 5)).toBe(false);
    });
  });

  describe('against an existing entry', () => {
    it('never lowers progress', () => {
      const plan = planMangabakaEntry([book('10vol2v8', 'read')], '10', releasing, entry({ progressChapter: 30, progressVolume: 4 }));
      expect(plan).toMatchObject({ action: 'none', reason: 'up_to_date' });
    });

    it('raises only the numbers that are higher', () => {
      const plan = planMangabakaEntry([book('10vol2v31', 'read')], '10', releasing, entry({ progressChapter: 30, progressVolume: 4 }));
      expect(plan).toEqual(expect.objectContaining({ action: 'patch', body: { progress_chapter: 31 } }));
    });

    it('keeps completed unless the series is reread', () => {
      expect(planMangabakaEntry([book('10v3', 'read')], '10', releasing, entry({ state: 'completed', progressChapter: 3 }))).toMatchObject({
        action: 'none',
      });
      expect(planMangabakaEntry([book('10v3', 'rereading')], '10', releasing, entry({ state: 'completed', progressChapter: 3 }))).toMatchObject({
        action: 'patch',
        body: { state: 'rereading' },
      });
    });

    it('does not turn a started entry back into plan to read', () => {
      expect(planMangabakaEntry([book('10v1', 'want_to_read')], '10', releasing, entry({ state: 'reading' }))).toMatchObject({ action: 'none' });
      expect(planMangabakaEntry([book('10v1', 'want_to_read')], '10', releasing, entry({ state: 'considering' }))).toMatchObject({
        body: { state: 'plan_to_read' },
      });
    });

    it('follows a pause or a drop, and a pick-up after a drop', () => {
      expect(planMangabakaEntry([book('10v1', 'on_hold')], '10', releasing, entry())).toMatchObject({ body: { state: 'paused' } });
      expect(planMangabakaEntry([book('10v1', 'abandoned')], '10', releasing, entry())).toMatchObject({ body: { state: 'dropped' } });
      expect(planMangabakaEntry([book('10v2', 'reading')], '10', releasing, entry({ state: 'dropped' }))).toMatchObject({
        body: { state: 'reading' },
      });
    });

    it('fills dates only where MangaBaka has none', () => {
      const books = [book('10v20', 'read', { started: '2026-03-01', finished: '2026-03-09' })];
      expect(planMangabakaEntry(books, '10', finished, entry({ progressChapter: 19, startDate: '2025-01-01' }))).toEqual(
        expect.objectContaining({ body: { progress_chapter: 20, state: 'completed', finish_date: '2026-03-09' } }),
      );
    });
  });

  it('treats a read oneshot as chapter 1', () => {
    const plan = planMangabakaEntry([book('10os', 'read')], '10', { status: 'completed', totalChapters: 1, finalVolume: 1 }, null);
    expect(plan).toMatchObject({ body: { state: 'completed', progress_chapter: 1 } });
  });
});
