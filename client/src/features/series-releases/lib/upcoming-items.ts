import type { SeriesReleaseOverviewRelease, SeriesReleaseOverviewSeries } from '@bookorbit/types'
import { isCheckDue, parseLocalDay, releaseState, type TrackedReleaseKind } from './release-state'

/** One card on the Upcoming page: an announced volume, or a series still waiting on its next one. */
export interface UpcomingItem {
  key: string
  seriesId: number
  seriesName: string
  /** Null for a tracked series with nothing listed yet. */
  release: SeriesReleaseOverviewRelease | null
  day: Date | null
  kind: TrackedReleaseKind
  libraryIds: number[]
  licensed: boolean | null
  coverBookId: number | null
}

export const UPCOMING_FILTERS = ['all', 'out', 'soon', 'scheduled', 'waiting', 'check'] as const
export type UpcomingFilter = (typeof UPCOMING_FILTERS)[number]

export const UPCOMING_SORTS = ['date', 'name'] as const
export type UpcomingSort = (typeof UPCOMING_SORTS)[number]

export type UpcomingLicensed = 'all' | 'yes' | 'no'
export type UpcomingView = 'grid' | 'list'

const FILTER_KINDS: Record<Exclude<UpcomingFilter, 'all'>, readonly TrackedReleaseKind[]> = {
  out: ['today', 'overdue'],
  soon: ['soon'],
  scheduled: ['scheduled'],
  waiting: ['undated', 'check', 'caughtUp'],
  check: ['check'],
}

/** Every announced volume as its own card, plus one card per unfinished series with nothing listed. */
export function buildUpcomingItems(series: readonly SeriesReleaseOverviewSeries[], now: Date = new Date()): UpcomingItem[] {
  const items: UpcomingItem[] = []
  for (const entry of series) {
    if (entry.finished && entry.releases.length === 0) continue
    const checkDue = isCheckDue({ tracking: true, finished: entry.finished, checkedAt: entry.checkedAt }, entry.releases, now)
    const shared = {
      seriesId: entry.seriesId,
      seriesName: entry.name,
      libraryIds: entry.libraryIds ?? [],
      licensed: entry.licensed ?? null,
      coverBookId: entry.coverBookId ?? null,
    }
    if (entry.releases.length === 0) {
      items.push({ ...shared, key: `series-${entry.seriesId}`, release: null, day: null, kind: checkDue ? 'check' : 'caughtUp' })
      continue
    }
    for (const release of entry.releases) {
      const state = releaseState(release, now)
      const kind: TrackedReleaseKind = state === 'undated' && checkDue ? 'check' : state
      items.push({ ...shared, key: `release-${release.id}`, release, day: release.releaseDate ? parseLocalDay(release.releaseDate) : null, kind })
    }
  }
  return items
}

export function matchesFilter(item: UpcomingItem, filter: UpcomingFilter): boolean {
  return filter === 'all' || FILTER_KINDS[filter].includes(item.kind)
}

export interface UpcomingNarrowing {
  q: string
  libraryId: number | null
  licensed: UpcomingLicensed
}

/** Everything but the status tab, so the tabs can count what each would show. */
export function narrowItems(items: readonly UpcomingItem[], narrowing: UpcomingNarrowing): UpcomingItem[] {
  const needle = narrowing.q.trim().toLocaleLowerCase()
  return items.filter((item) => {
    if (narrowing.libraryId !== null && !item.libraryIds.includes(narrowing.libraryId)) return false
    if (narrowing.licensed === 'yes' && item.licensed !== true) return false
    if (narrowing.licensed === 'no' && item.licensed === true) return false
    if (!needle) return true
    return item.seriesName.toLocaleLowerCase().includes(needle) || (item.release?.volume.toLocaleLowerCase().includes(needle) ?? false)
  })
}

export function countByFilter(items: readonly UpcomingItem[]): Record<UpcomingFilter, number> {
  const counts = Object.fromEntries(UPCOMING_FILTERS.map((filter) => [filter, 0])) as Record<UpcomingFilter, number>
  for (const item of items) {
    for (const filter of UPCOMING_FILTERS) if (matchesFilter(item, filter)) counts[filter]++
  }
  return counts
}

