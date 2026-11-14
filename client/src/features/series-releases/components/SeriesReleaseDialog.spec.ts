import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { SeriesRelease } from '@bookorbit/types'
import SeriesReleaseDialog from './SeriesReleaseDialog.vue'

const mounted: VueWrapper[] = []

function release(overrides: Partial<SeriesRelease> = {}): SeriesRelease {
  return {
    id: 1,
    seriesId: 3,
    volume: '6',
    releaseDate: '2026-12-19',
    storeUrl: 'https://store.example/6',
    note: 'Pre-order',
    cover: null,
    status: 'upcoming',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  }
}

/** The dialog renders into a portal a tick after mounting, so wait for it before anything looks inside. */
async function mountDialog(props: Record<string, unknown> = {}) {
  const wrapper = mount(SeriesReleaseDialog, { props: { open: true, release: null, ...props }, attachTo: document.body })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

function dialog(): HTMLElement {
  return document.body.querySelector<HTMLElement>('[role="dialog"]')!
}

function field(selector: string): HTMLInputElement {
  return dialog().querySelector<HTMLInputElement>(selector)!
}

async function type(selector: string, value: string) {
  const input = field(selector)
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

async function submit() {
  dialog().querySelector('form')!.dispatchEvent(new Event('submit'))
  await flushPromises()
}

describe('SeriesReleaseDialog', () => {
  afterEach(() => {
    while (mounted.length > 0) mounted.pop()!.unmount()
    document.body.innerHTML = ''
  })

  it('adds a volume with only the volume filled in', async () => {
    const wrapper = await mountDialog()
    await type('input[type="text"]', '  Vol. 7 ')

    await submit()

    expect(wrapper.emitted('submit')?.[0]).toEqual([{ volume: 'Vol. 7', releaseDate: null, storeUrl: null, note: null, cover: null }])
    expect(dialog().textContent).not.toContain('Got it')
  })

  it('does not submit without a volume', async () => {
    const wrapper = await mountDialog()

    await submit()

    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('fills the form from the volume being edited and offers delete and collect', async () => {
    const wrapper = await mountDialog({ release: release() })
    await flushPromises()

    expect(field('input[type="text"]').value).toBe('6')
    expect(field('input[type="date"]').value).toBe('2026-12-19')
    expect(field('input[type="url"]').value).toBe('https://store.example/6')
    expect(dialog().textContent).toContain('Got it')
    expect(dialog().textContent).toContain('Delete')

    await submit()
    expect(wrapper.emitted('submit')?.[0]).toEqual([
      { volume: '6', releaseDate: '2026-12-19', storeUrl: 'https://store.example/6', note: 'Pre-order', cover: null },
    ])
  })

  it('clears a date that was emptied, so the server removes it', async () => {
    const wrapper = await mountDialog({ release: release() })
    await flushPromises()
    await type('input[type="date"]', '')

    await submit()

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ releaseDate: null })
  })

  it('reports collect, delete and cancel', async () => {
    const wrapper = await mountDialog({ release: release() })
    await flushPromises()
    const buttons = [...dialog().querySelectorAll<HTMLButtonElement>('button')]

    buttons.find((button) => button.textContent?.includes('Got it'))!.click()
    buttons.find((button) => button.textContent?.includes('Delete'))!.click()
    buttons.find((button) => button.textContent?.includes('Cancel'))!.click()

    expect(wrapper.emitted('collect')).toHaveLength(1)
    expect(wrapper.emitted('remove')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('shows the server error', async () => {
    await mountDialog({ error: 'This volume is already listed as upcoming.' })
    await flushPromises()

    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('already listed')
  })
})
