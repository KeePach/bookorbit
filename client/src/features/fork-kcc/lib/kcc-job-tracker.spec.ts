import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KccConvertJob } from '@bookorbit/types'

const api = vi.hoisted(() => ({ jobs: vi.fn() }))
vi.mock('./kcc-api', () => ({ kccApi: api }))

import { dismissKccProgress, kccSession, resetKccJobTracker, trackKccJobs } from './kcc-job-tracker'

function job(id: string, state: KccConvertJob['state'], extra: Partial<KccConvertJob> = {}): KccConvertJob {
  return {
    id,
    bookId: 1,
    title: `Book ${id}`,
    mode: 'keep',
    state,
    error: null,
    outputName: null,
    ignoredOptions: [],
    createdAt: '2026-11-26T00:00:00.000Z',
    finishedAt: null,
    ...extra,
  }
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

  it('follows a batch with one request per round and counts it down', async () => {
    trackKccJobs([job('a', 'running'), job('b', 'queued'), job('c', 'queued')])
    expect(kccSession.value).toMatchObject({ total: 3, remaining: 3, visible: true })
    expect(kccSession.value.current?.id).toBe('a')

    api.jobs.mockResolvedValueOnce([job('a', 'done', { outputName: 'a_kcc.cbz' }), job('b', 'running'), job('c', 'queued')])
    await vi.advanceTimersByTimeAsync(3000)
    expect(api.jobs).toHaveBeenCalledTimes(1)
    expect(kccSession.value).toMatchObject({ done: 1, remaining: 2 })
    expect(kccSession.value.current?.id).toBe('b')

    api.jobs.mockResolvedValueOnce([job('a', 'done'), job('b', 'failed', { error: 'bad archive' }), job('c', 'done')])
    await vi.advanceTimersByTimeAsync(3000)
    expect(kccSession.value).toMatchObject({ done: 2, failed: 1, remaining: 0, visible: true })

    // Finished: no more requests, and a failure keeps the card up.
    await vi.advanceTimersByTimeAsync(30000)
    expect(api.jobs).toHaveBeenCalledTimes(2)
    expect(kccSession.value.visible).toBe(true)
  })

  it('hides a clean finish by itself, and dismissing clears the session', async () => {
    trackKccJobs([job('a', 'running')])
    api.jobs.mockResolvedValue([job('a', 'done')])
    await vi.advanceTimersByTimeAsync(3000)
    expect(kccSession.value.visible).toBe(true)
    await vi.advanceTimersByTimeAsync(20000)
    expect(kccSession.value).toMatchObject({ visible: false, total: 0 })
  })

  it('keeps counting after the card is hidden, and shows it again for a new conversion', async () => {
    trackKccJobs([job('a', 'running')])
    dismissKccProgress()
    expect(kccSession.value.visible).toBe(false)
    trackKccJobs([job('b', 'queued')])
    expect(kccSession.value).toMatchObject({ visible: true, total: 2 })
  })

  it('marks conversions BookOrbit forgot (a restart) as failed instead of waiting forever', async () => {
    trackKccJobs([job('a', 'running')])
    api.jobs.mockResolvedValue([])
    await vi.advanceTimersByTimeAsync(3000)
    expect(kccSession.value.jobs[0]).toMatchObject({ state: 'failed', error: expect.stringContaining('restarted') })
    expect(kccSession.value.remaining).toBe(0)
  })
})