function byName(a: UpcomingItem, b: UpcomingItem): number {
  return a.seriesName.localeCompare(b.seriesName) || (a.release?.volume ?? '').localeCompare(b.release?.volume ?? '', undefined, { numeric: true })
}

/** Dated volumes nearest first (undated after them, by name), or everything by series name. */
export function sortItems(items: readonly UpcomingItem[], sort: UpcomingSort, order: 'asc' | 'desc'): UpcomingItem[] {
  const sorted = [...items].sort((a, b) => {
    if (sort === 'name') return byName(a, b)
    if (a.day && b.day) return a.day.getTime() - b.day.getTime() || byName(a, b)
    if (a.day) return -1
    if (b.day) return 1
    return byName(a, b)
  })
  if (order === 'asc') return sorted
  if (sort === 'name') return sorted.reverse()
  // Reversing a date sort keeps the undated cards at the end: they have no place on the timeline.
  const dated = sorted.filter((item) => item.day).reverse()
  return [...dated, ...sorted.filter((item) => !item.day)]
}

export interface UpcomingGroup {
  key: string
  /** Null when the list is one run with no headings. */
  label: string | null
  items: UpcomingItem[]
}

/** By date, one heading per month and one for the undated; by name, a single run. */
export function groupItems(
  items: readonly UpcomingItem[],
  sort: UpcomingSort,
  monthLabel: (day: Date) => string,
  waitingLabel: string,
): UpcomingGroup[] {
  if (sort === 'name') return items.length > 0 ? [{ key: 'all', label: null, items: [...items] }] : []
  const groups: UpcomingGroup[] = []
  const waiting: UpcomingItem[] = []
  for (const item of items) {
    if (!item.day) {
      waiting.push(item)
      continue
    }
    const label = monthLabel(item.day)
    const last = groups.at(-1)
    if (last && last.label === label) last.items.push(item)
    else groups.push({ key: `month-${item.day.getFullYear()}-${item.day.getMonth()}`, label, items: [item] })
  }
  if (waiting.length > 0) groups.push({ key: 'waiting', label: waitingLabel, items: waiting })
  return groups
}

export interface UpcomingQuery extends UpcomingNarrowing {
  filter: UpcomingFilter
  sort: UpcomingSort
  order: 'asc' | 'desc'
  view: UpcomingView
}

function one(value: unknown): string | null {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first : null
}

/** Reads the page state from the address, ignoring anything it does not recognise. */
export function parseUpcomingQuery(query: Record<string, unknown>): UpcomingQuery {
  const filter = one(query.state)
  const sort = one(query.sort)
  const licensed = one(query.licensed)
  const library = Number(one(query.libraryId))
  return {
    filter: (UPCOMING_FILTERS as readonly string[]).includes(filter ?? '') ? (filter as UpcomingFilter) : 'all',
    sort: (UPCOMING_SORTS as readonly string[]).includes(sort ?? '') ? (sort as UpcomingSort) : 'date',
    order: one(query.order) === 'desc' ? 'desc' : 'asc',
    view: one(query.view) === 'list' ? 'list' : 'grid',
    licensed: licensed === 'yes' || licensed === 'no' ? licensed : 'all',
    libraryId: Number.isInteger(library) && library > 0 ? library : null,
    q: one(query.q) ?? '',
  }
}

/** The address for a page state, defaults left out so a plain visit stays `/releases`. */
export function toUpcomingQuery(state: UpcomingQuery): Record<string, string> {
  const query: Record<string, string> = {}
  if (state.filter !== 'all') query.state = state.filter
  if (state.sort !== 'date') query.sort = state.sort
  if (state.order !== 'asc') query.order = state.order
  if (state.view !== 'grid') query.view = state.view
  if (state.licensed !== 'all') query.licensed = state.licensed
  if (state.libraryId !== null) query.libraryId = String(state.libraryId)
  if (state.q.trim()) query.q = state.q
  return query
}

/** A release's own cover, or null to fall back on the series' latest owned volume. */
export function releaseCoverUrl(release: SeriesReleaseOverviewRelease | null): string | null {
  if (!release?.coverVersion) return null
  return `/api/v1/series-releases/${release.id}/cover?v=${release.coverVersion}`
}
