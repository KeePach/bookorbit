import type { SeriesRelease, SeriesReleaseOverviewSeries, SeriesReleaseTracking } from '@bookorbit/types'

/** A volume this close counts as coming up soon. */
export const SOON_DAYS = 14
/** A volume with no date is worth looking up again after this long. */
export const CHECK_EVERY_DAYS = 30

export type ReleaseState = 'undated' | 'scheduled' | 'soon' | 'today' | 'overdue'

/** `YYYY-MM-DD` as the local day it names, so a release date never shifts with the time zone. */
export function parseLocalDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

/** Whole days from today to the date: 0 is today, negative is past. Null for a missing or invalid date. */
export function daysUntil(date: string | null, now: Date = new Date()): number | null {
  const day = date ? parseLocalDay(date) : null
  if (!day) return null
  return Math.round((day.getTime() - startOfDay(now).getTime()) / 86_400_000)
}

export function releaseState(release: Pick<SeriesRelease, 'releaseDate'>, now: Date = new Date(), soonDays: number = SOON_DAYS): ReleaseState {
  const days = daysUntil(release.releaseDate, now)
  if (days === null) return 'undated'
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  return days <= soonDays ? 'soon' : 'scheduled'
}

/**
 * Whether it is time to look for a date again: a volume has none, and nobody has checked for
 * `everyDays` days. A series with every date known is never due.
 */
export function isCheckDue(
  tracking: Pick<SeriesReleaseTracking, 'tracking' | 'finished' | 'checkedAt'>,
  releases: readonly Pick<SeriesRelease, 'releaseDate'>[],
  now: Date = new Date(),
  everyDays: number = CHECK_EVERY_DAYS,
): boolean {
  if (!tracking.tracking || tracking.finished) return false
  if (!releases.some((release) => release.releaseDate === null)) return false
  const since = daysUntil(tracking.checkedAt, now)
  return since === null || -since >= everyDays
}

export interface SeriesBadge {
  /** The state of the nearest upcoming volume. */
  state: ReleaseState
  /** Its date, null while none is known. */
  releaseDate: string | null
  /** How many volumes are listed as upcoming. */
  count: number
  /** Nobody has looked for a date in a while. */
  checkDue: boolean
}

/** What a series card's badge shows for one tracked series, or null when nothing is listed. */
export function seriesBadge(series: SeriesReleaseOverviewSeries, now: Date = new Date()): SeriesBadge | null {
  const nearest = series.releases[0]
  if (!nearest) return null
  return {
    state: releaseState(nearest, now),
    releaseDate: nearest.releaseDate,
    count: series.releases.length,
    checkDue: isCheckDue({ tracking: true, finished: series.finished, checkedAt: series.checkedAt }, series.releases, now),
  }
}
