<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { BookDashed } from '@lucide/vue'
import { formatDate } from '@/i18n/formatters'
import { useCoverVersions } from '@/features/book/composables/useCoverVersions'
import { daysUntil } from '../lib/release-state'
import { useReleaseColors } from '../composables/useReleaseColors'
import { frameStyle, overlayTextStyle } from '../lib/release-style'
import { releaseCoverUrl, type UpcomingItem } from '../lib/upcoming-items'

const props = defineProps<{
  item: UpcomingItem
  /** Today, for tests; the real clock otherwise. */
  now?: Date
}>()

const { t } = useI18n()
const { coverUrl } = useCoverVersions()
const { looks } = useReleaseColors()

const frame = computed(() => frameStyle(props.item.kind, looks.value[props.item.kind]))
const pillColor = computed(() => overlayTextStyle(props.item.kind, looks.value[props.item.kind]))

const ownCover = computed(() => releaseCoverUrl(props.item.release))
const fallbackCover = computed(() => (props.item.coverBookId !== null ? coverUrl(props.item.coverBookId) : null))
/** Falls back to the series' latest volume when the release has no cover or it fails to load. */
const ownFailed = ref(false)
watch(ownCover, () => {
  ownFailed.value = false
})
const src = computed(() => (ownCover.value && !ownFailed.value ? ownCover.value : fallbackCover.value))
const isStandIn = computed(() => src.value !== null && src.value === fallbackCover.value)

/** The pill on the cover: how close the volume is. */
const pill = computed(() => {
  const { kind, release, day } = props.item
  if (kind === 'today') return t('seriesReleases.badge.today')
  if (kind === 'overdue') return t('seriesReleases.badge.out')
  if (kind === 'soon') return t('seriesReleases.badge.inDays', { count: daysUntil(release?.releaseDate ?? null, props.now) ?? 0 })
  if (kind === 'scheduled' && day) return formatDate(day, { month: 'short', day: 'numeric' })
  if (kind === 'check') return t('seriesReleases.badge.check')
  if (kind === 'caughtUp') return t('seriesReleases.badge.upToDate')
  return t('seriesReleases.badge.noDate')
})

/** The line under the title: which volume, and when. */
const detail = computed(() => {
  const { release, day } = props.item
  if (!release) return t('seriesReleases.agenda.noVolume')
  if (!day) return release.volume
  return `${release.volume} · ${formatDate(day, { month: 'short', day: 'numeric', year: 'numeric' })}`
})

const standInLabel = computed(() =>
  props.item.release ? t('seriesReleases.upcoming.next', { volume: props.item.release.volume }) : t('seriesReleases.upcoming.nextUnknown'),
)
</script>

<template>
  <RouterLink
    :to="{ name: 'series-detail', params: { seriesId: item.seriesId } }"
    class="group flex min-w-0 flex-col rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    data-testid="upcoming-card"
  >
    <div
      class="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-muted shadow-sm transition-transform duration-150 group-hover:-translate-y-0.5"
    >
      <img
        v-if="src"
        :src="src"
        alt=""
        loading="lazy"
        decoding="async"
        class="size-full object-cover"
        :class="isStandIn && 'opacity-50 grayscale-[40%]'"
        @error="ownFailed = true"
      />
      <div v-else class="grid size-full place-items-center text-muted-foreground">
        <BookDashed :size="28" aria-hidden="true" />
      </div>

      <span
        v-if="isStandIn || !src"
        class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-6 text-[11px] font-semibold leading-tight text-white"
      >
        {{ standInLabel }}
      </span>

      <span
        class="absolute right-1.5 top-1.5 z-10 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-bold leading-none"
        :class="pillColor.class"
        :style="pillColor.style"
      >
        {{ pill }}
      </span>

      <div class="pointer-events-none absolute inset-0 z-20 rounded-md border-2" :class="frame.class" :style="frame.style" aria-hidden="true" />
    </div>

    <p class="mt-1.5 truncate text-[13px] font-semibold text-foreground" :title="item.seriesName">{{ item.seriesName }}</p>
    <p class="truncate text-xs text-muted-foreground">{{ detail }}</p>
  </RouterLink>
</template>
