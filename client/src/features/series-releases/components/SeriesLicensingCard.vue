<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { BadgeCheck, Loader2, RefreshCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/i18n/formatters'
import { errorMessage } from '@/lib/api-json'
import { useLibraries } from '@/features/library/composables/useLibraries'
import { useSeriesLicensing } from '../composables/useSeriesLicensing'

const { t } = useI18n()
const { overview, saving, error, load, saveLibraries, startRun } = useSeriesLicensing()
const { libraries, fetchLibraries } = useLibraries()

/** Checkbox state, kept apart from the server copy until Save. */
const picked = ref<Set<number>>(new Set())
const serverPick = computed(() => overview.value?.settings?.libraryIds ?? [])

watch(serverPick, (ids) => {
  picked.value = new Set(ids)
})

const dirty = computed(() => {
  const server = new Set(serverPick.value)
  if (server.size !== picked.value.size) return true
  return [...picked.value].some((id) => !server.has(id))
})

const status = computed(() => overview.value?.status ?? null)

const lastRunLabel = computed(() => {
  const value = status.value
  if (!value?.lastRunAt) return t('seriesReleases.licensing.neverRan')
  const day = formatDate(new Date(value.lastRunAt), { month: 'short', day: 'numeric', year: 'numeric' })
  if (value.lastRunError) return t('seriesReleases.licensing.lastFailed', { day })
  return t('seriesReleases.licensing.lastRun', {
    day,
    series: value.lastRunSeries ?? 0,
    licensed: value.lastRunLicensed ?? 0,
  })
})

function toggle(id: number): void {
  const next = new Set(picked.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  picked.value = next
}

async function save(): Promise<void> {
  try {
    await saveLibraries([...picked.value])
    toast.success(t('seriesReleases.licensing.saved'))
  } catch (reason) {
    toast.error(errorMessage(reason, 'seriesReleases.errors.licensing'))
  }
}

async function run(): Promise<void> {
  try {
    await startRun()
    toast.success(t('seriesReleases.licensing.started'))
  } catch (reason) {
    toast.error(errorMessage(reason, 'seriesReleases.errors.licensing'))
  }
}

onMounted(() => {
  void load()
  void fetchLibraries()
})
</script>

<template>
  <section class="mt-6 rounded-lg border border-border bg-muted/30 p-3" data-testid="series-licensing-card">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="flex items-center gap-1.5">
          <BadgeCheck :size="14" class="text-muted-foreground" aria-hidden="true" />
          <h2 class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {{ t('seriesReleases.licensing.title') }}
          </h2>
        </div>
        <p class="mt-0.5 text-xs text-muted-foreground">{{ t('seriesReleases.licensing.subtitle') }}</p>
      </div>
      <Button type="button" variant="outline" size="sm" :disabled="saving || status?.running || picked.size === 0" @click="run">
        <Loader2 v-if="status?.running" :size="14" class="animate-spin" aria-hidden="true" />
        <RefreshCw v-else :size="14" aria-hidden="true" />
        {{ status?.running ? t('seriesReleases.licensing.running', { lines: status?.progressLines ?? 0 }) : t('seriesReleases.licensing.run') }}
      </Button>
    </div>

    <p v-if="error" role="alert" class="mt-2 text-xs text-destructive">{{ error }}</p>

    <template v-else-if="overview">
      <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <label v-for="library in libraries" :key="library.id" class="flex cursor-pointer items-center gap-1.5 text-sm text-foreground">
          <input type="checkbox" class="accent-primary" :checked="picked.has(library.id)" @change="toggle(library.id)" />
          {{ library.name }}
        </label>
      </div>
      <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-muted-foreground">
          {{ lastRunLabel }}
          <span v-if="status?.lastRunError" class="text-destructive"> — {{ status.lastRunError }}</span>
        </p>
        <Button v-if="dirty" type="button" size="sm" :disabled="saving" @click="save">
          {{ t('seriesReleases.licensing.save') }}
        </Button>
      </div>
      <p class="mt-1 text-[10px] text-muted-foreground/80">{{ t('seriesReleases.licensing.credit') }}</p>
    </template>
  </section>
</template>
