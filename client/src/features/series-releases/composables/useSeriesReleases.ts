import { ref, toValue, type MaybeRefOrGetter } from 'vue'
import type {
  SeriesRelease,
  SeriesReleaseCollectResult,
  SeriesReleaseImportEntry,
  SeriesReleaseImportResult,
  SeriesReleaseInput,
  SeriesReleasesResponse,
  SeriesReleaseTracking,
  SeriesReleaseTrackingUpdate,
  SeriesReleaseUpdate,
} from '@bookorbit/types'
import { apiJson, apiSend, errorMessage, jsonBody } from '@/lib/api-json'

/**
 * The upcoming volumes of one series. Every change reloads the list afterwards, so what is shown is
 * always what the server holds; a failed change throws and leaves the list as it was.
 */
export function useSeriesReleases(seriesId: MaybeRefOrGetter<number | null>) {
  const data = ref<SeriesReleasesResponse | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  let requestToken = 0
  let loadedFor: number | null = null

  function requireId(): number {
    const id = toValue(seriesId)
    if (id == null) throw new Error('No series is open')
    return id
  }

  async function load(): Promise<void> {
    const id = toValue(seriesId)
    const token = ++requestToken
    if (id == null) {
      data.value = null
      loadedFor = null
      return
    }
    if (loadedFor !== id) data.value = null
    loadedFor = id
    if (!data.value) loading.value = true
    error.value = null
    try {
      const next = await apiJson<SeriesReleasesResponse>(`/api/v1/series/${id}/releases`, undefined, 'seriesReleases.errors.load')
      if (token === requestToken) data.value = next
    } catch (reason) {
      if (token === requestToken) error.value = errorMessage(reason, 'seriesReleases.errors.load')
    } finally {
      if (token === requestToken) loading.value = false
    }
  }

  async function mutate<T>(run: () => Promise<T>): Promise<T> {
    saving.value = true
    try {
      const result = await run()
      await load()
      return result
    } finally {
      saving.value = false
    }
  }

  function add(input: SeriesReleaseInput): Promise<SeriesRelease> {
    return mutate(() => apiJson<SeriesRelease>(`/api/v1/series/${requireId()}/releases`, jsonBody('POST', input), 'seriesReleases.errors.save'))
  }

  function update(releaseId: number, patch: SeriesReleaseUpdate): Promise<SeriesRelease> {
    return mutate(() =>
      apiJson<SeriesRelease>(`/api/v1/series/${requireId()}/releases/${releaseId}`, jsonBody('PATCH', patch), 'seriesReleases.errors.save'),
    )
  }

  function remove(releaseId: number): Promise<void> {
    return mutate(() => apiSend(`/api/v1/series/${requireId()}/releases/${releaseId}`, { method: 'DELETE' }, 'seriesReleases.errors.remove'))
  }

  /** The volume arrived: it is closed and, unless the series is finished, the next one opens with no date. */
  function collect(releaseId: number): Promise<SeriesReleaseCollectResult> {
    return mutate(() =>
      apiJson<SeriesReleaseCollectResult>(
        `/api/v1/series/${requireId()}/releases/${releaseId}/collect`,
        { method: 'POST' },
        'seriesReleases.errors.collect',
      ),
    )
  }

  function updateTracking(patch: SeriesReleaseTrackingUpdate): Promise<SeriesReleaseTracking> {
    return mutate(() =>
      apiJson<SeriesReleaseTracking>(`/api/v1/series/${requireId()}/release-tracking`, jsonBody('PATCH', patch), 'seriesReleases.errors.tracking'),
    )
  }

  /** Places a userscript backup by series id, whichever series it names, then reloads this one. */
  function importBackup(entries: SeriesReleaseImportEntry[]): Promise<SeriesReleaseImportResult> {
    return mutate(() =>
      apiJson<SeriesReleaseImportResult>('/api/v1/series-releases/import', jsonBody('POST', { entries }), 'seriesReleases.errors.import'),
    )
  }

  return { data, loading, saving, error, load, add, update, remove, collect, updateTracking, importBackup }
}
