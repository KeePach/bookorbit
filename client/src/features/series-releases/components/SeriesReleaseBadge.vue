<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarClock } from '@lucide/vue'
import { formatDate } from '@/i18n/formatters'
import { useReleaseColors } from '../composables/useReleaseColors'
import { useTrackedRelease } from '../composables/useTrackedRelease'
import { daysUntil, parseLocalDay } from '../lib/release-state'
import { chipStyle, overlayTextStyle } from '../lib/release-style'

const props = withDefaults(
  defineProps<{
    /** Null or undefined for a book that belongs to no series: nothing renders. */
    seriesId?: number | null
    /** A book can sit in several series; the badge shows the tracked one with the nearest date. */
    seriesIds?: (number | null | undefined)[]
    /** `chip` sits in a card's text rows; `overlay` matches the dark pills on a book cover. */
    variant?: 'chip' | 'overlay'
    /** Today, for tests; the real clock otherwise. */
    now?: Date
  }>(),
  { variant: 'chip' },
)

const { t } = useI18n()

const { badge, kind } = useTrackedRelease(
  () => [props.seriesId, ...(props.seriesIds ?? [])],
  () => props.now,
)

const label = computed(() => {
  const value = badge.value
  switch (kind.value) {
    case 'today':
      return t('seriesReleases.badge.today')
    case 'overdue':
      return t('seriesReleases.badge.out')
    case 'soon':
      return t('seriesReleases.badge.inDays', { count: daysUntil(value!.releaseDate, props.now) ?? 0 })
    case 'scheduled': {
      const day = value!.releaseDate ? parseLocalDay(value!.releaseDate) : null
      return day ? formatDate(day, { month: 'short', day: 'numeric' }) : ''
    }
    case 'check':
      return t('seriesReleases.badge.check')
    case 'caughtUp':
      return t('seriesReleases.badge.upToDate')
    case 'finished':
      return t('seriesReleases.badge.finished')
    default:
      return t('seriesReleases.badge.noDate')
  }
})

const { looks } = useReleaseColors()
const chip = computed(() => (kind.value ? chipStyle(kind.value, looks.value[kind.value]) : null))
/** The cover pills sit on black, so the state lives in the text color alone. */
const overlay = computed(() => (kind.value ? overlayTextStyle(kind.value, looks.value[kind.value]) : null))

const title = computed(() => {
  if (kind.value === 'finished') return t('seriesReleases.finishedNote')
  return badge.value ? t('seriesReleases.badge.title', { count: badge.value.count }) : undefined
})
</script>

<template>
  <span
    v-if="overlay && variant === 'overlay'"
    class="flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5"
    :class="overlay.class"
    :style="overlay.style"
    :title="title"
    data-testid="series-release-badge"
  >
    <CalendarClock :size="9" />
    <span class="text-[9px] font-bold leading-none">{{ label }}</span>
  </span>
  <span
    v-else-if="chip"
    class="inline-flex h-[21px] shrink-0 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-semibold"
    :class="chip.class"
    :style="chip.style"
    :title="title"
    data-testid="series-release-badge"
  >
    <CalendarClock :size="12" />
    {{ label }}
  </span>
</template>
