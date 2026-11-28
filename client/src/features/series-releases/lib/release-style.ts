import type { TrackedReleaseKind } from './release-state'

/** How one release status looks: the color and line style of its frames, and whether covers show it at all. */
export interface ReleaseLook {
  /** `#rrggbb`, what a color input reads and writes. */
  color: string
  dashed: boolean
  visible: boolean
}

export type ReleaseLooks = Record<TrackedReleaseKind, ReleaseLook>

/**
 * One color per release state, shared by the cover frames, the Upcoming cards and its tabs, so a
 * green frame in the library means the same thing as a green tab on the Upcoming page. Solid for
 * dated states, dashed while no date is known (amber once a check is due). The hex values are the
 * Tailwind shades the classes below use. A finished series showed nothing before, so it stays hidden
 * until switched on.
 */
export const DEFAULT_RELEASE_LOOKS: ReleaseLooks = {
  overdue: { color: '#ef4444', dashed: false, visible: true },
  today: { color: '#34d399', dashed: false, visible: true },
  soon: { color: '#fbbf24', dashed: false, visible: true },
  scheduled: { color: '#38bdf8', dashed: false, visible: true },
  undated: { color: '#a3a3a3', dashed: true, visible: true },
  check: { color: '#fbbf24', dashed: true, visible: true },
  caughtUp: { color: '#a3a3a3', dashed: true, visible: true },
  finished: { color: '#a78bfa', dashed: false, visible: false },
}

const FRAME_CLASSES: Record<TrackedReleaseKind, string> = {
  today: 'border-emerald-400',
  soon: 'border-amber-400',
  overdue: 'border-red-500',
  scheduled: 'border-sky-400',
  check: 'border-amber-400',
  undated: 'border-neutral-400/80',
  caughtUp: 'border-neutral-400/80',
  finished: 'border-violet-400',
}

/** The dark pills on covers: the state lives in the text color alone. */
const OVERLAY_TEXT_CLASSES: Record<TrackedReleaseKind, string> = {
  today: 'text-emerald-400',
  soon: 'text-amber-400',
  overdue: 'text-red-400',
  scheduled: 'text-sky-300',
  check: 'text-amber-400',
  undated: 'text-neutral-300',
  caughtUp: 'text-neutral-300',
  finished: 'text-violet-300',
}

/** Tinted chips in text rows. */
const CHIP_CLASSES: Record<TrackedReleaseKind, string> = {
  today: 'bg-success/15 text-success',
  soon: 'bg-warning/15 text-warning',
  overdue: 'bg-destructive/15 text-destructive',
  scheduled: 'bg-primary/10 text-primary',
  check: 'bg-warning/15 text-warning',
  undated: 'bg-muted text-muted-foreground',
  caughtUp: 'bg-muted text-muted-foreground',
  finished: 'bg-violet-500/15 text-violet-500',
}

export interface SurfaceStyle {
  class: string
  style: Record<string, string>
}

/** The color at `percent` strength over whatever is behind it. */
export function tint(color: string, percent: number): string {
  return `color-mix(in oklab, ${color} ${percent}%, transparent)`
}

/**
 * Until a color is changed the theme-aware classes stay in charge (chips follow light and dark mode);
 * a picked color is applied inline.
 */
export function isCustomColor(kind: TrackedReleaseKind, look: ReleaseLook): boolean {
  return look.color.toLowerCase() !== DEFAULT_RELEASE_LOOKS[kind].color
}

export function frameStyle(kind: TrackedReleaseKind, look: ReleaseLook): SurfaceStyle {
  const custom = isCustomColor(kind, look)
  return {
    class: custom ? '' : FRAME_CLASSES[kind],
    style: { borderStyle: look.dashed ? 'dashed' : 'solid', ...(custom ? { borderColor: look.color } : {}) },
  }
}

export function overlayTextStyle(kind: TrackedReleaseKind, look: ReleaseLook): SurfaceStyle {
  return isCustomColor(kind, look) ? { class: '', style: { color: look.color } } : { class: OVERLAY_TEXT_CLASSES[kind], style: {} }
}

export function chipStyle(kind: TrackedReleaseKind, look: ReleaseLook): SurfaceStyle {
  return isCustomColor(kind, look)
    ? { class: '', style: { color: look.color, backgroundColor: tint(look.color, 15) } }
    : { class: CHIP_CLASSES[kind], style: {} }
}

/** The small marker on a status tab or a settings row: filled when solid, an outline when dashed. */
export function dotStyle(look: ReleaseLook): Record<string, string> {
  return look.dashed ? { border: `1px dashed ${look.color}` } : { backgroundColor: look.color }
}
