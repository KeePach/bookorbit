import { onBeforeUnmount, ref } from 'vue'
import type { SeriesLicensingOverview } from '@bookorbit/types'
import { apiJson, errorMessage, jsonBody } from '@/lib/api-json'

const POLL_MS = 2000

/**
 * The MangaBaka licensing card: which libraries are checked, the last run, and starting a
 * new one. While a run is underway the overview is polled so the card shows it working.
 */
export function useSeriesLicensing() {
  const overview = ref<SeriesLicensingOverview | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)
  let pollTimer: ReturnType<typeof setTimeout> | null = null

  function schedulePoll(): void {
    if (pollTimer !== null) return
    pollTimer = setTimeout(() => {
      pollTimer = null
      void load()
    }, POLL_MS)
  }

  async function load(): Promise<void> {
    loading.value = overview.value === null
    try {
      overview.value = await apiJson<SeriesLicensingOverview>('/api/v1/series-releases/licensing', undefined, 'seriesReleases.errors.licensing')
      error.value = null
      if (overview.value.status.running) schedulePoll()
    } catch (reason) {
      error.value = errorMessage(reason, 'seriesReleases.errors.licensing')
    } finally {
      loading.value = false
    }
  }

  async function saveLibraries(libraryIds: number[]): Promise<void> {
    saving.value = true
    try {
      overview.value = await apiJson<SeriesLicensingOverview>(
        '/api/v1/series-releases/licensing',
        jsonBody('PATCH', { libraryIds }),
        'seriesReleases.errors.licensing',
      )
    } finally {
      saving.value = false
    }
  }

  async function startRun(): Promise<void> {
    saving.value = true
    try {
      await apiJson<{ started: boolean }>('/api/v1/series-releases/licensing/run', { method: 'POST' }, 'seriesReleases.errors.licensing')
      await load()
    } finally {
      saving.value = false
    }
  }

  onBeforeUnmount(() => {
    if (pollTimer !== null) clearTimeout(pollTimer)
  })

  return { overview, loading, saving, error, load, saveLibraries, startRun }
}
