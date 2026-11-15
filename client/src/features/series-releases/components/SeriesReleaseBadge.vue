<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarClock } from '@lucide/vue'
import { formatDate } from '@/i18n/formatters'
import { useReleaseOverview } from '../composables/useReleaseOverview'
import { daysUntil, parseLocalDay, seriesBadge } from '../lib/release-state'

const props = withDefaults(
  defineProps<{
    /** Null or undefined for a book that belongs to no series: nothing renders. */
    seriesId: number | null | undefined
    /** `chip` sits in a card's text rows; `overlay` matches the dark pills on a book cover. */
    variant?: 'chip' | 'overlay'
    /** Today, for tests; the real clock otherwise. */
    now?: Date
  }>(),
  { variant: 'chip' },
)

const { t } = useI18n()
const { bySeries, ensure } = useReleaseOverview()

onMounted(() => void ensure())

const badge = computed(() => {
  const series = props.seriesId != null ? bySeries.value.get(props.seriesId) : undefined
  return series ? seriesBadge(series, props.now) : null
})

/** The check reminder outranks a quiet "no date"; a real date outranks both. */
const kind = computed(() => {
  if (!badge.value) return null
  return badge.value.state === 'undated' && badge.value.checkDue ? 'check' : badge.value.state
})

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
    default:
      return t('seriesReleases.badge.noDate')
  }
})

const CHIP_CLASSES: Record<string, string> = {
  today: 'bg-success/15 text-success',
  soon: 'bg-warning/15 text-warning',
  overdue: 'bg-destructive/15 text-destructive',
  scheduled: 'bg-primary/10 text-primary',
  check: 'bg-warning/15 text-warning',
  undated: 'bg-muted text-muted-foreground',
}

/** The cover pills sit on black, so the state lives in the text color alone. */
const OVERLAY_CLASSES: Record<string, string> = {
  today: 'text-emerald-400',
  soon: 'text-amber-400',
  overdue: 'text-red-400',
  scheduled: 'text-sky-300',
  check: 'text-amber-400',
  undated: 'text-neutral-300',
}

const title = computed(() => (badge.value ? t('seriesReleases.badge.title', { count: badge.value.count }) : undefined))
</script>

<template>
  <span
    v-if="kind && variant === 'overlay'"
    class="flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5"
    :title="title"
    data-testid="series-release-badge"
  >
    <CalendarClock :size="9" :class="OVERLAY_CLASSES[kind]" />
    <span class="text-[9px] font-bold leading-none" :class="OVERLAY_CLASSES[kind]">{{ label }}</span>
  </span>
  <span
    v-else-if="kind"
    class="inline-flex h-[21px] shrink-0 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-semibold"
    :class="CHIP_CLASSES[kind]"
    :title="title"
    data-testid="series-release-badge"
  >
    <CalendarClock :size="12" />
    {{ label }}
  </span>
</template>
