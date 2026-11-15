<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import { AlertCircle, CalendarClock, CalendarPlus, Download, ExternalLink } from '@lucide/vue'
import type { SeriesReleaseCalendarInfo, SeriesReleaseOverviewRelease, SeriesReleaseOverviewSeries } from '@bookorbit/types'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/i18n/formatters'
import { apiJson } from '@/lib/api-json'
import { copyToClipboard } from '@/lib/clipboard'
import { useReleaseOverview } from '../composables/useReleaseOverview'
import { daysUntil, isCheckDue, parseLocalDay, releaseState, type ReleaseState } from '../lib/release-state'

interface AgendaRow {
  release: SeriesReleaseOverviewRelease
  series: SeriesReleaseOverviewSeries
  state: ReleaseState
  day: Date
}

const { t } = useI18n()
const { overview, loaded, failed, refresh } = useReleaseOverview()

const calendarPath = ref<string | null>(null)

onMounted(() => {
  void refresh()
  void apiJson<SeriesReleaseCalendarInfo>('/api/v1/series-releases/calendar-token', undefined, 'seriesReleases.errors.load')
    .then((info) => {
      calendarPath.value = info.path
    })
    .catch(() => {
      // Without the link the page still shows the agenda; the buttons just stay away.
    })
})

const tracked = computed(() => overview.value?.series ?? [])

/** Every dated volume, nearest first, grouped by the month it lands in. */
const months = computed(() => {
  const rows: AgendaRow[] = []
  for (const series of tracked.value) {
    for (const release of series.releases) {
      const day = release.releaseDate ? parseLocalDay(release.releaseDate) : null
      if (day) rows.push({ release, series, state: releaseState(release), day })
    }
  }
  rows.sort((a, b) => a.day.getTime() - b.day.getTime() || a.series.name.localeCompare(b.series.name))

  const groups: { label: string; rows: AgendaRow[] }[] = []
  for (const row of rows) {
    const label = formatDate(row.day, { month: 'long', year: 'numeric' })
    const group = groups.at(-1)
    if (group && group.label === label) group.rows.push(row)
    else groups.push({ label, rows: [row] })
  }
  return groups
})

/** Series still waiting on an announcement, the ones the monthly check is for. */
const waiting = computed(() =>
  tracked.value
    .map((series) => ({
      series,
      undated: series.releases.filter((release) => release.releaseDate === null),
      checkDue: isCheckDue({ tracking: true, finished: series.finished, checkedAt: series.checkedAt }, series.releases),
    }))
    .filter((entry) => entry.undated.length > 0 && !entry.series.finished),
)

const empty = computed(() => loaded.value && months.value.length === 0 && waiting.value.length === 0)

const STATE_CLASSES: Record<ReleaseState, string> = {
  today: 'bg-success/15 text-success',
  soon: 'bg-warning/15 text-warning',
  overdue: 'bg-destructive/15 text-destructive',
  scheduled: 'bg-primary/10 text-primary',
  undated: 'bg-muted text-muted-foreground',
}

function stateLabel(row: AgendaRow): string {
  if (row.state === 'today') return t('seriesReleases.badge.today')
  if (row.state === 'overdue') return t('seriesReleases.badge.out')
  if (row.state === 'soon') return t('seriesReleases.badge.inDays', { count: daysUntil(row.release.releaseDate) ?? 0 })
  return formatDate(row.day, { month: 'short', day: 'numeric' })
}

const calendarUrl = computed(() => (calendarPath.value ? new URL(calendarPath.value, window.location.origin).toString() : null))

