import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { SeriesReleasesOverviewResponse } from '@bookorbit/types'

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>() }))

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), api: apiMock }))

import { RELEASE_COLORS_STORAGE_KEY, reloadReleaseColors, useReleaseColors } from '../composables/useReleaseColors'
import { resetReleaseOverviewForTests } from '../composables/useReleaseOverview'
import SeriesReleaseFrame from './SeriesReleaseFrame.vue'

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

async function mountFrame(body: SeriesReleasesOverviewResponse, seriesId = 3) {
  apiMock.mockResolvedValue(json(body))
  const wrapper = mount(SeriesReleaseFrame, { props: { seriesId, now: NOW } })
  await flushPromises()
  return wrapper
}

describe('SeriesReleaseFrame', () => {
  beforeEach(() => {
    apiMock.mockReset()
    resetReleaseOverviewForTests()
    localStorage.removeItem(RELEASE_COLORS_STORAGE_KEY)
    reloadReleaseColors()
  })

  it('colors the frame by how close the nearest volume is', async () => {
    expect((await mountFrame(overview('2026-11-14'))).find('[data-testid="series-release-frame"]').classes()).toContain('border-emerald-400')
    resetReleaseOverviewForTests()
    expect((await mountFrame(overview('2026-11-20'))).find('[data-testid="series-release-frame"]').classes()).toContain('border-amber-400')
    resetReleaseOverviewForTests()
    expect((await mountFrame(overview('2026-11-01'))).find('[data-testid="series-release-frame"]').classes()).toContain('border-red-500')
    resetReleaseOverviewForTests()
    expect((await mountFrame(overview('2026-12-19'))).find('[data-testid="series-release-frame"]').classes()).toContain('border-sky-400')
  })

  it('goes dashed when no date is known, amber when a check is due', async () => {
    const fresh = await mountFrame(overview(null, '2026-11-12'))
    expect(fresh.find<HTMLElement>('[data-testid="series-release-frame"]').element.style.borderStyle).toBe('dashed')
    expect(fresh.find('[data-testid="series-release-frame"]').classes()).not.toContain('border-amber-400')
    resetReleaseOverviewForTests()
    const stale = await mountFrame(overview(null, '2026-09-01'))
    expect(stale.find<HTMLElement>('[data-testid="series-release-frame"]').element.style.borderStyle).toBe('dashed')
    expect(stale.find('[data-testid="series-release-frame"]').classes()).toContain('border-amber-400')
  })

  it('wears a picked color and line style instead of the default', async () => {
    useReleaseColors().setLook('soon', { color: '#ff00aa', dashed: true })
    const frame = (await mountFrame(overview('2026-11-20'))).find<HTMLElement>('[data-testid="series-release-frame"]')
    expect(frame.classes()).not.toContain('border-amber-400')
    expect(frame.element.style.borderColor).toBe('rgb(255, 0, 170)')
    expect(frame.element.style.borderStyle).toBe('dashed')
    expect(JSON.parse(localStorage.getItem(RELEASE_COLORS_STORAGE_KEY) ?? '{}').soon).toEqual({ color: '#ff00aa', dashed: true, visible: true })
  })

  it('hides a status switched off, and shows a finished series once switched on', async () => {
    useReleaseColors().setLook('soon', { visible: false })
    expect((await mountFrame(overview('2026-11-20'))).find('[data-testid="series-release-frame"]').exists()).toBe(false)

    resetReleaseOverviewForTests()
    const finished: SeriesReleasesOverviewResponse = {
      series: [{ seriesId: 3, name: 'Aki Sora', finished: true, checkedAt: '2026-11-10', releases: [] }],
    }
    expect((await mountFrame(finished)).find('[data-testid="series-release-frame"]').exists()).toBe(false)
    resetReleaseOverviewForTests()
    useReleaseColors().setLook('finished', { visible: true })
    expect((await mountFrame(finished)).find('[data-testid="series-release-frame"]').classes()).toContain('border-violet-400')
  })

  it('renders nothing for an untracked series', async () => {
    const wrapper = await mountFrame(overview('2026-11-20'), 999)
    expect(wrapper.find('[data-testid="series-release-frame"]').exists()).toBe(false)
  })
})
