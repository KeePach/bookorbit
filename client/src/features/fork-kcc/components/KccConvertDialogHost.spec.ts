import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { KccConvertCheck, KccConvertJob } from '@bookorbit/types'
import KccConvertDialogHost from './KccConvertDialogHost.vue'
import type { kccApi } from '../lib/kcc-api'
import { useKccConvertDialog } from '../composables/useKccConvertDialog'
import { kccProgress, resetKccJobTracker } from '../lib/kcc-job-tracker'

type KccApi = typeof kccApi

const api = vi.hoisted(() => ({
  pages: vi.fn<KccApi['pages']>(),
  convertMany: vi.fn<KccApi['convertMany']>(),
  jobs: vi.fn<KccApi['jobs']>(),
  createPreset: vi.fn<KccApi['createPreset']>(),
  updatePreset: vi.fn<KccApi['updatePreset']>(),
  status: vi.fn<KccApi['status']>(),
  options: vi.fn<KccApi['options']>(),
  presets: vi.fn<KccApi['presets']>(),
  check: vi.fn<KccApi['check']>(),
  latestJob: vi.fn<KccApi['latestJob']>(),
  convert: vi.fn<KccApi['convert']>(),
  job: vi.fn<KccApi['job']>(),
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
    replaceBlockedReason: "Replace isn't allowed in this library. Turn on Write to file and Rename files for it in Settings > Libraries.",
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
  warning: null,
  removedPages: 0,
  ignoredOptions: [],
  createdAt: '2026-11-26T00:00:00.000Z',
  finishedAt: null,
  updatedAt: '2026-11-26T00:00:00.000Z',
}

async function openDialog(bookIds = [4], query = false) {
  const wrapper = mount(KccConvertDialogHost, { attachTo: document.body, global: { stubs: { KccOptionsForm: true } } })
  mounted.push(wrapper)
  if (query) useKccConvertDialog().openForSelection({ query: { libraryId: 9 } as never }, 1987)
  else
    useKccConvertDialog().open({ selection: { bookIds }, count: bookIds.length, title: bookIds.length === 1 ? 'Akira' : `${bookIds.length} books` })
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
    api.jobs.mockResolvedValue({ jobs: [queued], serverTime: '2026-11-26T00:00:01.000Z', bootId: 'b1' })
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
    expect(button('Replace original').textContent).toContain(
      "Replace isn't allowed in this library. Turn on Write to file and Rename files for it in Settings > Libraries.",
    )

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

  it('saves options chosen in the dialog as a new preset and selects it', async () => {
    api.presets.mockResolvedValue([])
    api.createPreset.mockResolvedValue({ id: 7, name: 'Manga LC', options: {}, createdAt: '', updatedAt: '' })
    await openDialog()

    button('Choose options').click()
    await flushPromises()
    const name = dialog().querySelector<HTMLInputElement>('input[aria-label="New preset name"]')!
    name.value = 'Manga LC'
    name.dispatchEvent(new Event('input'))
    await flushPromises()
    button('Save as new preset').click()
    await flushPromises()

    expect(api.createPreset).toHaveBeenCalledWith({ name: 'Manga LC', options: {} })
    expect(dialog().querySelector<HTMLSelectElement>('#kcc-convert-preset')!.value).toBe('7')
  })

  it('converts a selection as one batch and lists what was skipped', async () => {
    api.convertMany.mockResolvedValue({ jobs: [queued], skipped: [{ bookId: 5, title: 'A novel', reason: 'EPUB is not a comic' }] })
    await openDialog([4, 5])

    expect(api.check).not.toHaveBeenCalled()
    button('Convert 2 books').click()
    await flushPromises()

    expect(api.convertMany).toHaveBeenCalledWith({ mode: 'keep', presetId: 2, selection: { bookIds: [4, 5] } })
    expect(dialog().textContent).toContain('1 book is queued')
    expect(dialog().textContent).toContain('A novel: EPUB is not a comic')
  })

  it('converts every book matching the library view, not only the loaded rows', async () => {
    api.convertMany.mockResolvedValue({ jobs: [queued], skipped: [] })
    await openDialog([], true)

    expect(dialog().textContent).toContain('1,987 books')
    button('Convert 1,987 books').click()
    await flushPromises()

    expect(api.convertMany).toHaveBeenCalledWith({ mode: 'keep', presetId: 2, selection: { query: { libraryId: 9 } } })
  })

  it('leaves out the pages removed on the Pages tab, with shift-click ranges and undo', async () => {
    api.pages.mockResolvedValue({ supported: true, reason: null, pageCount: 5, version: 'h1' })
    await openDialog()

    button('Pages').click()
    await flushPromises()
    const page = (n: number) => dialog().querySelector<HTMLButtonElement>(`button[aria-label="Page ${n}"]`)!
    expect(page(1).querySelector('img')!.getAttribute('src')).toBe('/api/v1/fork/kcc/books/4/pages/0/thumb?v=h1')

    page(2).click()
    await flushPromises()
    page(3).dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))
    await flushPromises()
    button('Remove selected').click()
    await flushPromises()

    expect(page(2)).toBeNull()
    expect(dialog().textContent).toContain('Removed 2 pages: 2-3')
    expect(dialog().textContent).toContain('Pages (2 removed)')

    page(5).click()
    await flushPromises()
    button('Remove selected').click()
    await flushPromises()
    button('Undo').click()
    await flushPromises()
    expect(page(5)).not.toBeNull()

    button('Convert').click()
    await flushPromises()
    expect(api.convert).toHaveBeenCalledWith(4, { mode: 'keep', presetId: 2, removePages: [1, 2] })
  })

  it('says a PDF has no page choice', async () => {
    api.check.mockResolvedValue(check({ fileName: 'Scan.pdf', format: 'pdf' }))
    api.pages.mockResolvedValue({ supported: false, reason: "Choosing pages isn't supported for PDF files", pageCount: 0, version: 'h1' })
    await openDialog()

    button('Pages').click()
    await flushPromises()
    expect(dialog().textContent).toContain("Choosing pages isn't supported for PDF files. The whole file is converted.")
  })

  it('after converting, offers to convert again behind the already-converted warning, with the pages tab reset', async () => {
    api.pages.mockResolvedValue({ supported: true, reason: null, pageCount: 3, version: 'v1' })
    api.convert.mockResolvedValue({ ...queued, state: 'running', mode: 'replace' })
    api.check.mockResolvedValue(check({ fileName: 'Ch 2.cbz', format: 'cbz', canReplace: true, replaceBlockedReason: null }))
    await openDialog()
    button('Pages').click()
    await flushPromises()
    dialog().querySelector<HTMLButtonElement>('button[aria-label="Page 1"]')!.click()
    await flushPromises()
    button('Remove selected').click()
    await flushPromises()
    button('Options').click()
    await flushPromises()
    button('Convert').click()
    await flushPromises()
    expect(api.convert).toHaveBeenCalledWith(4, { mode: 'keep', presetId: 2, removePages: [0] })

    // The tracker sees the job finish; the file is now KCC output.
    api.check.mockResolvedValue(check({ fileName: 'Ch 2.cbz', format: 'cbz', alreadyConverted: true }))
    api.pages.mockResolvedValue({ supported: true, reason: null, pageCount: 4, version: 'v2' })
    kccProgress.jobs.set(queued.id, { ...queued, state: 'done', outputName: 'Ch 2.cbz' })
    await flushPromises()
    await flushPromises()

    expect(dialog().textContent).toContain('Ch 2.cbz looks like it was already converted with KCC')
    expect(dialog().textContent).not.toContain('removed)')
    const convert = [...dialog().querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Convert')[0]
    expect(convert.disabled).toBe(true)
    dialog().querySelector<HTMLButtonElement>('[role="switch"]')!.click()
    await flushPromises()
    expect(convert.disabled).toBe(false)

    button('Pages').click()
    await flushPromises()
    expect(dialog().querySelector('button[aria-label="Page 1"] img')!.getAttribute('src')).toBe('/api/v1/fork/kcc/books/4/pages/0/thumb?v=v2')
  })
})
