<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarClock, ExternalLink } from '@lucide/vue'
import type { SeriesRelease } from '@bookorbit/types'
import { formatDate } from '@/i18n/formatters'
import { useReleaseColors } from '../composables/useReleaseColors'
import { daysUntil, parseLocalDay, releaseState, type ReleaseState } from '../lib/release-state'
import { isCustomColor, tint } from '../lib/release-style'

const props = defineProps<{
  release: SeriesRelease
  /** Whether the card opens the editor. A reader only sees it. */
  editable: boolean
  /** Today, for tests; the real clock otherwise. */
  now?: Date
}>()

const emit = defineEmits<{ select: [release: SeriesRelease] }>()

const { t } = useI18n()

const state = computed<ReleaseState>(() => releaseState(props.release, props.now))

const dateLabel = computed(() => {
  const day = props.release.releaseDate ? parseLocalDay(props.release.releaseDate) : null
  return day ? formatDate(day, { dateStyle: 'medium' }) : null
})

const statusLabel = computed(() => {
  switch (state.value) {
    case 'undated':
      return t('seriesReleases.status.undated')
    case 'overdue':
      return t('seriesReleases.status.overdue')
    case 'today':
      return t('seriesReleases.status.today')
    case 'soon':
      return t('seriesReleases.status.inDays', { count: daysUntil(props.release.releaseDate, props.now) ?? 0 })
    default:
      return dateLabel.value ?? ''
  }
})

const STATE_CLASSES: Record<ReleaseState, string> = {
  undated: 'border-border text-muted-foreground',
  scheduled: 'border-[var(--pill-info)]/40 bg-[var(--pill-info)]/10 text-[var(--pill-info)]',
  soon: 'border-[var(--pill-warning)]/40 bg-[var(--pill-warning)]/10 text-[var(--pill-warning)]',
  today: 'border-[var(--pill-success)]/40 bg-[var(--pill-success)]/10 text-[var(--pill-success)]',
  overdue: 'border-destructive/40 bg-destructive/10 text-destructive',
}

const { looks } = useReleaseColors()

/** A picked status color replaces the theme classes on the frame and the pill. */
const custom = computed(() => {
  const look = looks.value[state.value]
  return isCustomColor(state.value, look) ? look.color : null
})
const frameClass = computed(() => (custom.value ? '' : STATE_CLASSES[state.value].split(' ')[0]))
const frameStyle = computed(() => (custom.value ? { borderColor: custom.value } : {}))
const pillClass = computed(() => (custom.value ? '' : STATE_CLASSES[state.value]))
const pillStyle = computed(() =>
  custom.value ? { borderColor: tint(custom.value, 40), backgroundColor: tint(custom.value, 10), color: custom.value } : {},
)

/** The link is shown only when it is plainly a web address, whatever the server stored. */
const storeUrl = computed(() => (props.release.storeUrl && /^https?:\/\//i.test(props.release.storeUrl) ? props.release.storeUrl : null))
const cover = computed(() => (props.release.cover && /^(https:\/\/|data:image\/)/i.test(props.release.cover) ? props.release.cover : null))
</script>

<template>
  <div class="flex w-28 flex-col gap-1.5" data-testid="series-release-card">
    <component
      :is="editable ? 'button' : 'div'"
      :type="editable ? 'button' : undefined"
      class="group block w-full text-left"
      :class="editable ? 'rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' : ''"
      :aria-label="editable ? t('seriesReleases.card.edit', { volume: release.volume }) : undefined"
      @click="editable && emit('select', release)"
    >
      <div
        class="relative aspect-[2/3] w-full overflow-hidden rounded-lg border-2 border-dashed bg-muted/40"
        :class="[frameClass, editable ? 'transition-colors group-hover:bg-muted' : '']"
        :style="frameStyle"
      >
        <img v-if="cover" :src="cover" alt="" loading="lazy" class="size-full object-cover opacity-90" />
        <div v-else class="flex size-full items-center justify-center text-muted-foreground">
          <CalendarClock :size="28" aria-hidden="true" />
        </div>
      </div>
      <p class="mt-1.5 truncate text-sm font-medium text-foreground" :title="release.volume">{{ release.volume }}</p>
      <span
        class="mt-1 inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
        :class="pillClass"
        :style="pillStyle"
      >
        <span class="truncate">{{ statusLabel }}</span>
      </span>
    </component>
    <p v-if="release.note" class="line-clamp-2 text-[11px] text-muted-foreground">{{ release.note }}</p>
    <a
      v-if="storeUrl"
      :href="storeUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
    >
      <ExternalLink :size="11" aria-hidden="true" />
      {{ t('seriesReleases.card.store') }}
    </a>
  </div>
</template>
