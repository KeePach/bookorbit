import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { SeriesReleasesOverviewResponse } from '@bookorbit/types'

const { apiMock, copyMock } = vi.hoisted(() => ({
  apiMock: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(),
  copyMock: vi.fn<(text: string) => Promise<boolean>>(),
}))

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), api: apiMock }))
vi.mock('@/lib/clipboard', () => ({ copyToClipboard: copyMock }))
vi.mock('@/features/library/composables/useLibraries', async () => {
  const { ref } = await import('vue')
  return {
    useLibraries: () => ({
      libraries: ref([
        { id: 1, name: 'Manga' },
        { id: 2, name: 'Comics' },
      ]),
      fetchLibraries: vi.fn<() => Promise<void>>(),
    }),
  }
})

import { resetReleaseOverviewForTests } from '../composables/useReleaseOverview'
import ReleaseAgendaView from './ReleaseAgendaView.vue'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function overview(): SeriesReleasesOverviewResponse {
  return {
    series: [
      {
        seriesId: 3,
        name: 'Aki Sora',
        finished: false,
        checkedAt: '2026-11-10',
        libraryIds: [1],
        licensed: true,
        coverBookId: 30,
        releases: [
          { id: 1, volume: '6', releaseDate: '2026-12-19', storeUrl: 'https://store.example/6', note: 'Pre-order', coverVersion: 77 },
          { id: 2, volume: '7', releaseDate: '2027-01-10', storeUrl: null, note: null, coverVersion: null },
        ],
      },
      {
        seriesId: 5,
        name: 'Waiting Series',
        finished: false,
        checkedAt: '2026-01-01',
        libraryIds: [2],
        licensed: false,
        coverBookId: null,
        releases: [{ id: 4, volume: '2', releaseDate: null, storeUrl: null, note: null }],
      },
    ],
  }
}

function route(body: SeriesReleasesOverviewResponse) {
  apiMock.mockImplementation((input) => {
    const url = String(input)
    if (url.endsWith('/overview')) return Promise.resolve(json(body))
    if (url.includes('/licensing'))
      return Promise.resolve(
        json({
          settings: { libraryIds: [] },
          status: { running: false, progressLines: null, lastRunAt: null, lastRunSeries: null, lastRunLicensed: null, lastRunError: null },
        }),
      )
    return Promise.resolve(json({ path: '/api/v1/series-releases/calendar.ics?token=7.abc' }))
  })
}

async function mountView(body: SeriesReleasesOverviewResponse = overview(), query: Record<string, string> = {}) {
  route(body)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/releases', name: 'series-releases', component: ReleaseAgendaView },
      { path: '/series/:seriesId', name: 'series-detail', component: { template: '<div />' } },
    ],
  })
  await router.push({ path: '/releases', query })
  await router.isReady()
  const wrapper = mount(ReleaseAgendaView, {
    global: {
      plugins: [router],
      stubs: {
        BrowseHeader: { template: '<div><slot name="actions" /><slot name="bar" /></div>' },
        BrowseInlineGroup: { template: '<div><slot /></div>' },
        BrowseSortControl: { template: '<div><slot /></div>' },
        BrowseViewControls: { template: '<div />' },
        BrowseLibraryPicker: { template: '<div data-testid="library-picker" />' },
      },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

function cardNames(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']): string[] {
  return wrapper.findAll('[data-testid="upcoming-card"]').map((card) => card.find('p').text())
}

describe('ReleaseAgendaView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 15, 12))
    apiMock.mockReset()
    copyMock.mockReset()
    resetReleaseOverviewForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a cover card per volume, grouped by month with the undated last', async () => {
    const { wrapper } = await mountView()

    // Each group heading is its label then its count; read the label alone.
    const headings = wrapper.findAll('[data-testid^="upcoming-group-"] h2').map((heading) => heading.find('span').text())
    expect(headings).toEqual(['December 2026', 'January 2027', 'Waiting for a date'])
    expect(cardNames(wrapper)).toEqual(['Aki Sora', 'Aki Sora', 'Waiting Series'])

    const images = wrapper.findAll('[data-testid="upcoming-card"] img').map((img) => img.attributes('src'))
    expect(images[0]).toBe('/api/v1/series-releases/1/cover?v=77')
    expect(images[1]).toContain('/api/v1/books/30/thumbnail')
    expect(wrapper.text()).toContain('Next: 7')
  })

  it('narrows to a status tab and writes it into the address', async () => {
    const { wrapper, router } = await mountView()

    const check = wrapper.findAll('[role="tab"]').find((tab) => tab.text().startsWith('Check due'))!
    expect(check.text()).toContain('1')
    await check.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({ state: 'check' })
    expect(cardNames(wrapper)).toEqual(['Waiting Series'])
  })

  it('reads its filters back from the address', async () => {
    const { wrapper } = await mountView(overview(), { licensed: 'yes', view: 'list' })

    expect(wrapper.findAll('[data-testid="upcoming-card"]')).toHaveLength(0)
    const rows = wrapper.findAll('[data-testid="upcoming-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('Pre-order')
    expect(wrapper.find('a[href="https://store.example/6"]').attributes('rel')).toContain('noopener')
  })

  it('offers to clear filters that match nothing', async () => {
    const { wrapper, router } = await mountView(overview(), { q: 'zzz' })

    expect(wrapper.text()).toContain('Nothing upcoming matches these filters.')
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Clear filters'))!
      .trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({})
    expect(cardNames(wrapper)).toHaveLength(3)
  })

  it('lists a tracked series with nothing listed yet, but not a finished one', async () => {
    const body = overview()
    body.series.push(
      {
        seriesId: 8,
        name: 'Auto Tracked',
        finished: false,
        checkedAt: '2026-11-15',
        releases: [],
        libraryIds: [1],
        licensed: true,
        coverBookId: null,
      },
      { seriesId: 9, name: 'All Done', finished: true, checkedAt: '2026-11-15', releases: [], libraryIds: [1], licensed: null, coverBookId: null },
    )
    const { wrapper } = await mountView(body)

    expect(cardNames(wrapper)).toContain('Auto Tracked')
    expect(wrapper.text()).toContain('No volume listed yet')
    expect(wrapper.text()).not.toContain('All Done')
  })

  it('offers the calendar link and copies it as an absolute address', async () => {
    copyMock.mockResolvedValue(true)
    const { wrapper } = await mountView()

    const download = wrapper.find('a[download]')
    expect(download.attributes('href')).toContain('/api/v1/series-releases/calendar.ics?token=')

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Copy calendar link'))!
      .trigger('click')
    await flushPromises()
    expect(copyMock).toHaveBeenCalledWith(expect.stringMatching(/^http.*\/api\/v1\/series-releases\/calendar\.ics\?token=7\.abc$/))
  })

  it('explains itself when nothing is tracked', async () => {
    const { wrapper } = await mountView({ series: [] })

    expect(wrapper.text()).toContain('No upcoming volumes yet')
  })
})
