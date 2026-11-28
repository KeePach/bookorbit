import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import type { MangabakaSyncSeriesStatus } from '@bookorbit/types'

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>() }))

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), api: apiMock }))

import SeriesMangabakaSync from './SeriesMangabakaSync.vue'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function status(overrides: Partial<MangabakaSyncSeriesStatus> = {}): MangabakaSyncSeriesStatus {
  return { configured: true, enabled: true, selected: false, mangabakaId: '2320', last: null, ...overrides }
}

async function mountLine(body: MangabakaSyncSeriesStatus) {
  apiMock.mockResolvedValue(json(body))
  const wrapper = mount(SeriesMangabakaSync, { props: { seriesId: 7 }, global: { stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()
  return wrapper
}

describe('SeriesMangabakaSync', () => {
  beforeEach(() => {
    apiMock.mockReset()
  })

  it('stays hidden until a MangaBaka token is saved', async () => {
    const wrapper = await mountLine(status({ configured: false }))
    expect(wrapper.find('[data-testid="series-mangabaka-sync"]').exists()).toBe(false)
  })

  it('turns the series on and shows the first result', async () => {
    const wrapper = await mountLine(status())
    expect(wrapper.text()).toContain('#2320')

    apiMock.mockResolvedValue(
      json(
        status({
          selected: true,
          last: {
            outcome: 'created',
            message: 'Added to MangaBaka: Reading, chapter 3.',
            mangabakaId: '2320',
            url: 'https://mangabaka.org/manga/2320/S',
            state: 'reading',
            progressChapter: 3,
            progressVolume: null,
            syncedAt: '2026-11-27T10:00:00.000Z',
          },
        }),
      ),
    )
    await wrapper.find('[data-testid="series-mangabaka-sync-toggle"]').trigger('click')
    await flushPromises()

    const [url, init] = apiMock.mock.calls.at(-1) as [string, RequestInit]
    expect(url).toBe('/api/v1/fork/mangabaka-sync/series/7')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ selected: true })
    expect(wrapper.text()).toContain('Added to MangaBaka: Reading, chapter 3.')
    expect(wrapper.text()).toContain('Sync now')
  })

  it('says when the books have no MangaBaka id yet', async () => {
    const wrapper = await mountLine(status({ mangabakaId: null }))
    expect(wrapper.text()).toContain('No MangaBaka id on these books yet')
  })
})
