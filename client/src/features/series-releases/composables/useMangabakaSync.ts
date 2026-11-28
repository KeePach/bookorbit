import { onBeforeUnmount, ref } from 'vue'
import type { MangabakaSyncSeriesStatus, MangabakaSyncSettings, MangabakaSyncSettingsUpdate } from '@bookorbit/types'
import { apiJson, errorMessage, jsonBody } from '@/lib/api-json'

const BASE = '/api/v1/fork/mangabaka-sync'
const ERROR_KEY = 'seriesReleases.errors.mangabakaSync'
const POLL_MS = 2000

/** The MangaBaka reading sync card: the token, the switch, and the series being synced. */
export function useMangabakaSyncSettings() {
  const settings = ref<MangabakaSyncSettings | null>(null)
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
    try {
      settings.value = await apiJson<MangabakaSyncSettings>(`${BASE}/settings`, undefined, ERROR_KEY)
      error.value = null
      if (settings.value.running) schedulePoll()
    } catch (reason) {
      error.value = errorMessage(reason, ERROR_KEY)
    }
  }

  async function save(update: MangabakaSyncSettingsUpdate): Promise<void> {
    saving.value = true
    try {
      settings.value = await apiJson<MangabakaSyncSettings>(`${BASE}/settings`, jsonBody('PATCH', update), ERROR_KEY)
    } finally {
      saving.value = false
    }
  }

  async function syncAll(): Promise<void> {
    saving.value = true
    try {
      await apiJson<{ started: boolean }>(`${BASE}/sync-all`, { method: 'POST' }, ERROR_KEY)
      await load()
    } finally {
      saving.value = false
    }
  }

  onBeforeUnmount(() => {
    if (pollTimer !== null) clearTimeout(pollTimer)
  })

  return { settings, saving, error, load, save, syncAll }
}

/** One series' MangaBaka sync switch on the series page. */
export function useMangabakaSeriesSync(seriesId: () => number) {
  const status = ref<MangabakaSyncSeriesStatus | null>(null)
  const busy = ref(false)

  async function load(): Promise<void> {
    try {
      status.value = await apiJson<MangabakaSyncSeriesStatus>(`${BASE}/series/${seriesId()}`, undefined, ERROR_KEY)
    } catch {
      // The series page works without it; the line just stays hidden.
      status.value = null
    }
  }

  async function setSelected(selected: boolean): Promise<void> {
    busy.value = true
    try {
      status.value = await apiJson<MangabakaSyncSeriesStatus>(`${BASE}/series/${seriesId()}`, jsonBody('PUT', { selected }), ERROR_KEY)
    } finally {
      busy.value = false
    }
  }

  async function syncNow(): Promise<void> {
    busy.value = true
    try {
      status.value = await apiJson<MangabakaSyncSeriesStatus>(`${BASE}/series/${seriesId()}/sync`, { method: 'POST' }, ERROR_KEY)
    } finally {
      busy.value = false
    }
  }

  return { status, busy, load, setSelected, syncNow }
}
