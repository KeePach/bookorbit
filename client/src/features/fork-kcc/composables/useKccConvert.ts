import { computed, ref, watch } from 'vue'
import type {
  BookSelectionPayload,
  KccBatchConvertResult,
  KccConvertCheck,
  KccConvertJob,
  KccConvertMode,
  KccConvertRequest,
  KccOptionSchema,
  KccOptionValues,
  KccPreset,
  KccStatus,
} from '@bookorbit/types'
import { kccApi, kccErrorCode, kccErrorText } from '../lib/kcc-api'
import { kccProgress, trackKccJobs } from '../lib/kcc-job-tracker'
import type { KccConvertTarget } from './useKccConvertDialog'

const MAX_BATCH_BOOKS = 3000
const REMEMBER_KEY = 'bookorbit.fork.kcc.convert'

interface Remembered {
  presetId: number | null
  mode: KccConvertMode
}

function readRemembered(): Remembered | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY)
    return raw ? (JSON.parse(raw) as Remembered) : null
  } catch {
    return null
  }
}

function writeRemembered(value: Remembered): void {
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify(value))
  } catch {
    // Remembering the last choice is only a convenience.
  }
}

/** State of the Convert with KCC dialog, for one book or a batch. */
export function useKccConvert() {
  const selection = ref<BookSelectionPayload | null>(null)
  const count = ref(0)
  /** The one book, when the dialog is for a single book. */
  const singleBookId = computed(() => (count.value === 1 && selection.value?.bookIds?.length === 1 ? selection.value.bookIds[0]! : null))
  const status = ref<KccStatus | null>(null)
  const check = ref<KccConvertCheck | null>(null)
  const presets = ref<KccPreset[]>([])
  const schema = ref<KccOptionSchema | null>(null)
  const jobId = ref<string | null>(null)
  const batchResult = ref<KccBatchConvertResult | null>(null)
  const loading = ref(false)
  const starting = ref(false)
  const savingPreset = ref(false)
  const error = ref<string | null>(null)

  const mode = ref<KccConvertMode>('keep')
  const presetId = ref<number | null>(null)
  const customOptions = ref<KccOptionValues | null>(null)
  const force = ref(false)
  /** Pages to leave out (0-based, reader order); only for one book. */
  const removePages = ref<number[]>([])
  /** Bumped after a conversion so the Pages tab reloads the book's current pages. */
  const pagesVersion = ref(0)

  const isBatch = computed(() => singleBookId.value === null)
  const job = computed<KccConvertJob | null>(() => (jobId.value ? (kccProgress.jobs.get(jobId.value) ?? null) : null))
  const running = computed(() => job.value?.state === 'queued' || job.value?.state === 'running')
  const selectedPreset = computed(() => presets.value.find((preset) => preset.id === presetId.value) ?? null)
  const needsForce = computed(() => {
    if (isBatch.value || !check.value) return false
    return check.value.alreadyConverted || (mode.value === 'keep' && check.value.keepCopyExists)
  })
  const modeBlockedReason = computed(() => {
    if (isBatch.value || !check.value) return null
    return mode.value === 'replace' ? check.value.replaceBlockedReason : check.value.keepBlockedReason
  })
  const canStart = computed(
    () =>
      !loading.value &&
      !starting.value &&
      !running.value &&
      batchResult.value === null &&
      status.value?.reachable === true &&
      (isBatch.value || check.value !== null) &&
      modeBlockedReason.value === null &&
      (!needsForce.value || force.value),
  )

  // When a single book's conversion finishes, its file on disk changed.
  watch(
    () => job.value?.state,
    (state, previous) => {
      const finished = state === 'done' || state === 'failed'
      const wasRunning = previous === 'queued' || previous === 'running'
      if (finished && wasRunning && singleBookId.value !== null) {
        void kccApi.check(singleBookId.value).then((value) => {
          check.value = value
        })
      }
      // The removed pages were numbered in the file just converted; after a Replace they would
      // point at different pages of the new one, so start the Pages tab over.
      if (state === 'done' && wasRunning) {
        removePages.value = []
        pagesVersion.value += 1
        force.value = false
      }
    },
  )

  function applyRemembered(checked: KccConvertCheck | null): void {
    const remembered = readRemembered()
    presetId.value = presets.value.some((preset) => preset.id === remembered?.presetId) ? remembered!.presetId : (presets.value[0]?.id ?? null)
    const preferred = remembered?.mode ?? 'keep'
    if (!checked) {
      mode.value = preferred
      return
    }
    const preferredBlocked = preferred === 'replace' ? !checked.canReplace : !checked.canKeep
    mode.value = preferredBlocked ? (preferred === 'replace' ? 'keep' : 'replace') : preferred
  }

  async function load(next: KccConvertTarget): Promise<void> {
    selection.value = next.selection
    count.value = next.count
    loading.value = true
    error.value = null
    jobId.value = null
    batchResult.value = null
    check.value = null
    force.value = false
    customOptions.value = null
    removePages.value = []
    if (next.count > MAX_BATCH_BOOKS) {
      error.value = `KCC converts at most ${MAX_BATCH_BOOKS} books at a time. Select fewer.`
      loading.value = false
      return
    }
    try {
      status.value = await kccApi.status()
      presets.value = await kccApi.presets()
      schema.value = status.value.reachable ? await kccApi.options() : null
      const single = singleBookId.value
      if (single !== null) {
        const [checked, latest] = await Promise.all([kccApi.check(single), kccApi.latestJob(single)])
        check.value = checked
        if (latest.job) {
          kccProgress.jobs.set(latest.job.id, latest.job)
          jobId.value = latest.job.id
        }
        applyRemembered(checked)
      } else {
        applyRemembered(null)
      }
    } catch (reason) {
      error.value = kccErrorText(reason)
    } finally {
      loading.value = false
    }
  }

  function selectPreset(id: number | null): void {
    presetId.value = id
    customOptions.value = null
  }

  /** Starts editing options, from the selected preset, for this conversion or to save. */
  function customize(): void {
    customOptions.value = { ...(selectedPreset.value?.options ?? {}) }
  }

  async function savePreset(name: string | null): Promise<void> {
    if (customOptions.value === null) return
    savingPreset.value = true
    error.value = null
    try {
      const options = customOptions.value
      const saved =
        name === null && selectedPreset.value
          ? await kccApi.updatePreset(selectedPreset.value.id, { name: selectedPreset.value.name, options })
          : await kccApi.createPreset({ name: (name ?? '').trim(), options })
      presets.value = [...presets.value.filter((preset) => preset.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name))
      presetId.value = saved.id
      customOptions.value = null
    } catch (reason) {
      error.value = kccErrorText(reason)
    } finally {
      savingPreset.value = false
    }
  }

  function request(): KccConvertRequest {
    return {
      mode: mode.value,
      ...(customOptions.value !== null ? { options: customOptions.value } : presetId.value !== null ? { presetId: presetId.value } : {}),
      ...(force.value ? { force: true } : {}),
      ...(!isBatch.value && removePages.value.length ? { removePages: removePages.value } : {}),
    }
  }

  async function start(): Promise<void> {
    if (!canStart.value || selection.value === null) return
    starting.value = true
    error.value = null
    try {
      if (isBatch.value) {
        const result = await kccApi.convertMany({ ...request(), selection: selection.value })
        trackKccJobs(result.jobs)
        batchResult.value = result
      } else {
        const started = await kccApi.convert(singleBookId.value!, request())
        trackKccJobs([started])
        jobId.value = started.id
      }
      writeRemembered({ presetId: presetId.value, mode: mode.value })
    } catch (reason) {
      error.value = kccErrorText(reason)
      const code = kccErrorCode(reason)
      if (singleBookId.value !== null && (code === 'KCC_ALREADY_CONVERTED' || code === 'KCC_COPY_EXISTS')) {
        check.value = await kccApi.check(singleBookId.value).catch(() => check.value)
      }
    } finally {
      starting.value = false
    }
  }

  return {
    count,
    isBatch,
    status,
    check,
    presets,
    schema,
    job,
    batchResult,
    loading,
    starting,
    savingPreset,
    error,
    mode,
    presetId,
    customOptions,
    force,
    removePages,
    pagesVersion,
    running,
    selectedPreset,
    modeBlockedReason,
    canStart,
    load,
    selectPreset,
    customize,
    savePreset,
    start,
  }
}
