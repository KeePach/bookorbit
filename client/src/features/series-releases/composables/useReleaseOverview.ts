import { computed, ref } from 'vue'
import type { SeriesReleaseOverviewSeries, SeriesReleasesOverviewResponse } from '@bookorbit/types'
import { apiJson } from '@/lib/api-json'

/** Fresh enough for a page of badges; a change made meanwhile shows on the next page visit. */
const STALE_MS = 60_000

const overview = ref<SeriesReleasesOverviewResponse | null>(null)
const failed = ref(false)
let fetchedAt = 0
let inflight: Promise<void> | null = null

async function fetchOverview(): Promise<void> {
  try {
    overview.value = await apiJson<SeriesReleasesOverviewResponse>('/api/v1/series-releases/overview', undefined, 'seriesReleases.errors.load')
    failed.value = false
    fetchedAt = Date.now()
  } catch {
    // A page of badges is decoration: when the overview cannot load, the cards simply show none.
    failed.value = true
  } finally {
    inflight = null
  }
}

/**
 * The tracked-series overview, shared by every badge on a page: fifty cards asking at once still
 * make one request, and the answer is reused until it goes stale or `refresh` is called.
 */
export function useReleaseOverview() {
  function ensure(): Promise<void> {
    if (inflight) return inflight
    if (overview.value && !failed.value && Date.now() - fetchedAt < STALE_MS) return Promise.resolve()
    inflight = fetchOverview()
    return inflight
  }

  function refresh(): Promise<void> {
    fetchedAt = 0
    overview.value = null
    failed.value = false
    return ensure()
  }

  const bySeries = computed(() => new Map<number, SeriesReleaseOverviewSeries>(overview.value?.series.map((entry) => [entry.seriesId, entry]) ?? []))
  const loaded = computed(() => overview.value !== null)

  return { overview, bySeries, loaded, failed, ensure, refresh }
}

/** Specs share module state, so each one starts from nothing. */
export function resetReleaseOverviewForTests(): void {
  overview.value = null
  failed.value = false
  fetchedAt = 0
  inflight = null
}
