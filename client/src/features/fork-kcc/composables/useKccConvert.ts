import { computed, ref, watch } from 'vue'
import type { KccConvertCheck, KccConvertJob, KccConvertMode, KccOptionSchema, KccOptionValues, KccPreset, KccStatus } from '@bookorbit/types'
import { kccApi, kccErrorCode, kccErrorText } from '../lib/kcc-api'
import { kccJobs, trackKccJob } from '../lib/kcc-job-tracker'

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

/** State of the Convert with KCC dialog for one book. */
export function useKccConvert() {
  const bookId = ref<number | null>(null)
  const status = ref<KccStatus | null>(null)
  const check = ref<KccConvertCheck | null>(null)
  const presets = ref<KccPreset[]>([])
  const schema = ref<KccOptionSchema | null>(null)
  const jobId = ref<string | null>(null)
  const job = computed<KccConvertJob | null>(() => (jobId.value ? (kccJobs.get(jobId.value) ?? null) : null))
  const loading = ref(false)
  const starting = ref(false)
  const error = ref<string | null>(null)

  const mode = ref<KccConvertMode>('keep')
  const presetId = ref<number | null>(null)
  const customOptions = ref<KccOptionValues | null>(null)
  const force = ref(false)

  const running = computed(() => job.value?.state === 'queued' || job.value?.state === 'running')
  const needsForce = computed(() => {
    if (!check.value) return false
    return check.value.alreadyConverted || (mode.value === 'keep' && check.value.keepCopyExists)
  })
  const modeBlockedReason = computed(() => {
    if (!check.value) return null
    return mode.value === 'replace' ? check.value.replaceBlockedReason : check.value.keepBlockedReason
  })
  const canStart = computed(
    () =>
      !loading.value &&
      !starting.value &&
      !running.value &&
      status.value?.reachable === true &&
      check.value !== null &&
      modeBlockedReason.value === null &&
      (!needsForce.value || force.value),
  )
  const selectedPreset = computed(() => presets.value.find((preset) => preset.id === presetId.value) ?? null)

  // The tracker follows the job (and its toast); when it finishes, the file on disk changed.
  watch(
    () => job.value?.state,
    (state, previous) => {
      const finished = state === 'done' || state === 'failed'
      const wasRunning = previous === 'queued' || previous === 'running'
      if (finished && wasRunning && bookId.value !== null) {
        void kccApi.check(bookId.value).then((value) => {
          check.value = value
        })
      }
    },
  )

  async function load(id: number): Promise<void> {
    bookId.value = id
    loading.value = true
    error.value = null
    jobId.value = null
    force.value = false
    customOptions.value = null
    try {
      status.value = await kccApi.status()
      const [checked, presetList, latest] = await Promise.all([kccApi.check(id), kccApi.presets(), kccApi.latestJob(id)])
      check.value = checked
      presets.value = presetList
      if (latest.job) {
        trackKccJob(latest.job)
        jobId.value = latest.job.id
      }
      schema.value = status.value.reachable ? await kccApi.options() : null

      const remembered = readRemembered()
      presetId.value = presetList.some((preset) => preset.id === remembered?.presetId) ? remembered!.presetId : (presetList[0]?.id ?? null)
      const preferred = remembered?.mode ?? 'keep'
      const preferredBlocked = preferred === 'replace' ? !checked.canReplace : !checked.canKeep
      mode.value = preferredBlocked ? (preferred === 'replace' ? 'keep' : 'replace') : preferred
    } catch (reason) {
      error.value = kccErrorText(reason)
    } finally {
      loading.value = false
    }
  }

  /** Starts editing options for this conversion only, from the selected preset. */
  function customize(): void {
    customOptions.value = { ...(selectedPreset.value?.options ?? {}) }
  }

  async function start(): Promise<void> {
    if (!canStart.value || bookId.value === null) return
    starting.value = true
    error.value = null
    try {
      const started = await kccApi.convert(bookId.value, {
        mode: mode.value,
        ...(customOptions.value !== null ? { options: customOptions.value } : presetId.value !== null ? { presetId: presetId.value } : {}),
        ...(force.value ? { force: true } : {}),
      })
      trackKccJob(started)
      jobId.value = started.id
      writeRemembered({ presetId: presetId.value, mode: mode.value })
    } catch (reason) {
      error.value = kccErrorText(reason)
      if (kccErrorCode(reason) === 'KCC_ALREADY_CONVERTED' || kccErrorCode(reason) === 'KCC_COPY_EXISTS') {
        check.value = await kccApi.check(bookId.value).catch(() => check.value)
      }
    } finally {
      starting.value = false
    }
  }

  return {
    status,
    check,
    presets,
    schema,
    job,
    loading,
    starting,
    error,
    mode,
    presetId,
    customOptions,
    force,
    running,
    needsForce,
    modeBlockedReason,
    canStart,
    load,
    customize,
    start,
  }
}
