<script setup lang="ts">
import { computed } from 'vue'
import { useReleaseColors } from '../composables/useReleaseColors'
import { useTrackedRelease } from '../composables/useTrackedRelease'
import { frameStyle } from '../lib/release-style'

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
const { looks } = useReleaseColors()
const frame = computed(() => (kind.value ? frameStyle(kind.value, looks.value[kind.value]) : null))
// A colored frame around the whole cover, so a tracked series stands out in the grid;
// the pill badge next to it carries the date.
</script>

<template>
  <div
    v-if="frame"
    class="absolute inset-0 z-30 pointer-events-none rounded-sm border-2"
    :class="frame.class"
    :style="frame.style"
    aria-hidden="true"
    data-testid="series-release-frame"
  />
</template>
