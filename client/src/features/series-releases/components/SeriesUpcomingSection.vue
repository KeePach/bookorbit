<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { AlertCircle, CalendarCheck, FileUp, Plus } from '@lucide/vue'
import type { SeriesRelease, SeriesReleaseInput } from '@bookorbit/types'
import { Button } from '@/components/ui/button'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { formatDate } from '@/i18n/formatters'
import { ApiError, errorMessage } from '@/lib/api-json'
import { useSeriesReleases } from '../composables/useSeriesReleases'
import { parseReleaseBackup, ReleaseBackupError } from '../lib/release-backup'
import { isCheckDue, parseLocalDay } from '../lib/release-state'
import SeriesReleaseCard from './SeriesReleaseCard.vue'
import SeriesReleaseDialog from './SeriesReleaseDialog.vue'
import SeriesMangabakaSync from './SeriesMangabakaSync.vue'

const props = defineProps<{ seriesId: number }>()

const { t } = useI18n()
const { data, saving, load, add, update, remove, collect, updateTracking, importBackup, setLicenseOverride } = useSeriesReleases(() => props.seriesId)

watch(
  () => props.seriesId,
  () => void load(),
  { immediate: true },
)

const tracking = computed(() => data.value?.tracking ?? null)
const releases = computed(() => data.value?.releases ?? [])
const canEdit = computed(() => data.value?.canEdit ?? false)
/** A reader sees the section only while the series is followed; an editor can always start following it. */
const visible = computed(() => data.value !== null && (data.value.tracking.tracking || data.value.canEdit))
const checkDue = computed(() => (data.value ? isCheckDue(data.value.tracking, data.value.releases) : false))

const checkedLabel = computed(() => {
  const day = tracking.value?.checkedAt ? parseLocalDay(tracking.value.checkedAt) : null
  return day ? t('seriesReleases.checked', { date: formatDate(day, { dateStyle: 'medium' }) }) : t('seriesReleases.neverChecked')
})

const license = computed(() => data.value?.license ?? null)
/** What the override makes of the MangaBaka verdict. */
const effectivelyLicensed = computed(() => {
  const row = license.value
  if (!row) return false
  if (row.override) return row.override === 'always'
  return row.licensed
})
const licenseLabel = computed(() => {
  const row = license.value
  if (!row) return ''
  if (effectivelyLicensed.value) {
    const base = t('seriesReleases.license.licensed')
    return row.publishers ? `${base} — ${row.publishers}` : base
  }
  return row.matchedBy ? t('seriesReleases.license.notLicensed') : t('seriesReleases.license.noMatch')
})

async function changeOverride(value: string) {
  try {
    await setLicenseOverride(value === 'always' || value === 'never' ? value : null)
  } catch (reason) {
    toast.error(errorMessage(reason, 'seriesReleases.errors.license'))
  }
}

const dialogOpen = ref(false)
const editing = ref<SeriesRelease | null>(null)
const dialogError = ref<string | null>(null)
const confirmStop = ref(false)
const backupInput = ref<HTMLInputElement | null>(null)

function openAdd() {
  editing.value = null
  dialogError.value = null
  dialogOpen.value = true
}

function openEdit(release: SeriesRelease) {
  if (!canEdit.value) return
  editing.value = release
  dialogError.value = null
  dialogOpen.value = true
}

function closeDialog() {
  if (!saving.value) dialogOpen.value = false
}

function saveError(reason: unknown): string {
  return reason instanceof ApiError && reason.status === 409
    ? t('seriesReleases.errors.duplicate')
    : errorMessage(reason, 'seriesReleases.errors.save')
}

async function handleSubmit(input: SeriesReleaseInput) {
  dialogError.value = null
  try {
    if (editing.value) await update(editing.value.id, input)
    else await add(input)
    dialogOpen.value = false
  } catch (reason) {
    dialogError.value = saveError(reason)
  }
}

async function handleCollect() {
  const release = editing.value
  if (!release) return
  dialogError.value = null
  try {
    const result = await collect(release.id)
    dialogOpen.value = false
    toast.success(
      result.next
        ? t('seriesReleases.toast.collectedNext', { volume: result.collected.volume, next: result.next.volume })
        : t('seriesReleases.toast.collected', { volume: result.collected.volume }),
    )
  } catch (reason) {
    dialogError.value = errorMessage(reason, 'seriesReleases.errors.collect')
  }
}

async function handleRemove() {
  const release = editing.value
  if (!release) return
  dialogError.value = null
  try {
    await remove(release.id)
    dialogOpen.value = false
  } catch (reason) {
    dialogError.value = errorMessage(reason, 'seriesReleases.errors.remove')
  }
}

async function changeTracking(patch: Parameters<typeof updateTracking>[0]) {
  try {
    await updateTracking(patch)
  } catch (reason) {
    toast.error(errorMessage(reason, 'seriesReleases.errors.tracking'))
  }
}

async function handleStop() {
  await changeTracking({ tracking: false })
  confirmStop.value = false
}

