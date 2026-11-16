import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { SeriesReleasesOverviewResponse } from '@bookorbit/types'

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>() }))

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), api: apiMock }))

import { resetReleaseOverviewForTests } from '../composables/useReleaseOverview'
import UpcomingReleasesWidget from './UpcomingReleasesWidget.vue'

const NOW = new Date(2026, 10, 15, 12)

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

async function mountWidget(body: SeriesReleasesOverviewResponse, limit = 4) {
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
  const wrapper = mount(UpcomingReleasesWidget, { props: { now: NOW, limit }, global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('UpcomingReleasesWidget', () => {
  beforeEach(() => {
    apiMock.mockReset()
    resetReleaseOverviewForTests()
  })

  it('shows the nearest dated volumes, cover first, and counts the series waiting on a date', async () => {
    const wrapper = await mountWidget(
      {
        series: [
          {
            seriesId: 3,
            name: 'Aki Sora',
            finished: false,
            checkedAt: '2026-11-10',
            coverBookId: 30,
            releases: [
              { id: 1, volume: '6', releaseDate: '2026-12-19', storeUrl: null, note: null, coverVersion: 5 },
              { id: 2, volume: '7', releaseDate: '2027-02-01', storeUrl: null, note: null },
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
          { seriesId: 5, name: 'Animan', finished: false, checkedAt: '2026-11-10', releases: [] },
        ],
      },
      2,
    )

    const items = wrapper.findAll('[data-testid="upcoming-widget-item"]')
    expect(items.map((item) => item.find('p').text())).toEqual(['Out Now', 'Aki Sora'])
    expect(items[0].text()).toContain('Today')
    expect(items[0].find('img').attributes('src')).toContain('/api/v1/books/40/thumbnail')
    expect(items[1].find('img').attributes('src')).toBe('/api/v1/series-releases/1/cover?v=5')
    expect(wrapper.text()).toContain('1 series waiting for a date')
    expect(wrapper.text()).toContain('See all')
  })

  it('says so when nothing is announced', async () => {
    const wrapper = await mountWidget({ series: [] })

    expect(wrapper.text()).toContain('Nothing announced yet.')
  })
})
