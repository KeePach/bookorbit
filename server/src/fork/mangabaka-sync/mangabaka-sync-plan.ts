import type { MangabakaLibraryState, ReadStatus } from '@bookorbit/types';

import { parseMangabakaProviderId } from './mangabaka-provider-id';

/** One book of the series as the user sees it. Days are `YYYY-MM-DD` in the user's time zone. */
export interface SyncBook {
  bookId: number;
  status: ReadStatus | null;
  startedDay: string | null;
  finishedDay: string | null;
  /** The book's stored MangaBaka provider id (`1692vol3v11`), if it has one. */
  providerId: string | null;
}

/** What MangaBaka says about the series itself. */
export interface MangabakaSeriesInfo {
  /** Publication status: cancelled, completed, hiatus, releasing, unknown, upcoming. */
  status: string | null;
  totalChapters: number | null;
  finalVolume: number | null;
}

/** The user's MangaBaka library entry for the series, as far as the sync cares. */
export interface MangabakaEntry {
  state: MangabakaLibraryState | null;
  progressChapter: number | null;
  progressVolume: number | null;
  startDate: string | null;
  finishDate: string | null;
}

export interface MangabakaEntryBody {
  state?: MangabakaLibraryState;
  progress_chapter?: number;
  progress_volume?: number;
  start_date?: string;
  finish_date?: string;
}

export interface LocalSeriesState {
  state: MangabakaLibraryState | null;
  progressChapter: number | null;
  progressVolume: number | null;
  startDay: string | null;
  finishDay: string | null;
  /** Books that counted (their id points at the chosen MangaBaka series). */
  countedBooks: number;
}

export type SyncPlan =
  | { action: 'none'; reason: 'nothing_read' | 'up_to_date'; local: LocalSeriesState }
  | { action: 'create' | 'patch'; body: MangabakaEntryBody; local: LocalSeriesState };

const READ = new Set<ReadStatus>(['read', 'skimmed']);
const STARTED = new Set<ReadStatus>(['reading', 'rereading', 'read', 'skimmed', 'on_hold', 'abandoned']);

export interface ResolvedMangabakaSeries {
  mangabakaId: string | null;
  /** Books whose id points at another MangaBaka series than the chosen one. */
  otherSeriesBooks: number;
  /** Books without a usable MangaBaka id. */
  booksWithoutId: number;
}

/**
 * The MangaBaka series the books point at: the id most of them carry (first seen on a tie). With
 * no book id at all, `fallback` (the licensing match for the series) is used.
 */
