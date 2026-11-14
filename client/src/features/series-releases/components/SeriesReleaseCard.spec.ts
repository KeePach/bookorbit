import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { SeriesRelease } from '@bookorbit/types'
import SeriesReleaseCard from './SeriesReleaseCard.vue'

const NOW = new Date(2026, 10, 14, 12)

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

function mountCard(props: { release?: SeriesRelease; editable?: boolean } = {}) {
  return mount(SeriesReleaseCard, { props: { release: release(), editable: false, now: NOW, ...props } })
}

describe('SeriesReleaseCard', () => {
  it('shows the volume and how close the date is', () => {
    expect(mountCard().text()).toContain('Vol. 6')
    expect(mountCard({ release: release({ releaseDate: null }) }).text()).toContain('No date yet')
    expect(mountCard({ release: release({ releaseDate: '2026-11-14' }) }).text()).toContain('Today')
    expect(mountCard({ release: release({ releaseDate: '2026-11-20' }) }).text()).toContain('6 days')
    expect(mountCard({ release: release({ releaseDate: '2026-11-01' }) }).text()).toContain('Date passed')
  })

  it('opens the editor only for someone who may edit', async () => {
    const reader = mountCard({ editable: false })
    expect(reader.find('button').exists()).toBe(false)

    const editor = mountCard({ editable: true })
    await editor.find('button').trigger('click')

    expect(editor.emitted('select')?.[0]).toEqual([release()])
  })

  it('links the store page only for a web address', () => {
    const linked = mountCard({ release: release({ storeUrl: 'https://store.example/6' }) })
    const link = linked.find('a')
    expect(link.attributes('href')).toBe('https://store.example/6')
    expect(link.attributes('rel')).toContain('noopener')

    expect(
      mountCard({ release: release({ storeUrl: 'javascript:alert(1)' }) })
        .find('a')
        .exists(),
    ).toBe(false)
  })

  it('draws a cover only from an https link or an inline image', () => {
    expect(
      mountCard({ release: release({ cover: 'https://img.example/c.jpg' }) })
        .find('img')
        .exists(),
    ).toBe(true)
    expect(
      mountCard({ release: release({ cover: 'data:image/jpeg;base64,/9j/AA==' }) })
        .find('img')
        .exists(),
    ).toBe(true)
    expect(
      mountCard({ release: release({ cover: 'http://img.example/c.jpg' }) })
        .find('img')
        .exists(),
    ).toBe(false)
    expect(
      mountCard({ release: release({ cover: 'javascript:alert(1)' }) })
        .find('img')
        .exists(),
    ).toBe(false)
  })
})
