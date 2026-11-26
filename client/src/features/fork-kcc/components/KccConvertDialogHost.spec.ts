import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { KccConvertCheck, KccConvertJob } from '@bookorbit/types'
import KccConvertDialogHost from './KccConvertDialogHost.vue'
import { useKccConvertDialog } from '../composables/useKccConvertDialog'
import { resetKccJobTracker } from '../lib/kcc-job-tracker'

const api = vi.hoisted(() => ({
  status: vi.fn(),
  options: vi.fn(),
  presets: vi.fn(),
  check: vi.fn(),
  latestJob: vi.fn(),
  convert: vi.fn(),
  job: vi.fn(),
}))

vi.mock('../lib/kcc-api', async (importOriginal) => ({ ...(await importOriginal<object>()), kccApi: api }))

const mounted: VueWrapper[] = []

function check(overrides: Partial<KccConvertCheck> = {}): KccConvertCheck {
  return {
    bookId: 4,
    fileName: 'Akira v01.cbr',
    format: 'cbr',
    alreadyConverted: false,
    canReplace: false,
    replaceBlockedReason: 'This library is set to leave files untouched',
    canKeep: true,
    keepBlockedReason: null,
    keepCopyName: 'Akira v01_kcc.cbz',
    keepCopyExists: false,
    ...overrides,
  }
}

const queued: KccConvertJob = {
  id: '6a1c9f8e-0000-4000-8000-000000000000',
  bookId: 4,
  title: 'Akira',
  mode: 'keep',
  state: 'queued',
  error: null,
  outputName: null,
  ignoredOptions: [],
  createdAt: '2026-11-26T00:00:00.000Z',
  finishedAt: null,
}

async function openDialog() {
  const wrapper = mount(KccConvertDialogHost, { attachTo: document.body })
  mounted.push(wrapper)
  useKccConvertDialog().open({ bookId: 4, title: 'Akira' })
  await flushPromises()
  await flushPromises()
  return wrapper
}

function dialog(): HTMLElement {
  return document.body.querySelector<HTMLElement>('[role="dialog"]')!
}

function button(text: string): HTMLButtonElement {
  return [...dialog().querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement
}

describe('KccConvertDialogHost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    api.status.mockResolvedValue({ configured: true, reachable: true, version: '13.0.4', error: null })
    api.options.mockResolvedValue({ version: '13.0.4', groups: [], profiles: [], managed: [] })
    api.presets.mockResolvedValue([{ id: 2, name: 'Manga', options: { righttoleft: true }, createdAt: '', updatedAt: '' }])
    api.latestJob.mockResolvedValue({ job: null })
    api.check.mockResolvedValue(check())
    api.convert.mockResolvedValue(queued)
    api.job.mockResolvedValue(queued)
  })

  afterEach(() => {
    resetKccJobTracker()
    useKccConvertDialog().close()
    mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  it('offers Keep, explains why Replace is blocked, and converts with the preset', async () => {
    await openDialog()

    expect(dialog().textContent).toContain('Adds Akira v01_kcc.cbz next to it')
    expect(button('Replace original').disabled).toBe(true)
    expect(dialog().textContent).toContain('Replace: This library is set to leave files untouched')

    button('Convert').click()
    await flushPromises()

    expect(api.convert).toHaveBeenCalledWith(4, { mode: 'keep', presetId: 2 })
    expect(dialog().textContent).toContain('Converting...')
  })

  it('asks before converting a file KCC already made', async () => {
    api.check.mockResolvedValue(check({ fileName: 'Done.cbz', format: 'cbz', alreadyConverted: true }))
    await openDialog()

    expect(dialog().textContent).toContain('looks like it was already converted with KCC')
    const convert = [...dialog().querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Convert')[0]
    expect(convert.disabled).toBe(true)

    dialog().querySelector<HTMLButtonElement>('[role="switch"]')!.click()
    await flushPromises()
    convert.click()
    await flushPromises()

    expect(api.convert).toHaveBeenCalledWith(4, { mode: 'keep', presetId: 2, force: true })
  })
})
