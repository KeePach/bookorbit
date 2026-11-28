<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { CalendarClock, CalendarPlus, Download, ExternalLink, X } from '@lucide/vue'
import type { SeriesReleaseCalendarInfo } from '@bookorbit/types'
import BrowseHeader from '@/components/browse-header/BrowseHeader.vue'
import BrowseInlineGroup from '@/components/browse-header/BrowseInlineGroup.vue'
import BrowseLibraryPicker from '@/components/browse-header/BrowseLibraryPicker.vue'
import BrowseSearchField from '@/components/browse-header/BrowseSearchField.vue'
import BrowseSortControl from '@/components/browse-header/BrowseSortControl.vue'
import BrowseViewControls from '@/components/browse-header/BrowseViewControls.vue'
import { barDivider, segmentItem, segmentTrack } from '@/components/browse-header/browse-header'
import { Button } from '@/components/ui/button'
import type { BookViewMode } from '@/composables/useDisplaySettings'
import { useLibraries } from '@/features/library/composables/useLibraries'
import { formatDate } from '@/i18n/formatters'
import { apiJson } from '@/lib/api-json'
import { copyToClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/utils'
import ReleaseColorsCard from '../components/ReleaseColorsCard.vue'
import SeriesLicensingCard from '../components/SeriesLicensingCard.vue'
import MangabakaSyncCard from '../components/MangabakaSyncCard.vue'
import UpcomingStatusTabs from '../components/UpcomingStatusTabs.vue'
import UpcomingVolumeCard from '../components/UpcomingVolumeCard.vue'
import { useReleaseColors } from '../composables/useReleaseColors'
import { useReleaseOverview } from '../composables/useReleaseOverview'
import { daysUntil } from '../lib/release-state'
import { chipStyle, type SurfaceStyle } from '../lib/release-style'
import {
  UPCOMING_SORTS,
  buildUpcomingItems,
  countByFilter,
  groupItems,
  matchesFilter,
  narrowItems,
  parseUpcomingQuery,
  sortItems,
  toUpcomingQuery,
  type UpcomingFilter,
  type UpcomingItem,
  type UpcomingLicensed,
  type UpcomingQuery,
  type UpcomingSort,
} from '../lib/upcoming-items'

defineOptions({ name: 'ReleaseAgendaView' })

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { overview, loaded, failed, refresh } = useReleaseOverview()
const { libraries, fetchLibraries } = useLibraries()

const mainRef = ref<HTMLElement | null>(null)
const calendarPath = ref<string | null>(null)

onMounted(() => {
  void refresh()
  void fetchLibraries()
  void apiJson<SeriesReleaseCalendarInfo>('/api/v1/series-releases/calendar-token', undefined, 'seriesReleases.errors.load')
    .then((info) => {
      calendarPath.value = info.path
    })
    .catch(() => {
      // Without the link the page still works; the calendar buttons just stay away.
    })
})

/* ---- Page state lives in the address, so any view can be bookmarked or shared. ---- */

const state = computed(() => parseUpcomingQuery(route.query))

function update(patch: Partial<UpcomingQuery>) {
  void router.replace({ query: toUpcomingQuery({ ...state.value, ...patch }) })
}

/** The search box types locally and writes the address as it goes. */
const q = ref(state.value.q)
watch(
  () => state.value.q,
  (value) => {
    if (value !== q.value) q.value = value
  },
)
watch(q, (value) => {
  if (value !== state.value.q) update({ q: value })
})

const isFiltered = computed(
  () => state.value.filter !== 'all' || state.value.libraryId !== null || state.value.licensed !== 'all' || state.value.q.trim() !== '',
)

function clearFilters() {
  q.value = ''
  update({ filter: 'all', libraryId: null, licensed: 'all', q: '' })
}

/* ---- Items ---- */

const allItems = computed(() => buildUpcomingItems(overview.value?.series ?? []))
const narrowed = computed(() => narrowItems(allItems.value, state.value))
const counts = computed(() => countByFilter(narrowed.value))
const visible = computed(() =>
  sortItems(
    narrowed.value.filter((item) => matchesFilter(item, state.value.filter)),
    state.value.sort,
    state.value.order,
  ),
)
const groups = computed(() =>
  groupItems(visible.value, state.value.sort, (day) => formatDate(day, { month: 'long', year: 'numeric' }), t('seriesReleases.agenda.waiting')),
)

const trackedCount = computed(() => overview.value?.series.length ?? 0)
const nothingTracked = computed(() => loaded.value && allItems.value.length === 0)

/** Only libraries that actually hold a tracked series are worth offering. */
const libraryOptions = computed(() => {
  const present = new Set(allItems.value.flatMap((item) => item.libraryIds))
  return libraries.value.filter((library) => present.has(library.id)).map((library) => ({ id: library.id, name: library.name }))
})

/** The licensing switch appears once a licensing check has had its say about something. */
const hasLicensing = computed(() => allItems.value.some((item) => item.licensed !== null))

const LICENSED_OPTIONS: UpcomingLicensed[] = ['all', 'yes', 'no']

const sortLabels = computed<Record<UpcomingSort, string>>(() => ({
  date: t('seriesReleases.upcoming.sort.date'),
  name: t('seriesReleases.upcoming.sort.name'),
}))

const headerViewMode = computed<BookViewMode>(() => (state.value.view === 'list' ? 'list' : 'grid'))

function handleViewMode(mode: BookViewMode) {
  update({ view: mode === 'list' ? 'list' : 'grid' })
}

function setSort(sort: UpcomingSort) {
  update({ sort, order: sort === state.value.sort ? state.value.order : 'asc' })
}

/* ---- List rows ---- */

function rowPill(item: UpcomingItem): string {
  if (item.kind === 'today') return t('seriesReleases.badge.today')
  if (item.kind === 'overdue') return t('seriesReleases.badge.out')
  if (item.kind === 'soon') return t('seriesReleases.badge.inDays', { count: daysUntil(item.release?.releaseDate ?? null) ?? 0 })
  if (item.kind === 'scheduled' && item.day) return formatDate(item.day, { month: 'short', day: 'numeric' })
  if (item.kind === 'check') return t('seriesReleases.badge.check')
  if (item.kind === 'caughtUp') return t('seriesReleases.badge.upToDate')
  return t('seriesReleases.badge.noDate')
}

const { looks } = useReleaseColors()

function rowChip(item: UpcomingItem): SurfaceStyle {
  return chipStyle(item.kind, looks.value[item.kind])
}

/* ---- Calendar ---- */

const calendarUrl = computed(() => (calendarPath.value ? new URL(calendarPath.value, window.location.origin).toString() : null))

async function copyCalendarLink() {
  if (!calendarUrl.value) return
  if (await copyToClipboard(calendarUrl.value)) toast.success(t('seriesReleases.agenda.linkCopied'))
  else toast.error(t('seriesReleases.agenda.copyFailed'))
}

function selectFilter(filter: UpcomingFilter) {
  update({ filter })
}
</script>

<template>
  <section class="flex h-full flex-col">
    <BrowseHeader
      :eyebrow="t('components.browseHeader.eyebrow.browse')"
      :title="t('seriesReleases.agenda.title')"
      icon="CalendarClock"
      fallback-icon="Calendar"
      :folded-count="String(visible.length)"
      :scroll-container="mainRef"
    >
      <template #facts>
        <span class="truncate">{{ t('seriesReleases.upcoming.facts', { volumes: visible.length, series: trackedCount }) }}</span>
      </template>

      <template v-if="calendarUrl" #actions>
        <Button type="button" variant="outline" size="sm" @click="copyCalendarLink">
          <CalendarPlus :size="14" aria-hidden="true" />
          {{ t('seriesReleases.agenda.copyLink') }}
        </Button>
        <Button as="a" :href="calendarUrl" download="bookorbit-releases.ics" variant="outline" size="sm">
          <Download :size="14" aria-hidden="true" />
          {{ t('seriesReleases.agenda.download') }}
        </Button>
      </template>

      <template #bar>
        <BrowseSearchField v-model="q" :placeholder="t('seriesReleases.upcoming.searchPlaceholder')" :active="isFiltered" @clear="clearFilters" />
        <span :class="barDivider" aria-hidden="true" />
        <BrowseSortControl
          :label="sortLabels[state.sort]"
          :direction="state.order"
          :changed="state.sort !== 'date' || state.order !== 'asc'"
          popover-class="w-48 p-2"
          @toggle-direction="update({ order: state.order === 'asc' ? 'desc' : 'asc' })"
        >
          <div class="mb-2 px-1 text-xs font-medium text-muted-foreground">{{ t('seriesReleases.upcoming.sort.label') }}</div>
          <div class="flex flex-col gap-0.5">
            <button
              v-for="field in UPCOMING_SORTS"
              :key="field"
              type="button"
              class="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
              :class="state.sort === field ? 'font-medium text-foreground' : 'text-muted-foreground'"
              @click="setSort(field)"
            >
              {{ sortLabels[field] }}
              <span v-if="state.sort === field" class="text-xs text-primary" aria-hidden="true">{{ state.order === 'asc' ? '↑' : '↓' }}</span>
            </button>
          </div>
        </BrowseSortControl>
        <span :class="barDivider" aria-hidden="true" />
        <BrowseInlineGroup
          :label="t('seriesReleases.upcoming.filters.label')"
          :value="state.filter === 'all' ? null : t(`seriesReleases.upcoming.filters.${state.filter}`)"
          :active="state.filter !== 'all'"
          :show-label="false"
        >
          <UpcomingStatusTabs :filter="state.filter" :counts="counts" @select="selectFilter" />
        </BrowseInlineGroup>
        <BrowseInlineGroup
          v-if="hasLicensing"
          hide-on-phone
          :label="t('seriesReleases.upcoming.licensed.label')"
          :value="state.licensed === 'all' ? null : t(`seriesReleases.upcoming.licensed.${state.licensed}`)"
          :active="state.licensed !== 'all'"
          :show-label="false"
        >
          <div :class="segmentTrack" role="group" :aria-label="t('seriesReleases.upcoming.licensed.label')">
            <button
              v-for="option in LICENSED_OPTIONS"
              :key="option"
              type="button"
              :class="segmentItem"
              :aria-pressed="state.licensed === option"
              @click="update({ licensed: option })"
            >
              {{ t(`seriesReleases.upcoming.licensed.${option}`) }}
            </button>
          </div>
        </BrowseInlineGroup>
        <BrowseLibraryPicker
          v-if="libraryOptions.length > 1"
          hide-on-phone
          :libraries="libraryOptions"
          :model-value="state.libraryId"
          @update:model-value="update({ libraryId: $event })"
        />
        <span :class="barDivider" aria-hidden="true" />
        <BrowseViewControls
          :view-mode="headerViewMode"
          :allowed-view-modes="['grid', 'list']"
          :show-selection="false"
          :show-display="false"
          @update:view-mode="handleViewMode"
        />
      </template>
    </BrowseHeader>

    <main ref="mainRef" class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-2 pb-10">
      <p v-if="failed" role="alert" class="mt-6 text-sm text-destructive">{{ t('seriesReleases.errors.load') }}</p>

      <div v-else-if="nothingTracked" class="flex flex-col items-center px-5 py-14 text-center">
        <div class="mb-3 grid size-11 place-items-center rounded-xl bg-surface-3 text-muted-foreground">
          <CalendarClock :size="20" aria-hidden="true" />
        </div>
        <p class="max-w-sm text-[13px] text-muted-foreground">{{ t('seriesReleases.agenda.empty') }}</p>
      </div>

      <div v-else-if="loaded && visible.length === 0" class="flex flex-col items-center px-5 py-14 text-center">
        <p class="text-[15px] font-semibold text-foreground">{{ t('seriesReleases.upcoming.noMatch') }}</p>
        <button
          type="button"
          class="mt-3 flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          @click="clearFilters"
        >
          <X :size="13" aria-hidden="true" />
          {{ t('seriesReleases.upcoming.clear') }}
        </button>
      </div>

      <template v-else>
        <section v-for="group in groups" :key="group.key" class="pt-4 first:pt-0" :data-testid="`upcoming-group-${group.key}`">
          <h2 v-if="group.label" class="flex items-center gap-2.5 pb-2 text-[12.5px] font-bold tracking-[0.03em] text-foreground">
            <span>{{ group.label }}</span>
            <span class="font-medium tabular-nums text-muted-foreground">{{ group.items.length }}</span>
            <span class="h-px flex-1 bg-border" />
          </h2>

          <div v-if="state.view === 'grid'" class="upcoming-grid grid gap-4">
            <UpcomingVolumeCard v-for="item in group.items" :key="item.key" :item="item" />
          </div>

          <ul v-else class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            <li v-for="item in group.items" :key="item.key" class="flex items-center gap-3 px-3.5 py-2.5" data-testid="upcoming-row">
              <div class="w-10 shrink-0 text-center">
                <template v-if="item.day">
                  <p class="text-lg font-semibold leading-none tabular-nums text-foreground">{{ item.day.getDate() }}</p>
                  <p class="mt-0.5 text-[10px] uppercase text-muted-foreground">{{ formatDate(item.day, { month: 'short' }) }}</p>
                </template>
                <CalendarClock v-else :size="16" class="mx-auto text-muted-foreground" aria-hidden="true" />
              </div>
              <div class="min-w-0 flex-1">
                <RouterLink
                  :to="{ name: 'series-detail', params: { seriesId: item.seriesId } }"
                  class="block truncate text-sm font-medium text-foreground hover:underline"
                >
                  {{ item.seriesName }}
                </RouterLink>
                <p class="truncate text-xs text-muted-foreground">
                  <template v-if="item.release">
                    {{ item.release.volume }}<template v-if="item.release.note"> &middot; {{ item.release.note }}</template>
                  </template>
                  <template v-else>{{ t('seriesReleases.agenda.noVolume') }}</template>
                </p>
              </div>
              <a
                v-if="item.release?.storeUrl"
                :href="item.release.storeUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="shrink-0 text-muted-foreground hover:text-foreground"
                :aria-label="t('seriesReleases.card.store')"
              >
                <ExternalLink :size="14" aria-hidden="true" />
              </a>
              <span
                :class="cn('inline-flex h-[21px] shrink-0 items-center rounded-md px-1.5 text-[11.5px] font-semibold', rowChip(item).class)"
                :style="rowChip(item).style"
              >
                {{ rowPill(item) }}
              </span>
            </li>
          </ul>
        </section>
      </template>

      <SeriesLicensingCard class="mx-auto max-w-3xl" />
      <MangabakaSyncCard class="mx-auto max-w-3xl" />
      <ReleaseColorsCard class="mx-auto max-w-3xl" />
    </main>
  </section>
</template>

<style scoped>
.upcoming-grid {
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}
</style>
