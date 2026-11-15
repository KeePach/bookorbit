import { computed, onMounted } from 'vue'
import type { SeriesReleaseOverviewSeries } from '@bookorbit/types'
import { seriesBadge } from '../lib/release-state'
import { useReleaseOverview } from './useReleaseOverview'

/** The check reminder outranks a quiet "no date"; a real date outranks both. */
export type TrackedReleaseKind = 'today' | 'soon' | 'overdue' | 'scheduled' | 'check' | 'undated'

/**
 * Shared state for the cover indicators (pill badge and cover frame): among the
 * series a card belongs to, picks the tracked one with the nearest upcoming date
 * and derives the display kind from it. Plain getters keep it reactive to props.
 */
export function useTrackedRelease(ids: () => (number | null | undefined)[], now?: () => Date | undefined) {
  const { bySeries, ensure } = useReleaseOverview()

  onMounted(() => void ensure())

  const tracked = computed(() => {
    const unique = [...new Set(ids())].filter((id): id is number => id != null)
    const entries = unique.flatMap((id) => bySeries.value.get(id) ?? [])
    if (entries.length === 0) return undefined
    const nearest = (entry: SeriesReleaseOverviewSeries) => entry.releases[0]?.releaseDate ?? '9999-99-99'
    return entries.reduce((best, entry) => (nearest(entry) < nearest(best) ? entry : best))
  })

  const badge = computed(() => (tracked.value ? seriesBadge(tracked.value, now?.()) : null))

  const kind = computed<TrackedReleaseKind | null>(() => {
    if (!badge.value) return null
    return badge.value.state === 'undated' && badge.value.checkDue ? 'check' : badge.value.state
  })

  return { tracked, badge, kind }
}
