<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ImagePlus, Trash2, X } from '@lucide/vue'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import {
  SERIES_RELEASE_NOTE_MAX_LENGTH,
  SERIES_RELEASE_URL_MAX_LENGTH,
  SERIES_RELEASE_VOLUME_MAX_LENGTH,
  type SeriesRelease,
  type SeriesReleaseInput,
} from '@bookorbit/types'
import { Button } from '@/components/ui/button'
import { fileToCoverDataUrl } from '../lib/cover-image'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** The volume being edited, or null to add a new one. */
    release: SeriesRelease | null
    busy?: boolean
    error?: string | null
  }>(),
  { busy: false, error: null },
)

const emit = defineEmits<{ submit: [input: SeriesReleaseInput]; collect: []; remove: []; cancel: [] }>()

const { t } = useI18n()
const formId = `series-release-${useId()}`

const volume = ref('')
const releaseDate = ref('')
const storeUrl = ref('')
const note = ref('')
const cover = ref<string | null>(null)
const coverError = ref<string | null>(null)

const editing = computed(() => props.release !== null)
const canSubmit = computed(() => !props.busy && volume.value.trim().length > 0)

/** The cover link box shows a typed link, and nothing for an uploaded picture. */
const coverLink = computed({
  get: () => (cover.value && !cover.value.startsWith('data:') ? cover.value : ''),
  set: (value: string) => {
    coverError.value = null
    cover.value = value.trim() || null
  },
})

watch(
  () => [props.open, props.release] as const,
  ([open, release]) => {
    if (!open) return
    volume.value = release?.volume ?? ''
    releaseDate.value = release?.releaseDate ?? ''
    storeUrl.value = release?.storeUrl ?? ''
    note.value = release?.note ?? ''
    cover.value = release?.cover ?? null
    coverError.value = null
  },
  { immediate: true },
)

async function handleFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  coverError.value = null
  try {
    cover.value = await fileToCoverDataUrl(file)
  } catch {
    coverError.value = t('seriesReleases.dialog.coverReadFailed')
  }
}

function handleOpenChange(open: boolean) {
  if (!open && !props.busy) emit('cancel')
}

function handleSubmit() {
  if (!canSubmit.value) return
  emit('submit', {
    volume: volume.value.trim(),
    releaseDate: releaseDate.value || null,
    storeUrl: storeUrl.value.trim() || null,
    note: note.value.trim() || null,
    cover: cover.value,
  })
}
</script>

<template>
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-[60] bg-scrim" />
      <DialogContent
        aria-modal="true"
        class="fixed left-1/2 top-1/2 z-[60] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-card shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div class="border-b border-border px-5 pb-4 pt-5">
          <DialogTitle class="text-lg font-semibold text-foreground">
            {{ editing ? t('seriesReleases.dialog.editTitle') : t('seriesReleases.dialog.addTitle') }}
          </DialogTitle>
          <DialogDescription class="mt-1 text-sm text-muted-foreground">{{ t('seriesReleases.dialog.description') }}</DialogDescription>
        </div>

        <form :id="formId" class="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" @submit.prevent="handleSubmit">
          <div class="space-y-1.5">
            <label :for="`${formId}-volume`" class="settings-label block">{{ t('seriesReleases.dialog.volume') }}</label>
            <input
              :id="`${formId}-volume`"
              v-model="volume"
              type="text"
              required
              autocomplete="off"
              :maxlength="SERIES_RELEASE_VOLUME_MAX_LENGTH"
              :placeholder="t('seriesReleases.dialog.volumePlaceholder')"
              class="input-field w-full"
            />
          </div>

          <div class="space-y-1.5">
            <label :for="`${formId}-date`" class="settings-label block">{{ t('seriesReleases.dialog.releaseDate') }}</label>
            <input :id="`${formId}-date`" v-model="releaseDate" type="date" class="input-field w-full" />
            <p class="settings-hint">{{ t('seriesReleases.dialog.releaseDateHint') }}</p>
          </div>

          <div class="space-y-1.5">
            <label :for="`${formId}-store`" class="settings-label block">{{ t('seriesReleases.dialog.storeUrl') }}</label>
            <input
              :id="`${formId}-store`"
              v-model="storeUrl"
              type="url"
              autocomplete="off"
              :maxlength="SERIES_RELEASE_URL_MAX_LENGTH"
              placeholder="https://"
              class="input-field w-full"
            />
          </div>

          <div class="space-y-1.5">
            <label :for="`${formId}-note`" class="settings-label block">{{ t('seriesReleases.dialog.note') }}</label>
            <input
              :id="`${formId}-note`"
              v-model="note"
              type="text"
              autocomplete="off"
              :maxlength="SERIES_RELEASE_NOTE_MAX_LENGTH"
              :placeholder="t('seriesReleases.dialog.notePlaceholder')"
              class="input-field w-full"
            />
          </div>

          <div class="space-y-2">
            <span class="settings-label block">{{ t('seriesReleases.dialog.cover') }}</span>
            <div class="flex items-start gap-3">
              <div class="aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-md border border-dashed border-border bg-muted/40">
                <img v-if="cover" :src="cover" alt="" class="size-full object-cover" />
              </div>
              <div class="min-w-0 flex-1 space-y-2">
                <input
                  v-model="coverLink"
                  type="url"
                  autocomplete="off"
                  :aria-label="t('seriesReleases.dialog.coverLink')"
                  :placeholder="t('seriesReleases.dialog.coverLink')"
                  class="input-field w-full"
                />
                <div class="flex flex-wrap items-center gap-2">
                  <label
                    class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm hover:bg-muted focus-within:ring-2 focus-within:ring-ring"
                  >
                    <ImagePlus :size="14" aria-hidden="true" />
                    {{ t('seriesReleases.dialog.coverUpload') }}
                    <input type="file" accept="image/*" class="sr-only" @change="handleFile" />
                  </label>
                  <Button v-if="cover" type="button" variant="ghost" size="sm" @click="cover = null">
                    <X :size="14" aria-hidden="true" />
                    {{ t('seriesReleases.dialog.coverRemove') }}
                  </Button>
                </div>
                <p v-if="coverError" role="alert" class="text-xs text-destructive">{{ coverError }}</p>
                <p v-else class="settings-hint">{{ t('seriesReleases.dialog.coverHint') }}</p>
              </div>
            </div>
          </div>

          <p v-if="error" role="alert" class="settings-error-state">{{ error }}</p>
        </form>

        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
          <div class="flex items-center gap-2">
            <Button v-if="editing" type="button" variant="destructive-ghost" size="sm" :disabled="busy" @click="emit('remove')">
              <Trash2 :size="14" aria-hidden="true" />
              {{ t('seriesReleases.dialog.delete') }}
            </Button>
            <Button v-if="editing" type="button" variant="outline" size="sm" :disabled="busy" @click="emit('collect')">
              {{ t('seriesReleases.dialog.collect') }}
            </Button>
          </div>
          <div class="flex items-center gap-2">
            <Button type="button" variant="outline" :disabled="busy" @click="emit('cancel')">{{ t('common.cancel') }}</Button>
            <Button type="submit" :form="formId" :disabled="!canSubmit">
              {{ busy ? t('seriesReleases.dialog.saving') : t('common.save') }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
