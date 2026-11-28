<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatNumber } from '@/i18n/formatters'
import { segmentItem, segmentTrack } from '@/components/browse-header/browse-header'
import { cn } from '@/lib/utils'
import { useReleaseColors } from '../composables/useReleaseColors'
import type { TrackedReleaseKind } from '../lib/release-state'
import { dotStyle } from '../lib/release-style'
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
const { looks } = useReleaseColors()

const tabs = computed(() =>
  (
    [
      { value: 'all', kind: null },
      { value: 'out', kind: 'overdue' },
      { value: 'soon', kind: 'soon' },
      { value: 'scheduled', kind: 'scheduled' },
      { value: 'waiting', kind: 'undated' },
      { value: 'check', kind: 'check' },
    ] as const satisfies readonly { value: UpcomingFilter; kind: TrackedReleaseKind | null }[]
  ).map((tab) => ({
    value: tab.value,
    dot: tab.kind ? dotStyle(looks.value[tab.kind]) : null,
    label: t(`seriesReleases.upcoming.filters.${tab.value}`),
    count: props.counts[tab.value],
  })),
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
      <span v-if="tab.dot" class="size-2 shrink-0 rounded-full" :style="tab.dot" aria-hidden="true" />
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
