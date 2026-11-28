import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import type {
  MangabakaLibraryState,
  MangabakaSyncResult,
  MangabakaSyncSeriesStatus,
  MangabakaSyncSettings,
  MangabakaSyncSettingsUpdate,
} from '@bookorbit/types';

import { LibraryScopeService } from '../../common/library-scope/library-scope.service';
import { toDateKeyInTimeZone } from '../../common/utils/timezone.utils';
import {
  ACHIEVEMENT_EVENT_BOOK_STATUS_CHANGED,
  AchievementEventsService,
  type BookStatusChangedPayload,
} from '../../modules/achievement/achievement-events.service';
import { MangabakaApiError, MangabakaSyncClientService } from './mangabaka-sync-client.service';
import { planMangabakaEntry, resolveMangabakaSeries, type MangabakaEntryBody, type SyncBook } from './mangabaka-sync-plan';
import { MangabakaSyncRepository } from './mangabaka-sync.repository';

/** A status change waits this long, so marking several volumes read in a row ends in one sync. */
const DEFAULT_DEBOUNCE_MS = 10_000;
const FIRST_SWEEP_DELAY_MS = 10 * 60 * 1000;

const STATE_LABELS: Record<MangabakaLibraryState, string> = {
  considering: 'Considering',
  completed: 'Completed',
  dropped: 'Dropped',
  paused: 'Paused',
  plan_to_read: 'Plan to read',
  reading: 'Reading',
  rereading: 'Rereading',
};

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/** "Reading, chapter 12, volume 2, started 2026-01-02" for what was sent. */
export function describeBody(body: MangabakaEntryBody): string {
  const parts: string[] = [];
  if (body.state) parts.push(STATE_LABELS[body.state]);
  if (body.progress_chapter !== undefined) parts.push(`chapter ${formatNumber(body.progress_chapter)}`);
  if (body.progress_volume !== undefined) parts.push(`volume ${formatNumber(body.progress_volume)}`);
  if (body.start_date) parts.push(`started ${body.start_date}`);
  if (body.finish_date) parts.push(`finished ${body.finish_date}`);
  return parts.join(', ');
}

function maskToken(token: string): string | null {
  return token.length >= 4 ? token.slice(-4) : null;
}

/**
 * Fork-only: pushes the reading state of chosen series to the user's MangaBaka library. One way,
 * per series, never lowering MangaBaka's chapter or volume numbers.
 */
