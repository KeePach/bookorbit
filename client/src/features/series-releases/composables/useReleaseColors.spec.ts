import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_RELEASE_LOOKS } from '../lib/release-style'
import { RELEASE_COLORS_STORAGE_KEY, reloadReleaseColors, sanitizeReleaseLooks, useReleaseColors } from './useReleaseColors'

describe('sanitizeReleaseLooks', () => {
  it('keeps valid fields and falls back to the defaults for the rest', () => {
    const looks = sanitizeReleaseLooks({ soon: { color: '#ABCDEF', dashed: 'yes' }, finished: { visible: true }, bogus: { color: '#000000' } })
    expect(looks.soon).toEqual({ color: '#abcdef', dashed: false, visible: true })
    expect(looks.finished).toEqual({ ...DEFAULT_RELEASE_LOOKS.finished, visible: true })
    expect(looks.today).toEqual(DEFAULT_RELEASE_LOOKS.today)
    expect(sanitizeReleaseLooks({ today: { color: 'red' } }).today.color).toBe(DEFAULT_RELEASE_LOOKS.today.color)
    expect(sanitizeReleaseLooks('nope')).toEqual(DEFAULT_RELEASE_LOOKS)
  })
})

describe('useReleaseColors', () => {
  beforeEach(() => {
    localStorage.removeItem(RELEASE_COLORS_STORAGE_KEY)
    reloadReleaseColors()
  })

  it('stores a change and reads it back', () => {
    const { setLook, isDefault } = useReleaseColors()
    setLook('caughtUp', { color: '#10b981', dashed: false })
    expect(isDefault('caughtUp')).toBe(false)
    reloadReleaseColors()
    expect(useReleaseColors().looks.value.caughtUp).toEqual({ color: '#10b981', dashed: false, visible: true })
  })

  it('resets one status or all of them', () => {
    const { setLook, reset, looks } = useReleaseColors()
    setLook('today', { color: '#000000' })
    setLook('soon', { visible: false })
    reset('today')
    expect(looks.value.today).toEqual(DEFAULT_RELEASE_LOOKS.today)
    expect(looks.value.soon.visible).toBe(false)
    reset()
    expect(looks.value).toEqual(DEFAULT_RELEASE_LOOKS)
  })

  it('ignores unreadable storage', () => {
    localStorage.setItem(RELEASE_COLORS_STORAGE_KEY, '{not json')
    reloadReleaseColors()
    expect(useReleaseColors().looks.value).toEqual(DEFAULT_RELEASE_LOOKS)
  })
})
