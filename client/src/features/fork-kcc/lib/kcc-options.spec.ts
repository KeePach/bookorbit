import { describe, expect, it } from 'vitest'
import type { KccOptionDef } from '@bookorbit/types'
import { optionValue, withOptionValue } from './kcc-options'

const manga: KccOptionDef = { dest: 'righttoleft', flags: ['-m', '--manga-style'], kind: 'bool', default: false, help: '' }
const cropping: KccOptionDef = { dest: 'cropping', flags: ['-c', '--cropping'], kind: 'int', default: 2, help: '' }
const gamma: KccOptionDef = { dest: 'gamma', flags: ['-g'], kind: 'float', default: 0, help: '' }

describe('kcc options', () => {
  it('stores only changes from KCC defaults', () => {
    let values = withOptionValue({}, manga, true)
    values = withOptionValue(values, cropping, 1)
    expect(values).toEqual({ righttoleft: true, cropping: 1 })
    values = withOptionValue(values, manga, false)
    values = withOptionValue(values, cropping, 2)
    expect(values).toEqual({})
  })

  it('clears a number field back to the default', () => {
    expect(withOptionValue({ gamma: 1.8 }, gamma, null)).toEqual({})
    expect(withOptionValue({ gamma: 1.8 }, gamma, Number.NaN)).toEqual({})
  })

  it('reads the default for options left alone', () => {
    expect(optionValue({}, cropping)).toBe(2)
    expect(optionValue({ cropping: 0 }, cropping)).toBe(0)
  })
})
