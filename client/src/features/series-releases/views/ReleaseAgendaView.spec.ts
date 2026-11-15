import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { SeriesReleasesOverviewResponse } from '@bookorbit/types'

const { apiMock, copyMock } = vi.hoisted(() => ({
  apiMock: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(),
  copyMock: vi.fn<(text: string) => Promise<boolean>>(),
}))

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), api: apiMock }))
vi.mock('@/lib/clipboard', () => ({ copyToClipboard: copyMock }))

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
        releases: [
          { id: 1, volume: '6', releaseDate: '2026-12-19', storeUrl: 'https://store.example/6', note: 'Pre-order' },
          { id: 2, volume: '7', releaseDate: '2027-01-10', storeUrl: null, note: null },
        ],
      },
      {
        seriesId: 5,
        name: 'Waiting Series',
        finished: false,
        checkedAt: '2026-01-01',
        releases: [{ id: 4, volume: '2', releaseDate: null, storeUrl: null, note: null }],
      },
    ],
  }
}

function route(body: SeriesReleasesOverviewResponse) {
  apiMock.mockImplementation((input) =>
    Promise.resolve(String(input).endsWith('/overview') ? json(body) : json({ path: '/api/v1/series-releases/calendar.ics?token=7.abc' })),
  )
}

async function mountView(body: SeriesReleasesOverviewResponse = overview()) {
  route(body)
  const wrapper = mount(ReleaseAgendaView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
  await flushPromises()
  return wrapper
}

describe('ReleaseAgendaView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 15, 12))
    apiMock.mockReset()
    copyMock.mockReset()
    resetReleaseOverviewForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('groups the dated volumes by month, in order', async () => {
    const wrapper = await mountView()

    const headings = wrapper.findAll('h2').map((heading) => heading.text())
    expect(headings).toEqual(['December 2026', 'January 2027', 'Waiting for a date'])
    expect(wrapper.text()).toContain('Aki Sora')
    expect(wrapper.text()).toContain('Pre-order')
    expect(wrapper.find('a[href="https://store.example/6"]').attributes('rel')).toContain('noopener')
  })

  it('lists series still waiting on an announcement and flags an overdue check', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Waiting Series')
    expect(wrapper.text()).toContain('Check')
  })

  it('offers the calendar link and copies it as an absolute address', async () => {
    copyMock.mockResolvedValue(true)
    const wrapper = await mountView()

    const download = wrapper.find('a[download]')
    expect(download.attributes('href')).toContain('/api/v1/series-releases/calendar.ics?token=')

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Copy calendar link'))!
      .trigger('click')
    await flushPromises()

    expect(copyMock).toHaveBeenCalledWith(expect.stringMatching(/^http.+\/api\/v1\/series-releases\/calendar\.ics\?token=/))
  })

  it('explains itself when nothing is tracked', async () => {
    const wrapper = await mountView({ series: [] })

    expect(wrapper.text()).toContain('No upcoming volumes yet')
  })
})
