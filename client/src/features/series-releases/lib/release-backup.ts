import type { SeriesReleaseImportEntry } from '@bookorbit/types'

export class ReleaseBackupError extends Error {
  readonly reason: 'not-json' | 'not-a-backup' | 'empty'

  constructor(reason: 'not-json' | 'not-a-backup' | 'empty') {
    super(reason)
    this.name = 'ReleaseBackupError'
    this.reason = reason
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The entries of a `bookorbit-next-releases.json` backup. Version 2 and later wrap the entries in
 * `{ version, data }`; the first version was the entry map itself, and both are read.
 */
export function parseReleaseBackup(text: string): SeriesReleaseImportEntry[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ReleaseBackupError('not-json')
  }
  if (!isRecord(parsed)) throw new ReleaseBackupError('not-a-backup')

  const wrapped = typeof parsed.version === 'number' && parsed.version >= 2
  if (wrapped && !isRecord(parsed.data)) throw new ReleaseBackupError('not-a-backup')
  const source = wrapped ? (parsed.data as Record<string, unknown>) : parsed

  const entries = Object.values(source).filter(isRecord) as SeriesReleaseImportEntry[]
  if (entries.length === 0) throw new ReleaseBackupError('empty')
  return entries
}