export function resolveMangabakaSeries(books: SyncBook[], fallback: string | null): ResolvedMangabakaSeries {
  const counts = new Map<string, number>();
  let booksWithoutId = 0;
  for (const book of books) {
    const parsed = parseMangabakaProviderId(book.providerId);
    if (!parsed) {
      booksWithoutId += 1;
      continue;
    }
    counts.set(parsed.seriesId, (counts.get(parsed.seriesId) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  if (best === null) {
    const id = fallback && /^\d+$/.test(fallback) ? fallback : null;
    return { mangabakaId: id, otherSeriesBooks: 0, booksWithoutId };
  }
  const withId = books.length - booksWithoutId;
  return { mangabakaId: best, otherSeriesBooks: withId - bestCount, booksWithoutId };
}

function maxOf(current: number | null, next: number | null): number | null {
  if (next === null) return current;
  return current === null ? next : Math.max(current, next);
}

function earlier(current: string | null, next: string | null): string | null {
  if (!next) return current;
  return current === null || next < current ? next : current;
}

function later(current: string | null, next: string | null): string | null {
  if (!next) return current;
  return current === null || next > current ? next : current;
}

/**
 * The series' state from its books: the furthest volume and chapter among the books marked read,
 * and a state chosen in this order: something being read, rereading, on hold (paused), abandoned
 * (dropped), something read (reading, or completed per `isFinished`), something wanted
 * (plan to read). No book of the series started or wanted: no state.
 */
export interface DerivedSeriesState extends Omit<LocalSeriesState, 'state'> {
  baseState: MangabakaLibraryState | null;
  /** "Reading" only because books are read: nothing is in progress, paused or dropped. */
  caughtUp: boolean;
}

export function deriveLocalSeriesState(books: SyncBook[], mangabakaId: string): DerivedSeriesState {
  let progressChapter: number | null = null;
  let progressVolume: number | null = null;
  let startDay: string | null = null;
  let finishDay: string | null = null;
  let countedBooks = 0;
  const statuses = new Set<ReadStatus>();

  for (const book of books) {
    const parsed = parseMangabakaProviderId(book.providerId);
    if (!parsed || parsed.seriesId !== mangabakaId) continue;
    countedBooks += 1;
    const status = book.status ?? 'unread';
    statuses.add(status);
    if (STARTED.has(status)) startDay = earlier(startDay, book.startedDay ?? book.finishedDay);
    if (!READ.has(status)) continue;
    finishDay = later(finishDay, book.finishedDay);
    progressChapter = maxOf(progressChapter, parsed.oneshot ? 1 : parsed.chapter);
    progressVolume = maxOf(progressVolume, parsed.volume);
  }

  let baseState: MangabakaLibraryState | null = null;
  let caughtUp = false;
  if (statuses.has('reading')) baseState = 'reading';
  else if (statuses.has('rereading')) baseState = 'rereading';
  else if (statuses.has('on_hold')) baseState = 'paused';
  else if (statuses.has('abandoned')) baseState = 'dropped';
  else if (statuses.has('read') || statuses.has('skimmed')) {
    baseState = 'reading';
    caughtUp = true;
  } else if (statuses.has('want_to_read')) baseState = 'plan_to_read';

  return { baseState, caughtUp, progressChapter, progressVolume, startDay, finishDay, countedBooks };
}

/**
 * Finished means MangaBaka calls the series completed and the last chapter it lists has been read
 * (on either side). A series read by volume only, with no chapter numbers anywhere, counts its
 * final volume instead.
 */
export function reachedTheEnd(series: MangabakaSeriesInfo, chapter: number | null, volume: number | null): boolean {
  if (series.status !== 'completed') return false;
  if (series.totalChapters !== null && chapter !== null) return chapter >= series.totalChapters;
  if (chapter === null && series.finalVolume !== null && volume !== null) return volume >= series.finalVolume;
  return false;
}

/** A state on MangaBaka the derived one should not replace. */
function keepsRemoteState(remote: MangabakaLibraryState, desired: MangabakaLibraryState): boolean {
  // Completed stays completed unless the series is being read again.
  if (remote === 'completed') return desired !== 'rereading';
  // Only something still undecided becomes "plan to read".
  if (desired === 'plan_to_read') return remote !== 'considering';
  return false;
}

/**
 * What to send. One way only (BookOrbit to MangaBaka), and progress is never lowered: a number is
 * sent only when it is higher than MangaBaka's. Rating, notes, lists and the rest are never sent.
 */
export function planMangabakaEntry(books: SyncBook[], mangabakaId: string, series: MangabakaSeriesInfo, remote: MangabakaEntry | null): SyncPlan {
  const derived = deriveLocalSeriesState(books, mangabakaId);
  const chapter = maxOf(derived.progressChapter, remote?.progressChapter ?? null);
  const volume = maxOf(derived.progressVolume, remote?.progressVolume ?? null);
  let state = derived.baseState;
  if (derived.caughtUp && reachedTheEnd(series, chapter, volume)) state = 'completed';

  const local: LocalSeriesState = {
    state,
    progressChapter: derived.progressChapter,
    progressVolume: derived.progressVolume,
    startDay: derived.startDay,
    finishDay: derived.finishDay,
    countedBooks: derived.countedBooks,
  };
  if (state === null) return { action: 'none', reason: 'nothing_read', local };

  if (remote === null) {
    const body: MangabakaEntryBody = { state };
    if (derived.progressChapter !== null && derived.progressChapter > 0) body.progress_chapter = derived.progressChapter;
    if (derived.progressVolume !== null && derived.progressVolume > 0) body.progress_volume = derived.progressVolume;
    if (derived.startDay) body.start_date = derived.startDay;
    if (state === 'completed' && derived.finishDay) body.finish_date = derived.finishDay;
    return { action: 'create', body, local };
  }

  const body: MangabakaEntryBody = {};
  if (derived.progressChapter !== null && derived.progressChapter > (remote.progressChapter ?? 0)) body.progress_chapter = derived.progressChapter;
  if (derived.progressVolume !== null && derived.progressVolume > (remote.progressVolume ?? 0)) body.progress_volume = derived.progressVolume;
  let finalState = remote.state;
  if (remote.state === null || (state !== remote.state && !keepsRemoteState(remote.state, state))) {
    body.state = state;
    finalState = state;
  }
  if (!remote.startDate && derived.startDay) body.start_date = derived.startDay;
  if (finalState === 'completed' && !remote.finishDate && derived.finishDay) body.finish_date = derived.finishDay;

  if (Object.keys(body).length === 0) return { action: 'none', reason: 'up_to_date', local };
  return { action: 'patch', body, local };
}
