import { describe, expect, it } from 'vitest'
import type { SeriesReleaseOverviewSeries } from '@bookorbit/types'
import {
  buildUpcomingItems,
  countByFilter,
  groupItems,
  narrowItems,
  parseUpcomingQuery,
  releaseCoverUrl,
  sortItems,
  toUpcomingQuery,
} from './upcoming-items'

const NOW = new Date(2026, 10, 15, 12)

function series(overrides: Partial<SeriesReleaseOverviewSeries>): SeriesReleaseOverviewSeries {
  return {
    seriesId: 1,
    name: 'Series',
    finished: false,
    checkedAt: '2026-11-10',
    releases: [],
    libraryIds: [1],
    licensed: null,
    coverBookId: null,
    ...overrides,
  }
}

const SAMPLE: SeriesReleaseOverviewSeries[] = [
  series({
    seriesId: 3,
    name: 'Aki Sora',
    licensed: true,
    libraryIds: [1],
    coverBookId: 30,
    releases: [
      { id: 1, volume: '6', releaseDate: '2026-11-20', storeUrl: null, note: null, coverVersion: 99 },
      { id: 2, volume: '7', releaseDate: '2027-01-10', storeUrl: null, note: null, coverVersion: null },
    ],
  }),
  series({
    seriesId: 4,
    name: 'Out Now',
    libraryIds: [2],
    releases: [{ id: 3, volume: '2', releaseDate: '2026-11-15', storeUrl: null, note: null }],
  }),
  series({ seriesId: 5, name: 'Animan', licensed: true, libraryIds: [2], checkedAt: '2026-09-01' }),
  series({ seriesId: 6, name: 'Fresh', licensed: false, libraryIds: [1] }),
  series({ seriesId: 7, name: 'Done', finished: true }),
]

describe('buildUpcomingItems', () => {
  it('makes a card per volume and one per unfinished series with nothing listed', () => {
    const items = buildUpcomingItems(SAMPLE, NOW)

    expect(items.map((item) => [item.key, item.kind])).toEqual([
      ['release-1', 'soon'],
      ['release-2', 'scheduled'],
      ['release-3', 'today'],
      ['series-5', 'check'],
      ['series-6', 'caughtUp'],
    ])
    expect(items[0]).toMatchObject({ seriesName: 'Aki Sora', licensed: true, coverBookId: 30, libraryIds: [1] })
  })
})

describe('narrowing and counting', () => {
  const items = buildUpcomingItems(SAMPLE, NOW)

  it('counts every tab over the narrowed set', () => {
    expect(countByFilter(items)).toEqual({ all: 5, out: 1, soon: 1, scheduled: 1, waiting: 2, check: 1 })
  })

  it('narrows by library, licensing and search', () => {
    expect(narrowItems(items, { q: '', libraryId: 2, licensed: 'all' }).map((item) => item.key)).toEqual(['release-3', 'series-5'])
    expect(narrowItems(items, { q: '', libraryId: null, licensed: 'yes' }).map((item) => item.key)).toEqual(['release-1', 'release-2', 'series-5'])
    expect(narrowItems(items, { q: '', libraryId: null, licensed: 'no' }).map((item) => item.key)).toEqual(['release-3', 'series-6'])
    expect(narrowItems(items, { q: 'aki', libraryId: null, licensed: 'all' })).toHaveLength(2)
  })
})

describe('sorting and grouping', () => {
  const items = buildUpcomingItems(SAMPLE, NOW)
  const month = (day: Date) => `${day.getFullYear()}-${day.getMonth() + 1}`

  it('puts dates first, nearest first, and keeps undated last even when reversed', () => {
    expect(sortItems(items, 'date', 'asc').map((item) => item.key)).toEqual(['release-3', 'release-1', 'release-2', 'series-5', 'series-6'])
    expect(sortItems(items, 'date', 'desc').map((item) => item.key)).toEqual(['release-2', 'release-1', 'release-3', 'series-5', 'series-6'])
  })

  it('sorts by series name either way', () => {
    expect(sortItems(items, 'name', 'asc').map((item) => item.seriesName)).toEqual(['Aki Sora', 'Aki Sora', 'Animan', 'Fresh', 'Out Now'])
    expect(sortItems(items, 'name', 'desc')[0].seriesName).toBe('Out Now')
  })

  it('groups by month with the undated last, or not at all by name', () => {
    const byDate = groupItems(sortItems(items, 'date', 'asc'), 'date', month, 'Waiting')
    expect(byDate.map((group) => [group.label, group.items.length])).toEqual([
      ['2026-11', 2],
      ['2027-1', 1],
      ['Waiting', 2],
    ])
    expect(groupItems(items, 'name', month, 'Waiting')).toEqual([{ key: 'all', label: null, items }])
  })
})

describe('the address', () => {
  it('round-trips a page state and leaves defaults out', () => {
    const state = parseUpcomingQuery({ state: 'soon', sort: 'name', order: 'desc', view: 'list', licensed: 'yes', libraryId: '3', q: 'aki' })
    expect(state).toEqual({ filter: 'soon', sort: 'name', order: 'desc', view: 'list', licensed: 'yes', libraryId: 3, q: 'aki' })
    expect(toUpcomingQuery(state)).toEqual({ state: 'soon', sort: 'name', order: 'desc', view: 'list', licensed: 'yes', libraryId: '3', q: 'aki' })
    expect(toUpcomingQuery(parseUpcomingQuery({}))).toEqual({})
  })

  it('ignores values it does not know', () => {
    expect(parseUpcomingQuery({ state: 'nope', sort: 'size', libraryId: '-2', licensed: 'maybe' })).toMatchObject({
      filter: 'all',
      sort: 'date',
      libraryId: null,
      licensed: 'all',
    })
  })
})

describe('releaseCoverUrl', () => {
  it('points at the cover endpoint with its version, or nowhere', () => {
    expect(releaseCoverUrl({ id: 4, volume: '6', releaseDate: null, storeUrl: null, note: null, coverVersion: 12 })).toBe(
      '/api/v1/series-releases/4/cover?v=12',
    )
    expect(releaseCoverUrl({ id: 4, volume: '6', releaseDate: null, storeUrl: null, note: null, coverVersion: null })).toBeNull()
    expect(releaseCoverUrl(null)).toBeNull()
  })
})
