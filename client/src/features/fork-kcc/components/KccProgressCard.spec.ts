import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import type { KccConvertJob, KccJobList } from '@bookorbit/types'
import KccProgressCard from './KccProgressCard.vue'
import { kccProgress, resetKccJobTracker, trackKccJobs } from '../lib/kcc-job-tracker'

vi.mock('../lib/kcc-api', () => ({ kccApi: { jobs: vi.fn<() => Promise<KccJobList>>().mockResolvedValue({ jobs: [], serverTime: '', bootId: 'b' }) } }))
vi.mock('@/features/auth/composables/usePermissions', () => ({ usePermissions: () => ({ hasPermission: () => false }) }))

function job(id: string, state: KccConvertJob['state']): KccConvertJob {
  return {
    id,
    bookId: 3,
    title: `Teppu Vol. ${id}`,
    mode: 'keep',
    state,
    error: null,
    outputName: null,
    warning: null,
    removedPages: 0,
    ignoredOptions: [],
    createdAt: '',
    finishedAt: null,
    updatedAt: '',
  }
}

describe('KccProgressCard', () => {
  afterEach(() => resetKccJobTracker())

  it('shows the batch like the metadata card, and the X hides it', async () => {
    trackKccJobs([job('4', 'running'), job('5', 'queued')])
    const wrapper = mount(KccProgressCard, { global: { stubs: { RouterLink: RouterLinkStub } } })
    await flushPromises()

    expect(wrapper.text()).toContain('Converting with KCC')
    expect(wrapper.text()).toContain('0 of 2 done')
    expect(wrapper.text()).toContain('Teppu Vol. 4')

    await wrapper.get('button[aria-label="Hide KCC progress"]').trigger('click')
    expect(kccProgress.dismissed).toBe(true)
    expect(wrapper.text()).toBe('')
  })
})
