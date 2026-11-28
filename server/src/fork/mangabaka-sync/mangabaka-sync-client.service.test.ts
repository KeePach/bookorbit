import { afterEach, describe, expect, it, vi } from 'vitest';

import { MangabakaApiError, MangabakaSyncClientService } from './mangabaka-sync-client.service';

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('MangabakaSyncClientService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the token as x-api-key and reads the series fields the sync needs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json(200, {
        status: 200,
        data: {
          id: 2320,
          title: 'T',
          canonical_url: 'https://mangabaka.org/manga/2320/T',
          status: 'releasing',
          total_chapters: '139',
          final_volume: '32',
          merged_with: null,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new MangabakaSyncClientService();
    expect(await client.series('mb-x', '2320')).toEqual({
      id: '2320',
      title: 'T',
      url: 'https://mangabaka.org/manga/2320/T',
      status: 'releasing',
      totalChapters: 139,
      finalVolume: 32,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.mangabaka.org/v1/series/2320');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('mb-x');
    // Cached for the next sync.
    await client.series('mb-x', '2320');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows a merged series', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, { data: { id: 5, merged_with: 9 } }))
      .mockResolvedValueOnce(json(200, { data: { id: 9, status: 'completed', total_chapters: null, final_volume: 4 } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await new MangabakaSyncClientService().series('t', '5')).toMatchObject({ id: '9', status: 'completed', finalVolume: 4 });
  });

  it('reads an entry, treats 404 as not in the library, and trims dates to the day', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json(200, {
          data: { state: 'reading', progress_chapter: 12, progress_volume: null, start_date: '2026-01-02T00:00:00.000Z', finish_date: null },
        }),
      )
      .mockResolvedValueOnce(json(404, { message: 'Not found' }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new MangabakaSyncClientService();
    expect(await client.entry('t', '1')).toEqual({
      state: 'reading',
      progressChapter: 12,
      progressVolume: null,
      startDate: '2026-01-02',
      finishDate: null,
    });
    expect(await client.entry('t', '1')).toBeNull();
  });

  it('posts a new entry and patches an existing one with JSON bodies', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json(200, { status: 200, data: true })));
    vi.stubGlobal('fetch', fetchMock);
    const client = new MangabakaSyncClientService();
    await client.createEntry('t', '1', { state: 'reading' });
    await client.patchEntry('t', '1', { progress_chapter: 3 });
    expect(fetchMock.mock.calls.map(([url, init]) => [url, (init as RequestInit).method, (init as RequestInit).body])).toEqual([
      ['https://api.mangabaka.org/v1/my/library/1', 'POST', '{"state":"reading"}'],
      ['https://api.mangabaka.org/v1/my/library/1', 'PATCH', '{"progress_chapter":3}'],
    ]);
  });

  it('says plainly when the token is refused', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, { message: 'Unauthorized' })));
    const error = await new MangabakaSyncClientService().checkToken('bad').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MangabakaApiError);
    expect((error as MangabakaApiError).message).toContain('refused the token');
  });

  it('waits and retries once after a 429', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(429, {}, { 'retry-after': '1' }))
      .mockResolvedValueOnce(json(200, { data: { state: 'paused' } }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = new MangabakaSyncClientService().entry('t', '1');
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await pending).toMatchObject({ state: 'paused' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