async function handleBackupChosen(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const entries = parseReleaseBackup(await file.text())
    const result = await importBackup(entries)
    const message = t('seriesReleases.import.done', { imported: result.imported, skipped: result.skipped.length })
    if (result.skipped.length > 0) toast.warning(message, { description: t('seriesReleases.import.skippedHint') })
    else toast.success(message)
  } catch (reason) {
    toast.error(
      reason instanceof ReleaseBackupError
        ? t(`seriesReleases.import.errors.${reason.reason}`)
        : errorMessage(reason, 'seriesReleases.errors.import'),
    )
  }
}
</script>

<template>
  <section v-if="visible && tracking" class="rounded-lg border border-border bg-muted/30 p-3" data-testid="series-upcoming">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <h2 class="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{{ t('seriesReleases.title') }}</h2>
          <RouterLink :to="{ name: 'series-releases' }" class="text-[11px] font-medium text-primary hover:underline">
            {{ t('seriesReleases.agenda.allLink') }}
          </RouterLink>
        </div>
        <p v-if="tracking.tracking" class="mt-0.5 text-xs text-muted-foreground">{{ checkedLabel }}</p>
        <div v-if="license" class="mt-0.5 flex flex-wrap items-center gap-1.5" data-testid="series-license-line">
          <p class="text-xs" :class="effectivelyLicensed ? 'text-success' : 'text-muted-foreground'">{{ licenseLabel }}</p>
          <select
            v-if="canEdit"
            class="h-5 rounded border border-border bg-background px-1 text-[11px] text-foreground"
            :value="license.override ?? ''"
            :disabled="saving"
            :aria-label="t('seriesReleases.license.overrideLabel')"
            @change="changeOverride(($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ t('seriesReleases.license.auto') }}</option>
            <option value="always">{{ t('seriesReleases.license.always') }}</option>
            <option value="never">{{ t('seriesReleases.license.never') }}</option>
          </select>
        </div>
      </div>

      <div v-if="canEdit" class="flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" :disabled="saving" @click="openAdd">
          <Plus :size="14" aria-hidden="true" />
          {{ tracking.tracking ? t('seriesReleases.actions.add') : t('seriesReleases.actions.track') }}
        </Button>
        <template v-if="tracking.tracking">
          <Button type="button" variant="outline" size="sm" :disabled="saving" @click="changeTracking({ checkedToday: true })">
            <CalendarCheck :size="14" aria-hidden="true" />
            {{ t('seriesReleases.actions.checkedToday') }}
          </Button>
          <Button type="button" variant="outline" size="sm" :disabled="saving" @click="changeTracking({ finished: !tracking.finished })">
            {{ tracking.finished ? t('seriesReleases.actions.moreExpected') : t('seriesReleases.actions.noMore') }}
          </Button>
          <Button type="button" variant="ghost" size="sm" :disabled="saving" @click="confirmStop = true">
            {{ t('seriesReleases.actions.stop') }}
          </Button>
        </template>
        <Button type="button" variant="ghost" size="sm" :disabled="saving" @click="backupInput?.click()">
          <FileUp :size="14" aria-hidden="true" />
          {{ t('seriesReleases.actions.importBackup') }}
        </Button>
        <input
          ref="backupInput"
          type="file"
          accept="application/json,.json"
          class="sr-only"
          data-testid="series-releases-backup"
          @change="handleBackupChosen"
        />
      </div>
    </div>

    <SeriesMangabakaSync :series-id="seriesId" />

    <p v-if="!tracking.tracking" class="mt-2 text-sm text-muted-foreground">{{ t('seriesReleases.untrackedHint') }}</p>

    <template v-else>
      <p v-if="checkDue" role="status" class="mt-2 flex items-start gap-2 text-xs text-[var(--pill-warning)]">
        <AlertCircle :size="14" class="mt-px shrink-0" aria-hidden="true" />
        <span>{{ t('seriesReleases.checkDue') }}</span>
      </p>

      <div v-if="releases.length > 0" class="mt-3 flex flex-wrap gap-3">
        <SeriesReleaseCard v-for="release in releases" :key="release.id" :release="release" :editable="canEdit" @select="openEdit" />
      </div>
      <p v-else class="mt-2 text-sm text-muted-foreground">
        {{ tracking.finished ? t('seriesReleases.finishedNote') : t('seriesReleases.noVolumes') }}
      </p>
      <p v-if="tracking.finished && releases.length > 0" class="mt-2 text-xs text-muted-foreground">{{ t('seriesReleases.finishedNote') }}</p>
    </template>

    <SeriesReleaseDialog
      :open="dialogOpen"
      :release="editing"
      :busy="saving"
      :error="dialogError"
      @submit="handleSubmit"
      @collect="handleCollect"
      @remove="handleRemove"
      @cancel="closeDialog"
    />

    <ConfirmDialog
      :open="confirmStop"
      :title="t('seriesReleases.confirmStop.title')"
      :description="t('seriesReleases.confirmStop.description')"
      :confirm-label="t('seriesReleases.confirmStop.confirm')"
      :busy="saving"
      @confirm="handleStop"
      @cancel="confirmStop = false"
    />
  </section>
</template>
