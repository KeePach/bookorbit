<script setup lang="ts">
import { useTrackedRelease, type TrackedReleaseKind } from '../composables/useTrackedRelease'

const props = defineProps<{
  /** Null or undefined for a book that belongs to no series: nothing renders. */
  seriesId?: number | null
  /** A book can sit in several series; the frame follows the tracked one with the nearest date. */
  seriesIds?: (number | null | undefined)[]
  /** Today, for tests; the real clock otherwise. */
  now?: Date
}>()

const { kind } = useTrackedRelease(
  () => [props.seriesId, ...(props.seriesIds ?? [])],
  () => props.now,
)

/**
 * A colored frame around the whole cover, so a tracked series stands out in the
 * grid; the pill badge next to it carries the date. Solid for dated states,
 * dashed when there is no date yet (amber when a check is due).
 */
const FRAME_CLASSES: Record<TrackedReleaseKind, string> = {
  today: 'border-emerald-400',
  soon: 'border-amber-400',
  overdue: 'border-red-500',
  scheduled: 'border-sky-400',
  check: 'border-dashed border-amber-400',
  undated: 'border-dashed border-neutral-400/80',
}
</script>

<template>
  <div
    v-if="kind"
    class="absolute inset-0 z-30 pointer-events-none rounded-sm border-2"
    :class="FRAME_CLASSES[kind]"
    aria-hidden="true"
    data-testid="series-release-frame"
  />
</template>
