<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatNumber } from '@/i18n/formatters'
import { segmentItem, segmentTrack } from '@/components/browse-header/browse-header'
import { cn } from '@/lib/utils'
import type { UpcomingFilter } from '../lib/upcoming-items'

/** Built like Series' status tabs; each dot wears the color of the cover frames it selects. */
const props = defineProps<{
  filter: UpcomingFilter
  counts: Record<UpcomingFilter, number>
}>()

const emit = defineEmits<{
  select: [filter: UpcomingFilter]
}>()

const { t } = useI18n()

const tabs = computed(() =>
  (
    [
      { value: 'all', dot: null },
      { value: 'out', dot: 'bg-red-500' },
      { value: 'soon', dot: 'bg-amber-400' },
      { value: 'scheduled', dot: 'bg-sky-400' },
      { value: 'waiting', dot: 'border border-dashed border-neutral-400' },
      { value: 'check', dot: 'border border-dashed border-amber-400' },
    ] as const
  ).map((tab) => ({ ...tab, label: t(`seriesReleases.upcoming.filters.${tab.value}`), count: props.counts[tab.value] })),
)
</script>

<template>
  <div :class="cn(segmentTrack, 'upcoming-tabs max-w-full')" role="tablist" :aria-label="t('seriesReleases.upcoming.filters.label')">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      role="tab"
      :class="segmentItem"
      :aria-selected="props.filter === tab.value"
      @click="emit('select', tab.value)"
    >
      <span v-if="tab.dot" class="size-2 shrink-0 rounded-full" :class="tab.dot" aria-hidden="true" />
      {{ tab.label }}
      <span class="text-[11.5px] tabular-nums" :class="props.filter === tab.value ? 'text-primary' : 'text-muted-foreground'">{{
        formatNumber(tab.count)
      }}</span>
    </button>
  </div>
</template>

<style scoped>
@media (max-width: 639px) {
  .upcoming-tabs {
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .upcoming-tabs::-webkit-scrollbar {
    display: none;
  }
}
</style>
