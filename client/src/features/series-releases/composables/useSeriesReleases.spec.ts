import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { SeriesRelease, SeriesReleasesResponse } from '@bookorbit/types'

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>() }))

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), api: apiMock }))

import { useSeriesReleases } from './useSeriesReleases'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function release(overrides: Partial<SeriesRelease> = {}): SeriesRelease {
  return {
    id: 1,
    seriesId: 3,
    volume: '6',
    releaseDate: '2026-12-19',
    storeUrl: null,
    note: null,
    cover: null,
    status: 'upcoming',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  }
}

function response(overrides: Partial<SeriesReleasesResponse> = {}): SeriesReleasesResponse {
  return {
    tracking: { seriesId: 3, tracking: true, finished: false, checkedAt: null },
    releases: [release()],
    canEdit: true,
    license: null,
    ...overrides,
  }
}

function lastRequest(): { url: string; init: RequestInit | undefined } {
  const call = apiMock.mock.calls.at(-1) as [string, RequestInit | undefined]
  return { url: call[0], init: call[1] }
}

describe('useSeriesReleases', () => {
  beforeEach(() => {
    apiMock.mockReset()
  })

  it('loads the upcoming volumes of the open series', async () => {
    apiMock.mockResolvedValueOnce(json(response()))
    const { data, load } = useSeriesReleases(() => 3)

    await load()

    expect(lastRequest().url).toBe('/api/v1/series/3/releases')
    expect(data.value?.releases).toHaveLength(1)
    expect(data.value?.canEdit).toBe(true)
  })

  it('keeps the message and shows nothing when the load fails', async () => {
    apiMock.mockResolvedValueOnce(json({ message: 'nope' }, 500))
    const { data, error, load } = useSeriesReleases(() => 3)

    await load()

    expect(data.value).toBeNull()
    expect(error.value).toBeTruthy()
  })

  it('adds a volume and reloads', async () => {
    const { add, data } = useSeriesReleases(() => 3)
    apiMock
      .mockResolvedValueOnce(json(release({ id: 2, volume: '7' }), 201))
      .mockResolvedValueOnce(json(response({ releases: [release(), release({ id: 2, volume: '7' })] })))

    await add({ volume: '7', releaseDate: null })

    const calls = apiMock.mock.calls as [string, RequestInit | undefined][]
    expect(calls[0][0]).toBe('/api/v1/series/3/releases')
    expect(calls[0][1]?.method).toBe('POST')
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ volume: '7', releaseDate: null })
    expect(calls[1][0]).toBe('/api/v1/series/3/releases')
    expect(data.value?.releases).toHaveLength(2)
  })

  it('throws a failed change and does not reload', async () => {
    const { add, saving } = useSeriesReleases(() => 3)
    apiMock.mockResolvedValueOnce(json({ message: 'duplicate' }, 409))

    await expect(add({ volume: '6' })).rejects.toMatchObject({ status: 409 })

    expect(apiMock).toHaveBeenCalledTimes(1)
    expect(saving.value).toBe(false)
  })

  it('updates, collects, removes and changes tracking on the right routes', async () => {
    const { update, collect, remove, updateTracking } = useSeriesReleases(() => 3)
    apiMock.mockImplementation((input) =>
      Promise.resolve(
        String(input).endsWith('/releases')
          ? json(response())
          : String(input).includes('/collect')
            ? json({ collected: release(), next: null })
            : json({}),
      ),
    )

    await update(1, { releaseDate: '2027-01-10' })
    expect(apiMock.mock.calls.find(([url, init]) => url === '/api/v1/series/3/releases/1' && init?.method === 'PATCH')).toBeDefined()

    await collect(1)
    expect(apiMock.mock.calls.find(([url, init]) => url === '/api/v1/series/3/releases/1/collect' && init?.method === 'POST')).toBeDefined()

    apiMock.mockImplementation((input, init) =>
      Promise.resolve(
        init?.method === 'DELETE' ? new Response(null, { status: 204 }) : String(input).endsWith('/releases') ? json(response()) : json({}),
      ),
    )
    await remove(1)
    expect(apiMock.mock.calls.find(([url, init]) => url === '/api/v1/series/3/releases/1' && init?.method === 'DELETE')).toBeDefined()

    await updateTracking({ finished: true })
    expect(apiMock.mock.calls.find(([url, init]) => url === '/api/v1/series/3/release-tracking' && init?.method === 'PATCH')).toBeDefined()
  })

  it('posts a backup to the import route', async () => {
    const { importBackup } = useSeriesReleases(() => 3)
    apiMock.mockImplementation((input) => Promise.resolve(String(input).endsWith('/import') ? json({ imported: 2, skipped: [] }) : json(response())))

    const result = await importBackup([{ sid: 3, volume: '6' }])

    expect(result.imported).toBe(2)
    expect(apiMock.mock.calls.find(([url]) => url === '/api/v1/series-releases/import')).toBeDefined()
  })

  it('forgets the previous series when the open one changes', async () => {
    const seriesId = ref<number | null>(3)
    const { data, load } = useSeriesReleases(seriesId)
    apiMock.mockResolvedValueOnce(json(response()))
    await load()
    expect(data.value).not.toBeNull()

    seriesId.value = 9
    apiMock.mockResolvedValueOnce(json(response({ tracking: { seriesId: 9, tracking: false, finished: false, checkedAt: null }, releases: [] })))
    const pending = load()
    expect(data.value).toBeNull()
    await pending

    expect(lastRequest().url).toBe('/api/v1/series/9/releases')
    expect(data.value?.tracking.seriesId).toBe(9)
  })
})
