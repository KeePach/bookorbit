import { describe, expect, it } from 'vitest'
import { clickPage, describePages, keptPages } from './kcc-page-selection'

describe('kcc page selection', () => {
  it('lists the pages left after removing some', () => {
    expect(keptPages(6, [1, 5])).toEqual([0, 2, 3, 4])
  })

  it('toggles one page per click and selects a range with shift', () => {
    const shown = [0, 2, 3, 4, 7]
    let state = clickPage(new Set(), shown, 2, null, false)
    expect([...state.selected]).toEqual([2])
    state = clickPage(state.selected, shown, 7, state.anchor, true)
    expect([...state.selected].sort((a, b) => a - b)).toEqual([2, 3, 4, 7])
    state = clickPage(state.selected, shown, 3, state.anchor, false)
    expect([...state.selected].sort((a, b) => a - b)).toEqual([2, 4, 7])
  })

  it('describes removed pages as 1-based ranges', () => {
    expect(describePages([2, 46, 47, 48, 119])).toBe('3, 47-49, 120')
    expect(describePages([])).toBe('')
  })
})
