import { Injectable } from '@nestjs/common';

import type { MangabakaLibraryState } from '@bookorbit/types';

import type { MangabakaEntry, MangabakaEntryBody, MangabakaSeriesInfo } from './mangabaka-sync-plan';

const DEFAULT_BASE_URL = 'https://api.mangabaka.org';
const USER_AGENT = 'bookorbit-fork-mangabaka-sync';
/** Time between two requests; MangaBaka limits by IP and the provider paces at the same rate. */
const PACE_MS = 350;
const TIMEOUT_MS = 15_000;
const SERIES_CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_RETRY_AFTER_MS = 30_000;
const STATES = new Set<MangabakaLibraryState>(['considering', 'completed', 'dropped', 'paused', 'plan_to_read', 'reading', 'rereading']);

export class MangabakaApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

export interface MangabakaSeriesLookup extends MangabakaSeriesInfo {
  /** The id to write to: the series itself, or the one it was merged into. */
  id: string;
  title: string | null;
  /** The series' page on mangabaka.org. */
  url: string | null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function dayOrNull(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

/** Talks to MangaBaka with a user's personal access token (`x-api-key`). */
@Injectable()
export class MangabakaSyncClientService {
  private readonly baseUrl = (process.env.FORK_MANGABAKA_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  private readonly seriesCache = new Map<string, { at: number; value: MangabakaSeriesLookup }>();
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  /** Checks the token by reading one entry of the library. */
  async checkToken(token: string): Promise<void> {
    await this.request(token, 'GET', '/v1/my/library?limit=1');
  }

  async series(token: string, id: string): Promise<MangabakaSeriesLookup> {
    const cached = this.seriesCache.get(id);
    if (cached && Date.now() - cached.at < SERIES_CACHE_MS) return cached.value;
    let response = await this.request(token, 'GET', `/v1/series/${encodeURIComponent(id)}`);
    let data = (response as { data?: Record<string, unknown> } | null)?.data ?? {};
    const mergedWith = numberOrNull(data.merged_with);
    if (mergedWith !== null && String(mergedWith) !== id) {
      response = await this.request(token, 'GET', `/v1/series/${mergedWith}`);
      data = (response as { data?: Record<string, unknown> } | null)?.data ?? {};
    }
    const value: MangabakaSeriesLookup = {
      id: String(numberOrNull(data.id) ?? mergedWith ?? id),
      title: typeof data.title === 'string' ? data.title : null,
      url: typeof data.canonical_url === 'string' && data.canonical_url.startsWith('https://mangabaka.org/') ? data.canonical_url : null,
      status: typeof data.status === 'string' ? data.status : null,
      totalChapters: numberOrNull(data.total_chapters),
      finalVolume: numberOrNull(data.final_volume),
    };
    this.seriesCache.set(id, { at: Date.now(), value });
    return value;
  }

  /** The user's library entry for a series, or null when it is not in the library. */
  async entry(token: string, id: string): Promise<MangabakaEntry | null> {
    try {
      const response = await this.request(token, 'GET', `/v1/my/library/${encodeURIComponent(id)}`);
      const data = (response as { data?: Record<string, unknown> } | null)?.data;
      if (!data) return null;
      const state = typeof data.state === 'string' && STATES.has(data.state as MangabakaLibraryState) ? (data.state as MangabakaLibraryState) : null;
      return {
        state,
        progressChapter: numberOrNull(data.progress_chapter),
        progressVolume: numberOrNull(data.progress_volume),
        startDate: dayOrNull(data.start_date),
        finishDate: dayOrNull(data.finish_date),
      };
    } catch (error) {
      if (error instanceof MangabakaApiError && error.status === 404) return null;
      throw error;
    }
  }

  async createEntry(token: string, id: string, body: MangabakaEntryBody): Promise<void> {
    await this.request(token, 'POST', `/v1/my/library/${encodeURIComponent(id)}`, body);
  }

  async patchEntry(token: string, id: string, body: MangabakaEntryBody): Promise<void> {
    await this.request(token, 'PATCH', `/v1/my/library/${encodeURIComponent(id)}`, body);
  }

  /** One request at a time, PACE_MS apart, with one retry after a 429. */
  private request(token: string, method: string, path: string, body?: unknown): Promise<unknown> {
    const run = async () => {
      let response = await this.send(token, method, path, body);
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS) : 5_000;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        response = await this.send(token, method, path, body);
      }
      if (!response.ok) throw new MangabakaApiError(await this.describe(response), response.status);
      const text = await response.text();
      return text ? (JSON.parse(text) as unknown) : null;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async send(token: string, method: string, path: string, body?: unknown): Promise<Response> {
    const wait = this.lastRequestAt + PACE_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'x-api-key': token,
          'user-agent': USER_AGENT,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new MangabakaApiError(`MangaBaka could not be reached (${error instanceof Error ? error.message : String(error)})`, null);
    }
  }

  private async describe(response: Response): Promise<string> {
    if (response.status === 401 || response.status === 403) return 'MangaBaka refused the token. Check it under Upcoming > MangaBaka reading sync.';
    if (response.status === 429) return 'MangaBaka asked to slow down. Try again later.';
    let detail = '';
    try {
      const json = (await response.json()) as { message?: unknown; error?: unknown };
      const message = json.message ?? json.error;
      if (typeof message === 'string') detail = message;
    } catch {
      // No JSON body.
    }
    return `MangaBaka answered HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`;
  }
}
