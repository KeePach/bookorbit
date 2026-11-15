import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SeriesReleasesOverviewResponse } from '@bookorbit/types'

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>() }))

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), api: apiMock }))

import { resetReleaseOverviewForTests, useReleaseOverview } from './useReleaseOverview'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function response(): SeriesReleasesOverviewResponse {
  return {
    series: [
      {
        seriesId: 3,
        name: 'Aki Sora',
        finished: false,
        checkedAt: '2026-11-10',
        releases: [{ id: 1, volume: '6', releaseDate: '2026-12-19', storeUrl: null, note: null }],
      },
    ],
  }
}

describe('useReleaseOverview', () => {
  beforeEach(() => {
    apiMock.mockReset()
    resetReleaseOverviewForTests()
  })

  it('answers a page full of badges with one request', async () => {
    apiMock.mockResolvedValue(json(response()))
    const { ensure, bySeries } = useReleaseOverview()

    await Promise.all([ensure(), ensure(), useReleaseOverview().ensure()])
    await ensure()

    expect(apiMock).toHaveBeenCalledTimes(1)
    expect(apiMock).toHaveBeenCalledWith('/api/v1/series-releases/overview', undefined)
    expect(bySeries.value.get(3)?.name).toBe('Aki Sora')
    expect(bySeries.value.get(99)).toBeUndefined()
  })

  it('shows no badges and does not hammer the server when the load fails', async () => {
    apiMock.mockResolvedValue(json({ message: 'nope' }, 500))
    const { ensure, failed, bySeries } = useReleaseOverview()

    await ensure()

    expect(failed.value).toBe(true)
    expect(bySeries.value.size).toBe(0)
  })

  it('refresh forgets the cache and asks again', async () => {
    apiMock.mockResolvedValue(json(response()))
    const { ensure, refresh } = useReleaseOverview()
    await ensure()

    await refresh()

    expect(apiMock).toHaveBeenCalledTimes(2)
  })
})
