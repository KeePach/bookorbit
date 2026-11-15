import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { SeriesReleasesOverviewResponse } from '@bookorbit/types'

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>() }))

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), api: apiMock }))

import { resetReleaseOverviewForTests } from '../composables/useReleaseOverview'
import SeriesReleaseBadge from './SeriesReleaseBadge.vue'

const NOW = new Date(2026, 10, 14, 12)

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function overview(releaseDate: string | null, checkedAt = '2026-11-10'): SeriesReleasesOverviewResponse {
  return {
    series: [
      { seriesId: 3, name: 'Aki Sora', finished: false, checkedAt, releases: [{ id: 1, volume: '6', releaseDate, storeUrl: null, note: null }] },
    ],
  }
}

async function mountBadge(body: SeriesReleasesOverviewResponse, seriesId = 3) {
  apiMock.mockResolvedValue(json(body))
  const wrapper = mount(SeriesReleaseBadge, { props: { seriesId, now: NOW } })
  await flushPromises()
  return wrapper
}

describe('SeriesReleaseBadge', () => {
  beforeEach(() => {
    apiMock.mockReset()
    resetReleaseOverviewForTests()
  })

  it('shows how close the nearest volume is', async () => {
    expect((await mountBadge(overview('2026-11-14'))).text()).toContain('Today')
    resetReleaseOverviewForTests()
    expect((await mountBadge(overview('2026-11-20'))).text()).toContain('6d')
    resetReleaseOverviewForTests()
    expect((await mountBadge(overview('2026-11-01'))).text()).toContain('Out')
    resetReleaseOverviewForTests()
    expect((await mountBadge(overview('2026-12-19'))).text()).toContain('Dec 19')
  })

  it('asks for a check when no date is known and the last look is old', async () => {
    expect((await mountBadge(overview(null, '2026-01-01'))).text()).toContain('Check')
    resetReleaseOverviewForTests()
    expect((await mountBadge(overview(null, '2026-11-10'))).text()).toContain('No date')
  })

  it('renders nothing for a series that is not tracked', async () => {
    const wrapper = await mountBadge(overview('2026-12-19'), 999)

    expect(wrapper.find('[data-testid="series-release-badge"]').exists()).toBe(false)
  })

  it('asks the server once for a whole page of badges', async () => {
    apiMock.mockResolvedValue(json(overview('2026-12-19')))
    mount(SeriesReleaseBadge, { props: { seriesId: 3, now: NOW } })
    mount(SeriesReleaseBadge, { props: { seriesId: 4, now: NOW } })
    mount(SeriesReleaseBadge, { props: { seriesId: 5, now: NOW } })
    await flushPromises()

    expect(apiMock).toHaveBeenCalledTimes(1)
  })
})
