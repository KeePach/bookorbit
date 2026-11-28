import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import type { MangabakaSyncSettings } from '@bookorbit/types'

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>() }))

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), api: apiMock }))

import MangabakaSyncCard from './MangabakaSyncCard.vue'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function settings(overrides: Partial<MangabakaSyncSettings> = {}): MangabakaSyncSettings {
  return { configured: true, tokenHint: 'abcd', enabled: true, running: false, series: [], ...overrides }
}

async function mountCard(body: MangabakaSyncSettings) {
  apiMock.mockResolvedValue(json(body))
  const wrapper = mount(MangabakaSyncCard, { global: { stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()
  return wrapper
}

describe('MangabakaSyncCard', () => {
  beforeEach(() => {
    apiMock.mockReset()
  })

  it('asks for a token until one is saved, and sends it to the server', async () => {
    const wrapper = await mountCard(settings({ configured: false, tokenHint: null, enabled: false }))
    expect(wrapper.find('[data-testid="mangabaka-token-form"]').exists()).toBe(true)

    apiMock.mockResolvedValue(json(settings()))
    await wrapper.find('input[type="password"]').setValue(' mb-new-token ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const [url, init] = apiMock.mock.calls.at(-1) as [string, RequestInit]
    expect(url).toBe('/api/v1/fork/mangabaka-sync/settings')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ apiToken: 'mb-new-token' })
    expect(wrapper.find('[data-testid="mangabaka-token-form"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Token saved (…abcd)')
  })

  it('lists the synced series with what their last sync did', async () => {
    const wrapper = await mountCard(
      settings({
        series: [
          {
            seriesId: 4,
            seriesName: 'Solo Leveling',
            last: {
              outcome: 'updated',
              message: 'Updated on MangaBaka: chapter 12.',
              mangabakaId: '10',
              url: 'https://mangabaka.org/manga/10/S',
              state: 'reading',
              progressChapter: 12,
              progressVolume: null,
              syncedAt: '2026-11-27T10:00:00.000Z',
            },
          },
          { seriesId: 5, seriesName: 'Berserk', last: null },
        ],
      }),
    )
    const list = wrapper.find('[data-testid="mangabaka-sync-series"]')
    expect(list.text()).toContain('Solo Leveling')
    expect(list.text()).toContain('Updated on MangaBaka: chapter 12.')
    expect(list.text()).toContain('Berserk')
    expect(list.text()).toContain('Not synced yet.')
  })

  it('starts a sync of every series', async () => {
    const wrapper = await mountCard(settings({ series: [{ seriesId: 4, seriesName: 'S', last: null }] }))
    apiMock
      .mockResolvedValueOnce(json({ started: true }))
      .mockResolvedValue(json(settings({ series: [{ seriesId: 4, seriesName: 'S', last: null }] })))
    await wrapper.find('[data-testid="mangabaka-sync-all"]').trigger('click')
    await flushPromises()
    expect(apiMock.mock.calls.some(([url, init]) => url === '/api/v1/fork/mangabaka-sync/sync-all' && init?.method === 'POST')).toBe(true)
  })
})
