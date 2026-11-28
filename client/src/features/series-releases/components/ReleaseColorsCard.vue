<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarClock, Palette, RotateCcw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import { useReleaseColors } from '../composables/useReleaseColors'
import { TRACKED_RELEASE_KINDS, type TrackedReleaseKind } from '../lib/release-state'
import { frameStyle, overlayTextStyle } from '../lib/release-style'

const { t } = useI18n()
const { looks, setLook, reset, isDefault } = useReleaseColors()

const rows = computed(() =>
  TRACKED_RELEASE_KINDS.map((kind) => {
    const look = looks.value[kind]
    return {
      kind,
      look,
      label: t(`seriesReleases.colors.kinds.${kind}.label`),
      hint: t(`seriesReleases.colors.kinds.${kind}.hint`),
      frame: frameStyle(kind, look),
      text: overlayTextStyle(kind, look),
      changed: !isDefault(kind),
    }
  }),
)

const anyChanged = computed(() => rows.value.some((row) => row.changed))

function handleColor(kind: TrackedReleaseKind, event: Event) {
  setLook(kind, { color: (event.target as HTMLInputElement).value })
}

function handleDashed(kind: TrackedReleaseKind, event: Event) {
  setLook(kind, { dashed: (event.target as HTMLInputElement).checked })
}

function handleVisible(kind: TrackedReleaseKind, visible: boolean) {
  setLook(kind, { visible })
}

function handleReset(kind: TrackedReleaseKind) {
  reset(kind)
}

function handleResetAll() {
  reset()
}
</script>

<template>
  <section class="mt-6 rounded-lg border border-border bg-muted/30 p-3" data-testid="release-colors-card">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="flex items-center gap-1.5">
          <Palette :size="14" class="text-muted-foreground" aria-hidden="true" />
          <h2 class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{{ t('seriesReleases.colors.title') }}</h2>
        </div>
        <p class="mt-0.5 text-xs text-muted-foreground">{{ t('seriesReleases.colors.subtitle') }}</p>
      </div>
      <Button v-if="anyChanged" type="button" variant="ghost" size="sm" data-testid="release-colors-reset-all" @click="handleResetAll">
        <RotateCcw :size="14" aria-hidden="true" />
        {{ t('seriesReleases.colors.resetAll') }}
      </Button>
    </div>

    <ul class="mt-3 divide-y divide-border">
      <li
        v-for="row in rows"
        :key="row.kind"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 py-2"
        :class="!row.look.visible && 'opacity-60'"
        :data-testid="`release-color-${row.kind}`"
      >
        <div class="relative h-12 w-8 shrink-0 overflow-hidden rounded-sm bg-muted" aria-hidden="true">
          <span class="absolute right-0.5 top-0.5 rounded-full bg-black/65 p-0.5" :class="row.text.class" :style="row.text.style">
            <CalendarClock :size="8" />
          </span>
          <div class="absolute inset-0 rounded-sm border-2" :class="row.frame.class" :style="row.frame.style" />
        </div>

        <div class="min-w-0 flex-1 basis-40">
          <p class="text-sm font-medium text-foreground">{{ row.label }}</p>
          <p class="text-xs text-muted-foreground">{{ row.hint }}</p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <input
            type="color"
            class="h-7 w-10 cursor-pointer rounded border border-border bg-background p-0.5"
            :value="row.look.color"
            :aria-label="t('seriesReleases.colors.color', { status: row.label })"
            @input="handleColor(row.kind, $event)"
          />
          <label class="flex cursor-pointer items-center gap-1.5 text-xs text-foreground">
            <input type="checkbox" class="accent-primary" :checked="row.look.dashed" @change="handleDashed(row.kind, $event)" />
            {{ t('seriesReleases.colors.dashed') }}
          </label>
          <label class="flex items-center gap-1.5 text-xs text-foreground">
            <ToggleSwitch
              :model-value="row.look.visible"
              :aria-label="t('seriesReleases.colors.show')"
              @update:model-value="handleVisible(row.kind, $event)"
            />
            {{ t('seriesReleases.colors.show') }}
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="h-7 px-2"
            :class="!row.changed && 'invisible'"
            :disabled="!row.changed"
            @click="handleReset(row.kind)"
          >
            {{ t('seriesReleases.colors.reset') }}
          </Button>
        </div>
      </li>
    </ul>
  </section>
</template>
