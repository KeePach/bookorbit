<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarClock } from '@lucide/vue'
import { formatDate } from '@/i18n/formatters'
import { useReleaseOverview } from '../composables/useReleaseOverview'
import { daysUntil, parseLocalDay, seriesBadge } from '../lib/release-state'

const props = defineProps<{
  seriesId: number
  /** Today, for tests; the real clock otherwise. */
  now?: Date
}>()

const { t } = useI18n()
const { bySeries, ensure } = useReleaseOverview()

onMounted(() => void ensure())

const badge = computed(() => {
  const series = bySeries.value.get(props.seriesId)
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

const CLASSES: Record<string, string> = {
  today: 'bg-success/15 text-success',
  soon: 'bg-warning/15 text-warning',
  overdue: 'bg-destructive/15 text-destructive',
  scheduled: 'bg-primary/10 text-primary',
  check: 'bg-warning/15 text-warning',
  undated: 'bg-muted text-muted-foreground',
}

const title = computed(() => (badge.value ? t('seriesReleases.badge.title', { count: badge.value.count }) : undefined))
</script>

<template>
  <span
    v-if="kind"
    class="inline-flex h-[21px] shrink-0 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-semibold"
    :class="CLASSES[kind]"
    :title="title"
    data-testid="series-release-badge"
  >
    <CalendarClock :size="12" />
    {{ label }}
  </span>
</template>
