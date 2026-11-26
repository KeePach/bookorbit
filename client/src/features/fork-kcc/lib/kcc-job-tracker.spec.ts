import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KccConvertJob } from '@bookorbit/types'

const toast = vi.hoisted(() => ({ loading: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }))
const api = vi.hoisted(() => ({ job: vi.fn() }))
vi.mock('vue-sonner', () => ({ toast }))
vi.mock('./kcc-api', () => ({ kccApi: api }))

import { kccJobs, resetKccJobTracker, trackKccJob } from './kcc-job-tracker'

const running: KccConvertJob = {
  id: 'job-1',
  bookId: 4,
  title: 'Akira v01',
  mode: 'keep',
  state: 'running',
  error: null,
  outputName: null,
  ignoredOptions: [],
  createdAt: '2026-11-26T00:00:00.000Z',
  finishedAt: null,
}

describe('kcc job tracker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetKccJobTracker()
    vi.useRealTimers()
  })

  it('keeps a corner notice up while KCC works and turns it into the result', async () => {
    api.job.mockResolvedValueOnce(running).mockResolvedValueOnce({ ...running, state: 'done', outputName: 'Akira v01_kcc.cbz' })

    trackKccJob(running)
    expect(toast.loading).toHaveBeenCalledWith('Converting "Akira v01" with KCC', expect.objectContaining({ id: 'job-1', duration: Infinity }))

    await vi.advanceTimersByTimeAsync(3000)
    expect(api.job).toHaveBeenCalledTimes(1)
    expect(toast.success).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(3000)
    expect(toast.success).toHaveBeenCalledWith(
      '"Akira v01" converted with KCC',
      expect.objectContaining({ id: 'job-1', description: 'Akira v01_kcc.cbz is next to the original. Drag it to your Kobo.' }),
    )
    expect(kccJobs.get('job-1')?.state).toBe('done')

    await vi.advanceTimersByTimeAsync(10000)
    expect(api.job).toHaveBeenCalledTimes(2)
  })

  it('shows a failure until dismissed, and follows a job only once', async () => {
    api.job.mockResolvedValue({ ...running, state: 'failed', error: 'KCC failed (exit 1): bad archive' })

    trackKccJob(running)
    trackKccJob(running)
    await vi.advanceTimersByTimeAsync(3000)

    expect(api.job).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith(
      'KCC couldn\'t convert "Akira v01"',
      expect.objectContaining({ id: 'job-1', description: 'KCC failed (exit 1): bad archive', duration: Infinity }),
    )
  })
})