async function copyCalendarLink() {
  if (!calendarUrl.value) return
  if (await copyToClipboard(calendarUrl.value)) toast.success(t('seriesReleases.agenda.linkCopied'))
  else toast.error(t('seriesReleases.agenda.copyFailed'))
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 pb-10 pt-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 class="text-xl font-semibold text-foreground">{{ t('seriesReleases.agenda.title') }}</h1>
        <p class="mt-0.5 text-sm text-muted-foreground">{{ t('seriesReleases.agenda.subtitle') }}</p>
      </div>
      <div v-if="calendarUrl" class="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" @click="copyCalendarLink">
          <CalendarPlus :size="14" aria-hidden="true" />
          {{ t('seriesReleases.agenda.copyLink') }}
        </Button>
        <Button as="a" :href="calendarUrl" download="bookorbit-releases.ics" variant="outline" size="sm">
          <Download :size="14" aria-hidden="true" />
          {{ t('seriesReleases.agenda.download') }}
        </Button>
      </div>
    </div>

    <p v-if="failed" role="alert" class="mt-6 text-sm text-destructive">{{ t('seriesReleases.errors.load') }}</p>

    <div v-else-if="empty" class="mt-10 flex flex-col items-center gap-2 text-center">
      <CalendarClock :size="28" class="text-muted-foreground" aria-hidden="true" />
      <p class="max-w-sm text-sm text-muted-foreground">{{ t('seriesReleases.agenda.empty') }}</p>
    </div>

    <template v-else>
      <section v-for="month in months" :key="month.label" class="mt-6">
        <h2 class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{{ month.label }}</h2>
        <ul class="mt-2 divide-y divide-border rounded-lg border border-border bg-card">
          <li v-for="row in month.rows" :key="row.release.id" class="flex items-center gap-3 px-3 py-2.5">
            <div class="w-10 shrink-0 text-center">
              <p class="text-lg font-semibold leading-none tabular-nums text-foreground">{{ row.day.getDate() }}</p>
              <p class="mt-0.5 text-[10px] uppercase text-muted-foreground">{{ formatDate(row.day, { weekday: 'short' }) }}</p>
            </div>
            <div class="min-w-0 flex-1">
              <RouterLink
                :to="{ name: 'series-detail', params: { seriesId: row.series.seriesId } }"
                class="block truncate text-sm font-medium text-foreground hover:underline"
              >
                {{ row.series.name }}
              </RouterLink>
              <p class="truncate text-xs text-muted-foreground">
                {{ row.release.volume }}<template v-if="row.release.note"> &middot; {{ row.release.note }}</template>
              </p>
            </div>
            <a
              v-if="row.release.storeUrl"
              :href="row.release.storeUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="shrink-0 text-muted-foreground hover:text-foreground"
              :aria-label="t('seriesReleases.card.store')"
            >
              <ExternalLink :size="14" aria-hidden="true" />
            </a>
            <span class="inline-flex h-[21px] shrink-0 items-center rounded-md px-1.5 text-[11.5px] font-semibold" :class="STATE_CLASSES[row.state]">
              {{ stateLabel(row) }}
            </span>
          </li>
        </ul>
      </section>

      <section v-if="waiting.length > 0" class="mt-6">
        <h2 class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{{ t('seriesReleases.agenda.waiting') }}</h2>
        <ul class="mt-2 divide-y divide-border rounded-lg border border-dashed border-border bg-muted/30">
          <li v-for="entry in waiting" :key="entry.series.seriesId" class="flex items-center gap-3 px-3 py-2.5">
            <div class="min-w-0 flex-1">
              <RouterLink
                :to="{ name: 'series-detail', params: { seriesId: entry.series.seriesId } }"
                class="block truncate text-sm font-medium text-foreground hover:underline"
              >
                {{ entry.series.name }}
              </RouterLink>
              <p class="truncate text-xs text-muted-foreground">{{ entry.undated.map((release) => release.volume).join(', ') }}</p>
            </div>
            <span
              v-if="entry.checkDue"
              class="inline-flex h-[21px] shrink-0 items-center gap-1 rounded-md bg-warning/15 px-1.5 text-[11.5px] font-semibold text-warning"
            >
              <AlertCircle :size="12" aria-hidden="true" />
              {{ t('seriesReleases.badge.check') }}
            </span>
            <span v-else class="text-[11.5px] text-muted-foreground">{{ t('seriesReleases.badge.noDate') }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