@Injectable()
export class MangabakaSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MangabakaSyncService.name);
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly runningAll = new Set<number>();
  private chain: Promise<unknown> = Promise.resolve();
  private sweepTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listener = (payload: BookStatusChangedPayload) => void this.handleStatusChanged(payload);
  private readonly debounceMs = Number(process.env.FORK_MANGABAKA_SYNC_DEBOUNCE_MS) || DEFAULT_DEBOUNCE_MS;

  constructor(
    private readonly repo: MangabakaSyncRepository,
    private readonly client: MangabakaSyncClientService,
    private readonly achievementEvents: AchievementEventsService,
    private readonly libraryScope: LibraryScopeService,
  ) {}

  onModuleInit(): void {
    this.achievementEvents.on(ACHIEVEMENT_EVENT_BOOK_STATUS_CHANGED, this.listener);
    const hours = Number(process.env.FORK_MANGABAKA_SYNC_SWEEP_HOURS ?? 24);
    if (Number.isFinite(hours) && hours > 0 && process.env.NODE_ENV !== 'test') {
      this.scheduleSweep(FIRST_SWEEP_DELAY_MS, hours * 60 * 60 * 1000);
    }
  }

  onModuleDestroy(): void {
    this.achievementEvents.off(ACHIEVEMENT_EVENT_BOOK_STATUS_CHANGED, this.listener);
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    if (this.sweepTimer) clearTimeout(this.sweepTimer);
  }

  // ── settings ────────────────────────────────────────────────────────────────────────────

  async settings(userId: number): Promise<MangabakaSyncSettings> {
    const [row, series] = await Promise.all([this.repo.findSettings(userId), this.repo.listSelected(userId)]);
    return {
      configured: row !== null,
      tokenHint: row ? maskToken(row.apiToken) : null,
      enabled: row?.enabled ?? false,
      running: this.runningAll.has(userId),
      series: series.map((s) => ({ seriesId: s.seriesId, seriesName: s.seriesName, last: s.lastResult })),
    };
  }

  async updateSettings(userId: number, update: MangabakaSyncSettingsUpdate): Promise<MangabakaSyncSettings> {
    if (update.apiToken !== undefined) {
      const token = update.apiToken.trim();
      if (token === '') {
        await this.repo.deleteSettings(userId);
      } else {
        try {
          await this.client.checkToken(token);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'MangaBaka refused the token.';
          throw new BadRequestException({ errorCode: 'MANGABAKA_TOKEN_REFUSED', message });
        }
        await this.repo.saveToken(userId, token);
      }
    }
    if (update.enabled !== undefined && (await this.repo.findSettings(userId))) {
      await this.repo.setEnabled(userId, update.enabled);
    }
    return this.settings(userId);
  }

  // ── one series ──────────────────────────────────────────────────────────────────────────

  async seriesStatus(userId: number, seriesId: number): Promise<MangabakaSyncSeriesStatus> {
    if (!(await this.repo.seriesExists(seriesId))) throw new NotFoundException('Series not found');
    const [settings, selected, books, fallback] = await Promise.all([
      this.repo.findSettings(userId),
      this.repo.findSelected(userId, seriesId),
      this.loadBooks(userId, seriesId),
      this.repo.licensingMangabakaId(seriesId),
    ]);
    return {
      configured: settings !== null,
      enabled: settings?.enabled ?? false,
      selected: selected !== null,
      mangabakaId: resolveMangabakaSeries(books, fallback).mangabakaId,
      last: selected?.lastResult ?? null,
    };
  }

  /** Turning a series on syncs it right away; the answer carries that first result. */
  async setSelected(userId: number, seriesId: number, selected: boolean): Promise<MangabakaSyncSeriesStatus> {
    if (!(await this.repo.seriesExists(seriesId))) throw new NotFoundException('Series not found');
    if (selected) {
      await this.repo.select(userId, seriesId);
      await this.syncSeries(userId, seriesId);
    } else {
      this.cancelPending(userId, seriesId);
      await this.repo.unselect(userId, seriesId);
    }
    return this.seriesStatus(userId, seriesId);
  }

  async syncNow(userId: number, seriesId: number): Promise<MangabakaSyncSeriesStatus> {
    if (!(await this.repo.findSelected(userId, seriesId))) {
      throw new NotFoundException({ errorCode: 'MANGABAKA_SERIES_NOT_SELECTED', message: 'This series is not synced to MangaBaka.' });
    }
    await this.syncSeries(userId, seriesId);
    return this.seriesStatus(userId, seriesId);
  }

  /** Syncs every selected series of the user in the background. */
  startSyncAll(userId: number): boolean {
    if (this.runningAll.has(userId)) return false;
    this.runningAll.add(userId);
    void this.syncAll(userId).finally(() => this.runningAll.delete(userId));
    return true;
  }

  private async syncAll(userId: number): Promise<void> {
    const selected = await this.repo.listSelected(userId);
    for (const series of selected) {
      await this.syncSeries(userId, series.seriesId);
    }
  }

  /** Runs one series' sync after the others (one at a time across users) and records the result. */
  syncSeries(userId: number, seriesId: number): Promise<MangabakaSyncResult> {
    this.cancelPending(userId, seriesId);
    const run = async (): Promise<MangabakaSyncResult> => {
      let result: MangabakaSyncResult;
      try {
        result = await this.runSync(userId, seriesId);
      } catch (error) {
        const message = error instanceof MangabakaApiError || error instanceof Error ? error.message : String(error);
        this.logger.warn(`[fork.mangabaka_sync] user=${userId} series=${seriesId} failed: ${message}`);
        result = this.result('error', message, null);
      }
      await this.repo.saveResult(userId, seriesId, result);
      return result;
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async runSync(userId: number, seriesId: number): Promise<MangabakaSyncResult> {
    const settings = await this.repo.findSettings(userId);
    if (!settings) return this.result('skipped', 'No MangaBaka token is saved.', null);
    if (!settings.enabled) return this.result('skipped', 'MangaBaka sync is switched off.', null);

    const [books, fallback] = await Promise.all([this.loadBooks(userId, seriesId), this.repo.licensingMangabakaId(seriesId)]);
    const resolved = resolveMangabakaSeries(books, fallback);
    if (!resolved.mangabakaId) {
      return this.result('skipped', 'No book of this series has a MangaBaka id. Fetch its metadata from MangaBaka first.', null);
    }

    const series = await this.client.series(settings.apiToken, resolved.mangabakaId);
    const remote = await this.client.entry(settings.apiToken, series.id);
    const plan = planMangabakaEntry(books, resolved.mangabakaId, series, remote);
    const notes = this.bookNotes(resolved.booksWithoutId, resolved.otherSeriesBooks);
    const base = { state: plan.local.state, progressChapter: plan.local.progressChapter, progressVolume: plan.local.progressVolume };

    if (plan.action === 'none') {
      const message = plan.reason === 'nothing_read' ? 'Nothing read or wanted yet, so nothing was sent.' : 'Already up to date.';
      return { ...this.result(plan.reason === 'nothing_read' ? 'skipped' : 'unchanged', message + notes, series.id, series.url), ...base };
    }
    if (plan.action === 'create') await this.client.createEntry(settings.apiToken, series.id, plan.body);
    else await this.client.patchEntry(settings.apiToken, series.id, plan.body);
    this.logger.log(`[fork.mangabaka_sync] user=${userId} series=${seriesId} mangabaka=${series.id} ${plan.action} ${JSON.stringify(plan.body)}`);
    const verb = plan.action === 'create' ? 'Added to MangaBaka' : 'Updated on MangaBaka';
    return {
      ...this.result(plan.action === 'create' ? 'created' : 'updated', `${verb}: ${describeBody(plan.body)}.${notes}`, series.id, series.url),
      ...base,
    };
  }

  private bookNotes(withoutId: number, otherSeries: number): string {
    const notes: string[] = [];
    if (withoutId > 0) notes.push(`${withoutId} book${withoutId === 1 ? ' has' : 's have'} no MangaBaka id`);
    if (otherSeries > 0) notes.push(`${otherSeries} book${otherSeries === 1 ? ' points' : 's point'} at another MangaBaka series`);
    return notes.length > 0 ? ` (${notes.join('; ')}, left out.)` : '';
  }

  private result(
    outcome: MangabakaSyncResult['outcome'],
    message: string,
    mangabakaId: string | null,
    url: string | null = null,
  ): MangabakaSyncResult {
    return { outcome, message, mangabakaId, url, state: null, progressChapter: null, progressVolume: null, syncedAt: new Date().toISOString() };
  }

  private async loadBooks(userId: number, seriesId: number): Promise<SyncBook[]> {
    const [libraryIds, timeZone] = await Promise.all([this.libraryScope.visibleIdsOrAllForUserId(userId), this.repo.userTimeZone(userId)]);
    const rows = await this.repo.seriesBooks(userId, seriesId, libraryIds);
    const day = (date: Date | null) => (date ? toDateKeyInTimeZone(date, timeZone) : null);
    return rows.map((row) => ({
      bookId: row.bookId,
      status: row.status,
      startedDay: day(row.startedAt),
      finishedDay: day(row.finishedAt),
      providerId: row.providerId,
    }));
  }

  // ── automatic runs ──────────────────────────────────────────────────────────────────────

  private async handleStatusChanged(payload: BookStatusChangedPayload): Promise<void> {
    try {
      const seriesIds = await this.repo.selectedSeriesForBook(payload.userId, payload.bookId);
      for (const seriesId of seriesIds) this.schedule(payload.userId, seriesId);
    } catch (error) {
      this.logger.warn(`[fork.mangabaka_sync] status change of book ${payload.bookId} not handled: ${String(error)}`);
    }
  }

  schedule(userId: number, seriesId: number): void {
    const key = `${userId}:${seriesId}`;
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pending.delete(key);
      void this.syncSeries(userId, seriesId);
    }, this.debounceMs);
    timer.unref?.();
    this.pending.set(key, timer);
  }

  private cancelPending(userId: number, seriesId: number): void {
    const key = `${userId}:${seriesId}`;
    const timer = this.pending.get(key);
    if (timer) clearTimeout(timer);
    this.pending.delete(key);
  }

  /** A daily pass catches what changed on MangaBaka's side (a series marked finished, a new last chapter). */
  private scheduleSweep(delayMs: number, everyMs: number): void {
    this.sweepTimer = setTimeout(() => {
      void this.sweep().finally(() => this.scheduleSweep(everyMs, everyMs));
    }, delayMs);
    this.sweepTimer.unref?.();
  }

  async sweep(): Promise<void> {
    try {
      for (const userId of await this.repo.listActiveUserIds()) {
        if (this.runningAll.has(userId)) continue;
        this.runningAll.add(userId);
        try {
          await this.syncAll(userId);
        } finally {
          this.runningAll.delete(userId);
        }
      }
    } catch (error) {
      this.logger.warn(`[fork.mangabaka_sync] daily pass failed: ${String(error)}`);
    }
  }
}
