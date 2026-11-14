import { describe, expect, it } from 'vitest'

import { parseReleaseBackup, ReleaseBackupError } from './release-backup'

const entry = { sid: 12, title: 'Series', volume: '6', date: '2026-12-19' }

describe('parseReleaseBackup', () => {
  it('reads the wrapped format of version 2 and later', () => {
    const text = JSON.stringify({ version: 3, data: { 'k:s12': entry, 'k:m7': { ...entry, sid: 14 } }, overrides: {}, settings: {} })

    expect(parseReleaseBackup(text)).toEqual([entry, { ...entry, sid: 14 }])
  })

  it('reads the first version, which was the entry map itself', () => {
    expect(parseReleaseBackup(JSON.stringify({ 'k:s12': entry }))).toEqual([entry])
  })

  it('refuses text that is not a backup', () => {
    const reason = (text: string) => {
      try {
        parseReleaseBackup(text)
      } catch (error) {
        return error instanceof ReleaseBackupError ? error.reason : 'other'
      }
      return 'none'
    }

    expect(reason('not json')).toBe('not-json')
    expect(reason('[1, 2]')).toBe('not-a-backup')
    expect(reason('"text"')).toBe('not-a-backup')
    expect(reason(JSON.stringify({ version: 3, data: [] }))).toBe('not-a-backup')
    expect(reason(JSON.stringify({ version: 3, data: {} }))).toBe('empty')
    expect(reason('{}')).toBe('empty')
  })
})
