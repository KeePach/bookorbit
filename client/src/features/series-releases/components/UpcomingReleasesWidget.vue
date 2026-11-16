<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { BookDashed, CalendarClock } from '@lucide/vue'
import { formatDate } from '@/i18n/formatters'
import { useCoverVersions } from '@/features/book/composables/useCoverVersions'
import { useReleaseOverview } from '../composables/useReleaseOverview'
import { daysUntil } from '../lib/release-state'
import { FRAME_CLASSES, OVERLAY_TEXT_CLASSES } from '../lib/release-style'
import { buildUpcomingItems, releaseCoverUrl, sortItems, type UpcomingItem } from '../lib/upcoming-items'

/**
 * The dashboard's window onto the Upcoming page: the next few announced volumes with their covers,
 * and how many series still wait on a date. It reads the same cached overview as the cover frames,
 * so it costs the dashboard nothing beyond what the library grids already load.
 */
const props = withDefaults(defineProps<{ now?: Date; limit?: number }>(), { limit: 4 })

const { t } = useI18n()
const { overview, loaded, failed, ensure } = useReleaseOverview()
const { coverUrl } = useCoverVersions()

onMounted(() => void ensure())

const items = computed(() => buildUpcomingItems(overview.value?.series ?? [], props.now))
const next = computed(() =>
  sortItems(
    items.value.filter((item) => item.day !== null),
    'date',
    'asc',
  ).slice(0, props.limit),
)
const waitingCount = computed(() => new Set(items.value.filter((item) => item.day === null).map((item) => item.seriesId)).size)

function cover(item: UpcomingItem): string | null {
  return releaseCoverUrl(item.release) ?? (item.coverBookId !== null ? coverUrl(item.coverBookId) : null)
}

function when(item: UpcomingItem): string {
  if (item.kind === 'today') return t('seriesReleases.badge.today')
  if (item.kind === 'overdue') return t('seriesReleases.badge.out')
  if (item.kind === 'soon') return t('seriesReleases.badge.inDays', { count: daysUntil(item.release?.releaseDate ?? null, props.now) ?? 0 })
  return item.day ? formatDate(item.day, { month: 'short', day: 'numeric' }) : ''
}
</script>

<template>
  <div class="flex h-full flex-col p-3" data-testid="upcoming-releases-widget">
    <div class="mb-2.5 flex items-center gap-2 self-start">
      <CalendarClock :size="16" class="text-primary" aria-hidden="true" />
      <span class="text-[15px] font-semibold text-foreground">{{ t('seriesReleases.upcoming.widget.title') }}</span>
    </div>

    <div v-if="!loaded && !failed" class="flex flex-1 items-start gap-2">
      <div v-for="n in limit" :key="n" class="aspect-[2/3] flex-1 animate-pulse rounded-xs bg-muted" />
    </div>

    <div v-else-if="failed" class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      {{ t('dashboard.common.failedToLoad') }}
    </div>

    <div v-else-if="next.length === 0" class="flex flex-1 flex-col items-center justify-center gap-2">
      <div class="flex size-10 items-center justify-center rounded-full bg-muted">
        <CalendarClock :size="16" class="text-muted-foreground" aria-hidden="true" />
      </div>
      <p class="text-center text-xs text-muted-foreground">{{ t('seriesReleases.upcoming.widget.empty') }}</p>
    </div>

    <div v-else class="flex flex-1 items-start gap-2">
      <RouterLink
        v-for="item in next"
        :key="item.key"
        :to="{ name: 'series-detail', params: { seriesId: item.seriesId } }"
        class="group min-w-0 flex-1"
        :title="`${item.seriesName} · ${item.release?.volume ?? ''}`"
        data-testid="upcoming-widget-item"
      >
        <div class="relative aspect-[2/3] w-full overflow-hidden rounded-xs bg-muted">
          <img
            v-if="cover(item)"
            :src="cover(item)!"
            alt=""
            loading="lazy"
            class="size-full object-cover transition-opacity group-hover:opacity-80"
          />
          <div v-else class="grid size-full place-items-center text-muted-foreground">
            <BookDashed :size="18" aria-hidden="true" />
          </div>
          <span
            class="absolute inset-x-1 bottom-1 truncate rounded-full bg-black/65 px-1 py-0.5 text-center text-[9px] font-bold leading-none"
            :class="OVERLAY_TEXT_CLASSES[item.kind]"
          >
            {{ when(item) }}
          </span>
          <div class="pointer-events-none absolute inset-0 rounded-xs border-2" :class="FRAME_CLASSES[item.kind]" aria-hidden="true" />
        </div>
        <p class="mt-1 truncate text-[11px] font-semibold text-foreground">{{ item.seriesName }}</p>
      </RouterLink>
    </div>

    <div class="mt-2 flex items-center gap-2">
      <span v-if="loaded && waitingCount > 0" class="min-w-0 truncate text-[11px] text-muted-foreground">
        {{ t('seriesReleases.upcoming.widget.waiting', { count: waitingCount }) }}
      </span>
      <RouterLink :to="{ name: 'series-releases' }" class="ms-auto shrink-0 text-[12px] font-medium text-primary hover:underline">
        {{ t('seriesReleases.upcoming.widget.seeAll') }}
      </RouterLink>
    </div>
  </div>
</template>
