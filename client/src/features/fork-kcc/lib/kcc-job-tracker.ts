import { computed, reactive } from 'vue'
import type { KccConvertJob } from '@bookorbit/types'
import { kccApi } from './kcc-api'

const POLL_MS = 3000
/** A finished session without failures leaves the corner by itself after this long. */
const AUTO_HIDE_MS = 20000

interface KccProgressState {
  /** Latest known state of every conversion this tab has seen, by id. The dialog reads it too. */
  jobs: Map<string, KccConvertJob>
  /** The conversions the corner card counts, in the order they were started. */
  session: string[]
  dismissed: boolean
}

export const kccProgress = reactive<KccProgressState>({ jobs: new Map(), session: [], dismissed: false })

let pollTimer: ReturnType<typeof setTimeout> | null = null
/** Where the last list left off, so each round only fetches what changed. */
let syncedAt: string | null = null
let bootId: string | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

export function isKccJobRunning(job: KccConvertJob | undefined): boolean {
  return job?.state === 'queued' || job?.state === 'running'
}

const sessionJobs = computed(() => kccProgress.session.map((id) => kccProgress.jobs.get(id)).filter((job): job is KccConvertJob => !!job))

export const kccSession = computed(() => {
  const jobs = sessionJobs.value
  const done = jobs.filter((job) => job.state === 'done').length
  const failed = jobs.filter((job) => job.state === 'failed').length
  const remaining = jobs.length - done - failed
  return {
    jobs,
    total: jobs.length,
    done,
    failed,
    remaining,
    current: jobs.find((job) => job.state === 'running') ?? null,
    visible: jobs.length > 0 && !kccProgress.dismissed,
  }
})

function clearTimer(timer: ReturnType<typeof setTimeout> | null): null {
  if (timer) clearTimeout(timer)
  return null
}

function schedulePoll(): void {
  pollTimer = clearTimer(pollTimer)
  pollTimer = setTimeout(() => void poll(), POLL_MS)
}

function scheduleAutoHide(): void {
  hideTimer = clearTimer(hideTimer)
  if (kccSession.value.failed > 0) return
  hideTimer = setTimeout(() => {
    if (kccSession.value.remaining === 0) dismissKccProgress()
  }, AUTO_HIDE_MS)
}

function markForgotten(): void {
  for (const id of kccProgress.session) {
    const job = kccProgress.jobs.get(id)
    if (job && isKccJobRunning(job)) {
      kccProgress.jobs.set(id, { ...job, state: 'failed', error: 'BookOrbit restarted before this finished. Convert it again.' })
    }
  }
}

async function poll(): Promise<void> {
  pollTimer = null
  try {
    const list = await kccApi.jobs(syncedAt ?? undefined)
    if (bootId !== null && list.bootId !== bootId) markForgotten()
    bootId = list.bootId
    syncedAt = list.serverTime
    for (const job of list.jobs) kccProgress.jobs.set(job.id, job)
  } catch {
    // Try again on the next round; the card keeps its last state meanwhile.
  }
  if (kccSession.value.remaining > 0) schedulePoll()
  else scheduleAutoHide()
}

/** Follows these conversions in the corner card until they finish, wherever the user goes in the app. */
export function trackKccJobs(jobs: KccConvertJob[]): void {
  if (jobs.length === 0) return
  if (kccSession.value.remaining === 0) kccProgress.session = []
  hideTimer = clearTimer(hideTimer)
  for (const job of jobs) {
    kccProgress.jobs.set(job.id, job)
    if (!kccProgress.session.includes(job.id)) kccProgress.session.push(job.id)
  }
  kccProgress.dismissed = false
  if (kccSession.value.remaining > 0) schedulePoll()
}

/** After a reload, picks up the conversions still running on the server. */
export async function resumeKccJobs(): Promise<void> {
  const list = await kccApi.jobs()
  bootId = list.bootId
  syncedAt = list.serverTime
  trackKccJobs(list.jobs.filter((job) => isKccJobRunning(job)))
}

/** Hides the card. Running conversions go on, and starting another one shows it again. */
export function dismissKccProgress(): void {
  kccProgress.dismissed = true
  hideTimer = clearTimer(hideTimer)
  if (kccSession.value.remaining === 0) kccProgress.session = []
}

/** For tests. */
export function resetKccJobTracker(): void {
  pollTimer = clearTimer(pollTimer)
  hideTimer = clearTimer(hideTimer)
  syncedAt = null
  bootId = null
  kccProgress.jobs.clear()
  kccProgress.session = []
  kccProgress.dismissed = false
}
