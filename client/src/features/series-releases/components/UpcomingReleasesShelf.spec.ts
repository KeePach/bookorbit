import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { SeriesReleasesOverviewResponse } from '@bookorbit/types'

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>() }))

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), api: apiMock }))

import { resetReleaseOverviewForTests } from '../composables/useReleaseOverview'
import UpcomingReleasesShelf from './UpcomingReleasesShelf.vue'

const NOW = new Date(2026, 10, 15, 12)

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const OVERVIEW: SeriesReleasesOverviewResponse = {
  series: [
    {
      seriesId: 3,
      name: 'Aki Sora',
      finished: false,
      checkedAt: '2026-11-10',
      coverBookId: 30,
      releases: [
        { id: 1, volume: '6', releaseDate: '2026-12-19', storeUrl: null, note: null, coverVersion: 5 },
        { id: 2, volume: '7', releaseDate: null, storeUrl: null, note: null },
      ],
    },
    {
      seriesId: 4,
      name: 'Out Now',
      finished: false,
      checkedAt: '2026-11-10',
      coverBookId: 40,
      releases: [{ id: 3, volume: '2', releaseDate: '2026-11-15', storeUrl: null, note: null }],
    },
    { seriesId: 5, name: 'Animan', finished: false, checkedAt: '2026-09-01', releases: [] },
    { seriesId: 6, name: 'Quiet', finished: false, checkedAt: '2026-11-10', releases: [] },
  ],
}

async function mountShelf(body: SeriesReleasesOverviewResponse, props: { limit?: number; rows?: number } = {}) {
  apiMock.mockResolvedValue(json(body))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/releases', name: 'series-releases', component: { template: '<div />' } },
      { path: '/series/:seriesId', name: 'series-detail', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(UpcomingReleasesShelf, { props: { title: 'Upcoming Volumes', now: NOW, ...props }, global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

function cardNames(wrapper: Awaited<ReturnType<typeof mountShelf>>): string[] {
  return wrapper.findAll('[data-testid="upcoming-card"]').map((card) => card.find('p').text())
}

describe('UpcomingReleasesShelf', () => {
  beforeEach(() => {
    apiMock.mockReset()
    resetReleaseOverviewForTests()
  })

  it('lists announced volumes nearest first, then the series whose check is due', async () => {
    const wrapper = await mountShelf(OVERVIEW)

    expect(wrapper.find('h2').text()).toBe('Upcoming Volumes')
    // Undated volumes and series that were checked recently stay on the Upcoming page.
    expect(cardNames(wrapper)).toEqual(['Out Now', 'Aki Sora', 'Animan'])
    expect(wrapper.find('[data-testid="upcoming-releases-shelf"] span.rounded-full').text()).toBe('2')
    expect(wrapper.text()).toContain('See all')
  })

  it('caps the cards at the shelf limit', async () => {
    const wrapper = await mountShelf(OVERVIEW, { limit: 2, rows: 1 })

    expect(cardNames(wrapper)).toEqual(['Out Now', 'Aki Sora'])
  })

  it('says so when nothing is announced', async () => {
    const wrapper = await mountShelf({ series: [] })

    expect(wrapper.text()).toContain('Nothing announced yet.')
  })
})
