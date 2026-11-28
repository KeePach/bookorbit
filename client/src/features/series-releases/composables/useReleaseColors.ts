import { ref } from 'vue'
import { TRACKED_RELEASE_KINDS, type TrackedReleaseKind } from '../lib/release-state'
import { DEFAULT_RELEASE_LOOKS, type ReleaseLook, type ReleaseLooks } from '../lib/release-style'

export const RELEASE_COLORS_STORAGE_KEY = 'bookorbit:series-release-colors'

const HEX = /^#[0-9a-f]{6}$/i

function defaults(): ReleaseLooks {
  return Object.fromEntries(TRACKED_RELEASE_KINDS.map((kind) => [kind, { ...DEFAULT_RELEASE_LOOKS[kind] }])) as ReleaseLooks
}

/** Whatever was stored, field by field: anything missing or malformed falls back to the default. */
export function sanitizeReleaseLooks(raw: unknown): ReleaseLooks {
  const result = defaults()
  if (!raw || typeof raw !== 'object') return result
  for (const kind of TRACKED_RELEASE_KINDS) {
    const entry = (raw as Record<string, unknown>)[kind]
    if (!entry || typeof entry !== 'object') continue
    const { color, dashed, visible } = entry as Partial<Record<keyof ReleaseLook, unknown>>
    if (typeof color === 'string' && HEX.test(color)) result[kind].color = color.toLowerCase()
    if (typeof dashed === 'boolean') result[kind].dashed = dashed
    if (typeof visible === 'boolean') result[kind].visible = visible
  }
  return result
}

function read(): ReleaseLooks {
  try {
    const raw = localStorage.getItem(RELEASE_COLORS_STORAGE_KEY)
    return sanitizeReleaseLooks(raw ? JSON.parse(raw) : null)
  } catch {
    return defaults()
  }
}

const looks = ref<ReleaseLooks>(read())

function persist(): void {
  try {
    localStorage.setItem(RELEASE_COLORS_STORAGE_KEY, JSON.stringify(looks.value))
  } catch {
    // Storage full or blocked: the colors still apply until the page reloads.
  }
}

/** The status colors, kept in this browser and shared by every cover, card and tab. */
export function useReleaseColors() {
  function setLook(kind: TrackedReleaseKind, patch: Partial<ReleaseLook>): void {
    const next = sanitizeReleaseLooks({ ...looks.value, [kind]: { ...looks.value[kind], ...patch } })
    looks.value = next
    persist()
  }

  function reset(kind?: TrackedReleaseKind): void {
    looks.value = kind ? { ...looks.value, [kind]: { ...DEFAULT_RELEASE_LOOKS[kind] } } : defaults()
    persist()
  }

  function isDefault(kind: TrackedReleaseKind): boolean {
    const look = looks.value[kind]
    const base = DEFAULT_RELEASE_LOOKS[kind]
    return look.color === base.color && look.dashed === base.dashed && look.visible === base.visible
  }

  return { looks, setLook, reset, isDefault }
}

/** Test hook: forget any change and read storage again. */
export function reloadReleaseColors(): void {
  looks.value = read()
}
