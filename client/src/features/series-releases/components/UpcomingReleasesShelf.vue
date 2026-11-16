<script setup lang="ts">
import { computed, onMounted, ref, useAttrs } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { CalendarClock, ChevronLeft, ChevronRight, RefreshCw } from '@lucide/vue'
import { MIN_SHELF_ROWS, chunkIntoBands, effectiveShelfRows, shelfBookLimit } from '@/features/dashboard/lib/shelf-rows'
import { useReleaseOverview } from '../composables/useReleaseOverview'
import { buildUpcomingItems, sortItems } from '../lib/upcoming-items'
import UpcomingVolumeCard from './UpcomingVolumeCard.vue'

/**
 * The "Upcoming Volumes" dashboard shelf: the same frame, header and bands as the book shelves,
 * holding Upcoming cards instead of books. Announced volumes come first, nearest date first, then
 * the series whose monthly date check is due. It reads the cached overview the cover frames use,
 * so the dashboard's book batch never hears about it.
 */
const props = defineProps<{
  title: string
  /** Cards per row, as the shelf settings set it. */
  limit?: number
  rows?: number
  /** Today, for tests; the real clock otherwise. */
  now?: Date
}>()

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const { t } = useI18n()
const { overview, loaded, failed, ensure, refresh } = useReleaseOverview()

const DEFAULT_CARDS_PER_ROW = 20

const { sm } = useBreakpoints(breakpointsTailwind)
const shelfRows = computed(() => effectiveShelfRows(props.rows ?? MIN_SHELF_ROWS, !sm.value))

onMounted(() => void ensure())

const cards = computed(() => {
  const items = buildUpcomingItems(overview.value?.series ?? [], props.now)
  const dated = sortItems(
    items.filter((item) => item.day !== null),
    'date',
    'asc',
  )
  const checks = sortItems(
    items.filter((item) => item.kind === 'check'),
    'name',
    'asc',
  )
  return [...dated, ...checks].slice(0, shelfBookLimit(props.limit ?? DEFAULT_CARDS_PER_ROW, shelfRows.value))
})

const announced = computed(() => cards.value.filter((item) => item.day !== null).length)
const bands = computed(() => chunkIntoBands(cards.value, shelfRows.value))

const scrollEl = ref<HTMLElement | null>(null)

function scrollBy(delta: number) {
  scrollEl.value?.scrollBy({ left: delta, behavior: 'smooth' })
}

const SKELETONS_PER_BAND = 8
const skeletonBands = computed(() => Array.from({ length: shelfRows.value }, () => Array.from({ length: SKELETONS_PER_BAND })))
</script>

<template>
  <section
    v-bind="attrs"
    class="group/scroller overflow-hidden rounded-2xl border border-primary/40 bg-card/30 shadow-sm backdrop-blur-[1px]"
    data-testid="upcoming-releases-shelf"
  >
    <div class="mb-2 flex items-center justify-between px-5 pt-4">
      <div class="flex items-center gap-2.5">
        <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50">
          <CalendarClock :size="14" class="text-foreground" aria-hidden="true" />
        </div>
        <h2 class="text-[15px] font-bold tracking-tight">{{ title }}</h2>
        <span
          v-if="loaded && announced > 0"
          class="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-bold tabular-nums text-foreground"
          :title="t('seriesReleases.upcoming.shelf.announced', { count: announced })"
        >
          {{ announced }}
        </span>
        <RouterLink :to="{ name: 'series-releases' }" class="text-[12px] font-medium text-primary hover:underline">
          {{ t('seriesReleases.upcoming.shelf.seeAll') }}
        </RouterLink>
      </div>
      <div class="flex items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover/scroller:opacity-100">
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          :aria-label="t('seriesReleases.upcoming.shelf.scrollLeft')"
          @click="scrollBy(-560)"
        >
          <ChevronLeft :size="16" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          :aria-label="t('seriesReleases.upcoming.shelf.scrollRight')"
          @click="scrollBy(560)"
        >
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div v-if="!loaded && !failed" class="flex flex-col gap-5 overflow-hidden px-5 pb-5">
      <div v-for="(skeletonBand, bandIndex) in skeletonBands" :key="bandIndex" class="flex gap-3">
        <div v-for="(_, n) in skeletonBand" :key="n" class="w-[120px] shrink-0">
          <div class="w-full animate-pulse rounded-lg bg-muted" style="aspect-ratio: 2/3" />
        </div>
      </div>
    </div>

    <div v-else-if="failed" class="flex items-center gap-2.5 px-5 pb-4 pt-1 text-sm text-muted-foreground">
      <span>{{ t('seriesReleases.errors.load') }}</span>
      <button type="button" class="flex items-center gap-1.5 text-xs text-primary hover:underline" @click="refresh">
        <RefreshCw :size="12" aria-hidden="true" />
        {{ t('seriesReleases.upcoming.shelf.retry') }}
      </button>
    </div>

    <div v-else-if="cards.length === 0" class="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <CalendarClock :size="20" class="text-muted-foreground" aria-hidden="true" />
      </div>
      <p class="text-sm text-muted-foreground">{{ t('seriesReleases.upcoming.shelf.empty') }}</p>
    </div>

    <div v-else ref="scrollEl" class="overflow-x-auto px-5 pb-5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div class="flex w-max flex-col gap-5">
        <div v-for="(band, bandIndex) in bands" :key="bandIndex" data-testid="shelf-band" class="flex items-start gap-5">
          <UpcomingVolumeCard
            v-for="(item, index) in band"
            :key="item.key"
            :item="item"
            :now="now"
            class="w-[120px] shrink-0"
            style="animation: dashboardFadeUp 0.35s ease both"
            :style="{ animationDelay: `${index * 35}ms` }"
          />
        </div>
      </div>
    </div>
  </section>
</template>
