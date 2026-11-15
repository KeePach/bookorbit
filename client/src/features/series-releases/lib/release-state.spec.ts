import { describe, expect, it } from 'vitest'

import { CHECK_EVERY_DAYS, daysUntil, isCheckDue, parseLocalDay, releaseState, seriesBadge } from './release-state'

const NOW = new Date(2026, 10, 14, 15, 30)

describe('parseLocalDay', () => {
  it('reads a real day as local midnight and refuses anything else', () => {
    expect(parseLocalDay('2026-12-19')).toEqual(new Date(2026, 11, 19))
    expect(parseLocalDay('2026-02-30')).toBeNull()
    expect(parseLocalDay('12/19/2026')).toBeNull()
    expect(parseLocalDay('')).toBeNull()
  })
})

describe('daysUntil', () => {
  it('counts whole days from today whatever the time of day', () => {
    expect(daysUntil('2026-11-14', NOW)).toBe(0)
    expect(daysUntil('2026-11-15', NOW)).toBe(1)
    expect(daysUntil('2026-12-19', NOW)).toBe(35)
    expect(daysUntil('2026-11-13', NOW)).toBe(-1)
    expect(daysUntil('2026-11-14', new Date(2026, 10, 14, 0, 0, 1))).toBe(0)
  })

  it('is null without a usable date', () => {
    expect(daysUntil(null, NOW)).toBeNull()
    expect(daysUntil('soon', NOW)).toBeNull()
  })
})

describe('releaseState', () => {
  it('sorts a volume by how close its date is', () => {
    expect(releaseState({ releaseDate: null }, NOW)).toBe('undated')
    expect(releaseState({ releaseDate: '2026-11-01' }, NOW)).toBe('overdue')
    expect(releaseState({ releaseDate: '2026-11-14' }, NOW)).toBe('today')
    expect(releaseState({ releaseDate: '2026-11-28' }, NOW)).toBe('soon')
    expect(releaseState({ releaseDate: '2026-11-29' }, NOW)).toBe('scheduled')
    expect(releaseState({ releaseDate: '2026-11-29' }, NOW, 30)).toBe('soon')
  })
})

describe('isCheckDue', () => {
  const tracked = { tracking: true, finished: false }

  it('is due when a volume has no date and nobody looked for long enough', () => {
    expect(isCheckDue({ ...tracked, checkedAt: null }, [{ releaseDate: null }], NOW)).toBe(true)
    expect(isCheckDue({ ...tracked, checkedAt: '2026-10-01' }, [{ releaseDate: null }], NOW)).toBe(true)
  })

  it('is not due right after a check, or when every date is known', () => {
    expect(isCheckDue({ ...tracked, checkedAt: '2026-11-10' }, [{ releaseDate: null }], NOW)).toBe(false)
    expect(isCheckDue({ ...tracked, checkedAt: null }, [{ releaseDate: '2026-12-19' }], NOW)).toBe(false)
    expect(isCheckDue({ ...tracked, checkedAt: null }, [], NOW)).toBe(false)
  })

  it('counts the interval in whole days', () => {
    const exactly = new Date(2026, 10, 14 - CHECK_EVERY_DAYS)
    const checkedAt = `${exactly.getFullYear()}-${String(exactly.getMonth() + 1).padStart(2, '0')}-${String(exactly.getDate()).padStart(2, '0')}`
    expect(isCheckDue({ ...tracked, checkedAt }, [{ releaseDate: null }], NOW)).toBe(true)
  })

  it('is never due for a series that is not followed or has no more volumes', () => {
    expect(isCheckDue({ tracking: false, finished: false, checkedAt: null }, [{ releaseDate: null }], NOW)).toBe(false)
    expect(isCheckDue({ tracking: true, finished: true, checkedAt: null }, [{ releaseDate: null }], NOW)).toBe(false)
  })
})

describe('seriesBadge', () => {
  const series = {
    seriesId: 3,
    name: 'Aki Sora',
    finished: false,
    checkedAt: '2026-11-10',
    releases: [
      { id: 1, volume: '6', releaseDate: '2026-11-20', storeUrl: null, note: null },
      { id: 2, volume: '7', releaseDate: null, storeUrl: null, note: null },
    ],
  }

  it('describes the nearest volume and counts the rest', () => {
    expect(seriesBadge(series, NOW)).toEqual({ state: 'soon', releaseDate: '2026-11-20', count: 2, checkDue: false })
  })

  it('asks for a check when no date is known and nobody looked for a while', () => {
    const stale = { ...series, checkedAt: '2026-01-01', releases: [{ id: 2, volume: '7', releaseDate: null, storeUrl: null, note: null }] }
    expect(seriesBadge(stale, NOW)).toMatchObject({ state: 'undated', checkDue: true })
  })

  it('shows nothing for a tracked series with no volumes listed', () => {
    expect(seriesBadge({ ...series, releases: [] }, NOW)).toBeNull()
  })
})
