import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { SeriesRelease, SeriesReleasesResponse } from '@bookorbit/types'

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>() }))

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), api: apiMock }))

import SeriesUpcomingSection from './SeriesUpcomingSection.vue'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function release(overrides: Partial<SeriesRelease> = {}): SeriesRelease {
  return {
    id: 1,
    seriesId: 3,
    volume: 'Vol. 6',
    releaseDate: '2026-12-19',
    storeUrl: null,
    note: null,
    cover: null,
    status: 'upcoming',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  }
}

function response(overrides: Partial<SeriesReleasesResponse> = {}): SeriesReleasesResponse {
  return {
    tracking: { seriesId: 3, tracking: true, finished: false, checkedAt: '2026-11-10' },
    releases: [release()],
    canEdit: true,
    license: null,
    ...overrides,
  }
}

async function mountSection(body: SeriesReleasesResponse) {
  apiMock.mockResolvedValue(json(body))
  const wrapper = mount(SeriesUpcomingSection, { props: { seriesId: 3 }, attachTo: document.body, global: { stubs: { RouterLink: true } } })
  await flushPromises()
  return wrapper
}

describe('SeriesUpcomingSection', () => {
  beforeEach(() => {
    apiMock.mockReset()
    document.body.innerHTML = ''
  })

  it('lists the upcoming volumes of a followed series', async () => {
    const wrapper = await mountSection(response({ releases: [release(), release({ id: 2, volume: 'Vol. 7', releaseDate: null })] }))

    expect(apiMock).toHaveBeenCalledWith('/api/v1/series/3/releases', undefined)
    expect(wrapper.findAll('[data-testid="series-release-card"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Upcoming volumes')
    expect(wrapper.text()).toContain('Vol. 7')
  })

  it('shows the licensing verdict with its publishers', async () => {
    const wrapper = await mountSection(
      response({
        license: {
          licensed: true,
          mangabakaId: '77',
          matchedBy: 'id',
          publishers: 'Seven Seas',
          override: null,
          checkedAt: '2026-11-10T00:00:00.000Z',
        },
      }),
    )

    const line = wrapper.find('[data-testid="series-license-line"]')
    expect(line.exists()).toBe(true)
    expect(line.text()).toContain('Licensed — Seven Seas')
    expect(line.find('select').element.value).toBe('')
  })

  it('lets the override win over the MangaBaka verdict', async () => {
    const wrapper = await mountSection(
      response({
        license: { licensed: true, mangabakaId: '77', matchedBy: 'id', publishers: null, override: 'never', checkedAt: '2026-11-10T00:00:00.000Z' },
      }),
    )

    const line = wrapper.find('[data-testid="series-license-line"]')
    expect(line.text()).toContain('Not licensed')
    expect(line.find('select').element.value).toBe('never')
  })

  it('shows nothing to a reader when the series is not followed', async () => {
    const wrapper = await mountSection(
      response({ tracking: { seriesId: 3, tracking: false, finished: false, checkedAt: null }, releases: [], canEdit: false }),
    )

    expect(wrapper.find('[data-testid="series-upcoming"]').exists()).toBe(false)
  })

  it('lets an editor start following an untracked series', async () => {
    const wrapper = await mountSection(response({ tracking: { seriesId: 3, tracking: false, finished: false, checkedAt: null }, releases: [] }))

    expect(wrapper.text()).toContain('Track upcoming volumes')
    expect(wrapper.text()).not.toContain('Checked today')
  })

  it('offers no editing controls to a reader of a followed series', async () => {
    const wrapper = await mountSection(response({ canEdit: false }))

    expect(wrapper.findAll('[data-testid="series-release-card"]')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Add volume')
    expect(wrapper.find('[data-testid="series-releases-backup"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label]').exists()).toBe(false)
  })

  it('reminds when a volume has no date and nobody has looked for a while', async () => {
    const wrapper = await mountSection(
      response({ tracking: { seriesId: 3, tracking: true, finished: false, checkedAt: '2026-01-02' }, releases: [release({ releaseDate: null })] }),
    )

    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })

  it('says so when the series is finished and nothing is listed', async () => {
    const wrapper = await mountSection(response({ tracking: { seriesId: 3, tracking: true, finished: true, checkedAt: null }, releases: [] }))

    expect(wrapper.text()).toContain('No more volumes are expected')
  })

  it('marks the series as checked today', async () => {
    const wrapper = await mountSection(response())
    apiMock.mockImplementation((_input, init) =>
      Promise.resolve(init?.method === 'PATCH' ? json({ seriesId: 3, tracking: true, finished: false, checkedAt: '2026-11-14' }) : json(response())),
    )

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Checked today'))!
      .trigger('click')
    await flushPromises()

    const patch = apiMock.mock.calls.find(([, init]) => init?.method === 'PATCH') as [string, RequestInit]
    expect(patch[0]).toBe('/api/v1/series/3/release-tracking')
    expect(JSON.parse(String(patch[1].body))).toEqual({ checkedToday: true })
  })
})
