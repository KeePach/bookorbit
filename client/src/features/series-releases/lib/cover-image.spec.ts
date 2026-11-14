import { describe, expect, it } from 'vitest'

import { fitWithin } from './cover-image'

describe('fitWithin', () => {
  it('shrinks a wide picture to the limit and keeps its proportions', () => {
    expect(fitWithin(1200, 1800, 480)).toEqual({ width: 480, height: 720 })
  })

  it('never enlarges a small picture', () => {
    expect(fitWithin(300, 450, 480)).toEqual({ width: 300, height: 450 })
  })

  it('gives nothing for an empty picture', () => {
    expect(fitWithin(0, 100, 480)).toEqual({ width: 0, height: 0 })
  })
})
