import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { SeriesLicensingOverview } from '@bookorbit/types'

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>() }))

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), api: apiMock }))

vi.mock('@/features/library/composables/useLibraries', async () => {
  const { ref } = await import('vue')
  return {
    useLibraries: () => ({
      libraries: ref([
        { id: 1, name: 'Comics' },
        { id: 2, name: 'Downloaded Manga' },
      ]),
      fetchLibraries: vi.fn<() => Promise<void>>(),
    }),
  }
})

import SeriesLicensingCard from './SeriesLicensingCard.vue'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function overview(
  overrides: Partial<SeriesLicensingOverview['settings']> = {},
  status: Partial<SeriesLicensingOverview['status']> = {},
): SeriesLicensingOverview {
  return {
    settings: { libraryIds: [2], ...overrides },
    status: {
      running: false,
      progressLines: null,
      lastRunAt: '2026-11-01T08:00:00.000Z',
      lastRunSeries: 120,
      lastRunLicensed: 45,
      lastRunError: null,
      ...status,
    },
  }
}

async function mountCard(body: SeriesLicensingOverview = overview()) {
  apiMock.mockResolvedValue(json(body))
  const wrapper = mount(SeriesLicensingCard)
  await flushPromises()
  return wrapper
}

describe('SeriesLicensingCard', () => {
  beforeEach(() => {
    apiMock.mockReset()
  })

  it('shows the libraries, the picked ones checked, and the last run', async () => {
    const wrapper = await mountCard()

    expect(apiMock).toHaveBeenCalledWith('/api/v1/series-releases/licensing', undefined)
    const boxes = wrapper.findAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    expect((boxes[0].element as HTMLInputElement).checked).toBe(false)
    expect((boxes[1].element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.text()).toContain('120 of your series, 45 licensed')
    expect(wrapper.text()).toContain('MangaBaka')
  })

  it('saves a changed library selection', async () => {
    const wrapper = await mountCard()
    await wrapper.findAll('input[type="checkbox"]')[0].setValue(true)

    const save = wrapper.findAll('button').find((button) => button.text().includes('Save libraries'))
    expect(save).toBeDefined()
    apiMock.mockResolvedValue(json(overview({ libraryIds: [1, 2] })))
    await save!.trigger('click')
    await flushPromises()

    const patch = apiMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
    expect(patch?.[0]).toBe('/api/v1/series-releases/licensing')
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ libraryIds: expect.arrayContaining([1, 2]) })
  })

  it('starts a run and shows it working', async () => {
    const wrapper = await mountCard()
    apiMock.mockImplementation((input, init) =>
      Promise.resolve(init?.method === 'POST' ? json({ started: true }) : json(overview({}, { running: true, progressLines: 50000 }))),
    )

    const run = wrapper.findAll('button').find((button) => button.text().includes('Check licensing now'))
    await run!.trigger('click')
    await flushPromises()

    const post = apiMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(post?.[0]).toBe('/api/v1/series-releases/licensing/run')
    expect(wrapper.text()).toContain('50000 read')
  })
})
