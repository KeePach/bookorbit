import type { TrackedReleaseKind } from '../composables/useTrackedRelease'

/**
 * One color per release state, shared by the cover frames, the Upcoming cards and its tabs, so a
 * green frame in the library means the same thing as a green tab on the Upcoming page. Solid for
 * dated states, dashed while no date is known (amber once a check is due).
 */
export const FRAME_CLASSES: Record<TrackedReleaseKind, string> = {
  today: 'border-emerald-400',
  soon: 'border-amber-400',
  overdue: 'border-red-500',
  scheduled: 'border-sky-400',
  check: 'border-dashed border-amber-400',
  undated: 'border-dashed border-neutral-400/80',
}

/** The dark pills on covers: the state lives in the text color alone. */
export const OVERLAY_TEXT_CLASSES: Record<TrackedReleaseKind, string> = {
  today: 'text-emerald-400',
  soon: 'text-amber-400',
  overdue: 'text-red-400',
  scheduled: 'text-sky-300',
  check: 'text-amber-400',
  undated: 'text-neutral-300',
}

/** Tinted chips in text rows. */
export const CHIP_CLASSES: Record<TrackedReleaseKind, string> = {
  today: 'bg-success/15 text-success',
  soon: 'bg-warning/15 text-warning',
  overdue: 'bg-destructive/15 text-destructive',
  scheduled: 'bg-primary/10 text-primary',
  check: 'bg-warning/15 text-warning',
  undated: 'bg-muted text-muted-foreground',
}
