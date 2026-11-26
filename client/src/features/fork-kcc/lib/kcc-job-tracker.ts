import { reactive } from 'vue'
import { toast } from 'vue-sonner'
import type { KccConvertJob } from '@bookorbit/types'
import { kccApi } from './kcc-api'

const POLL_MS = 3000
const DONE_TOAST_MS = 15000

/** Latest known state of every conversion this tab follows, by job id. The dialog reads it too. */
export const kccJobs = reactive(new Map<string, KccConvertJob>())

const followed = new Map<string, { timer: ReturnType<typeof setTimeout> | null }>()

function isRunning(job: KccConvertJob): boolean {
  return job.state === 'queued' || job.state === 'running'
}

function showProgress(job: KccConvertJob): void {
  toast.loading(`Converting "${job.title}" with KCC`, {
    id: job.id,
    description: job.state === 'queued' ? 'Waiting for the conversion before it' : 'This can take a few minutes. You can keep using BookOrbit.',
    duration: Infinity,
  })
}

function showResult(job: KccConvertJob): void {
  if (job.state === 'done') {
    toast.success(`"${job.title}" converted with KCC`, {
      id: job.id,
      description:
        job.mode === 'replace'
          ? `${job.outputName} replaced the original. Drag it to your Kobo.`
          : `${job.outputName} is next to the original. Drag it to your Kobo.`,
      duration: DONE_TOAST_MS,
    })
  } else {
    toast.error(`KCC couldn't convert "${job.title}"`, { id: job.id, description: job.error ?? undefined, duration: Infinity })
  }
}

async function poll(id: string): Promise<void> {
  const entry = followed.get(id)
  if (!entry) return
  entry.timer = null
  try {
    const job = await kccApi.job(id)
    kccJobs.set(id, job)
    if (isRunning(job)) {
      showProgress(job)
      entry.timer = setTimeout(() => void poll(id), POLL_MS)
    } else {
      followed.delete(id)
      showResult(job)
    }
  } catch {
    // A restart of BookOrbit forgets its conversions; stop rather than spin on a 404.
    followed.delete(id)
    toast.dismiss(id)
  }
}

/** Shows a toast for the conversion until it finishes, wherever the user goes in the app. */
export function trackKccJob(job: KccConvertJob): void {
  kccJobs.set(job.id, job)
  if (!isRunning(job)) return
  if (followed.has(job.id)) return
  followed.set(job.id, { timer: null })
  showProgress(job)
  followed.get(job.id)!.timer = setTimeout(() => void poll(job.id), POLL_MS)
}

/** For tests. */
export function resetKccJobTracker(): void {
  for (const [id, entry] of followed) {
    if (entry.timer) clearTimeout(entry.timer)
    toast.dismiss(id)
  }
  followed.clear()
  kccJobs.clear()
}
