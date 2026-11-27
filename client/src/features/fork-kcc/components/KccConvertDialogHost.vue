<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, CheckCircle2, Loader2, Save, Wand2, XCircle } from '@lucide/vue'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import type { KccOptionValues } from '@bookorbit/types'
import { Button } from '@/components/ui/button'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import KccOptionsForm from './KccOptionsForm.vue'
import KccPagesPanel from './KccPagesPanel.vue'
import { useKccConvert } from '../composables/useKccConvert'
import { useKccConvertDialog } from '../composables/useKccConvertDialog'

const { target, close } = useKccConvertDialog()
const convert = useKccConvert()
const {
  isBatch,
  status,
  check,
  presets,
  schema,
  job,
  batchResult,
  loading,
  starting,
  savingPreset,
  error,
  mode,
  presetId,
  customOptions,
  force,
  running,
  selectedPreset,
  modeBlockedReason,
  canStart,
  removePages,
} = convert

const newPresetName = ref('')
const tab = ref<'options' | 'pages'>('options')
/** The Pages tab loads its thumbnails only once it is first opened. */
const pagesOpened = ref(false)
const open = computed(() => target.value !== null)
const presetValue = computed({
  get: () => (presetId.value === null ? '' : String(presetId.value)),
  set: (value: string) => convert.selectPreset(value === '' ? null : Number(value)),
})
const forceWarning = computed(() => {
  if (isBatch.value || !check.value) return null
  if (check.value.alreadyConverted) return `${check.value.fileName} looks like it was already converted with KCC (its pages carry KCC's names).`
  if (mode.value === 'keep' && check.value.keepCopyExists) return `${check.value.keepCopyName} already exists and will be overwritten.`
  return null
})
const resultText = computed(() => {
  if (job.value?.state !== 'done') return null
  const removed = job.value.removedPages
  const left = removed ? ` (${removed} ${removed === 1 ? 'page' : 'pages'} left out)` : ''
  const where = job.value.mode === 'replace' ? "replaced the original and follows the library's naming pattern" : 'is next to the original'
  return `${job.value.outputName} ${where}${left}. Drag it to your Kobo.`
})
const keepDisabled = computed(() => running.value || (!isBatch.value && check.value?.canKeep === false))
const replaceDisabled = computed(() => running.value || (!isBatch.value && check.value?.canReplace === false))
const keepHint = computed(() =>
  isBatch.value || !check.value ? 'Adds Name_kcc.cbz next to each book' : `Adds ${check.value.keepCopyName} next to it`,
)
const replaceHint = computed(() =>
  isBatch.value
    ? "Each book's file becomes the CBZ, renamed with the library's pattern"
    : "The book's file becomes the CBZ, renamed with the library's pattern",
)
const canSaveNew = computed(() => !savingPreset.value && newPresetName.value.trim().length > 0)

watch(target, (next) => {
  newPresetName.value = ''
  tab.value = 'options'
  pagesOpened.value = false
  if (next) void convert.load(next)
})

function handleOpenChange(value: boolean): void {
  if (!value) close()
}

function handleOptionsTab(): void {
  tab.value = 'options'
}

function handlePagesTab(): void {
  tab.value = 'pages'
  pagesOpened.value = true
}

function handleKeep(): void {
  mode.value = 'keep'
}

function handleReplace(): void {
  mode.value = 'replace'
}

function handleCustomize(): void {
  convert.customize()
}

function handleCustomOptions(value: KccOptionValues): void {
  customOptions.value = value
}

function handleForce(value: boolean): void {
  force.value = value
}

function handleSaveNew(): void {
  if (!canSaveNew.value) return
  void convert.savePreset(newPresetName.value).then(() => {
    if (!error.value) newPresetName.value = ''
  })
}

function handleUpdatePreset(): void {
  void convert.savePreset(null)
}

function handleStart(): void {
  void convert.start()
}
</script>

<template>
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-[60] bg-scrim" />
      <DialogContent
        aria-modal="true"
        :class="tab === 'pages' && !isBatch ? 'max-w-4xl' : 'max-w-2xl'"
        class="fixed left-1/2 top-1/2 z-[60] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-card shadow-xl focus-visible:outline-none"
      >
        <div class="border-b border-border px-5 pb-4 pt-5">
          <DialogTitle class="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Wand2 :size="18" aria-hidden="true" />
            Convert with KCC
          </DialogTitle>
          <DialogDescription class="mt-1 truncate text-sm text-muted-foreground">
            {{ target?.title }}<span v-if="check"> - {{ check.fileName }}</span>
          </DialogDescription>
        </div>

        <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div v-if="loading" class="settings-loading-state">Loading...</div>
          <template v-else>
            <p v-if="status && !status.configured" class="settings-error-state">KCC is not set up (FORK_KCC_URL). See Settings > KCC.</p>
            <p v-else-if="status && !status.reachable" class="settings-error-state">Can't reach the KCC container: {{ status.error }}</p>

            <template v-if="batchResult">
              <div class="flex items-start gap-2 text-sm text-foreground">
                <CheckCircle2 :size="16" class="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                <span>
                  {{ batchResult.jobs.length }} {{ batchResult.jobs.length === 1 ? 'book is' : 'books are' }} queued. The card in the corner shows the
                  progress, so you can close this window.
                </span>
              </div>
              <div v-if="batchResult.skipped.length" class="space-y-1">
                <p class="settings-label">Skipped {{ batchResult.skipped.length }}</p>
                <ul class="max-h-56 space-y-1 overflow-y-auto text-xs">
                  <li v-for="skip in batchResult.skipped" :key="skip.bookId" class="text-muted-foreground">
                    <span class="text-foreground">{{ skip.title ?? `Book ${skip.bookId}` }}</span>: {{ skip.reason }}
                  </li>
                </ul>
              </div>
            </template>

            <template v-else-if="status?.reachable && (isBatch || check)">
              <div v-if="!isBatch" class="flex gap-1 border-b border-border" role="tablist">
                <button
                  type="button"
                  role="tab"
                  class="-mb-px border-b-2 px-3 py-1.5 text-sm transition-colors"
                  :class="tab === 'options' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
                  :aria-selected="tab === 'options'"
                  @click="handleOptionsTab"
                >
                  Options
                </button>
                <button
                  type="button"
                  role="tab"
                  class="-mb-px border-b-2 px-3 py-1.5 text-sm transition-colors"
                  :class="tab === 'pages' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
                  :aria-selected="tab === 'pages'"
                  @click="handlePagesTab"
                >
                  Pages<span v-if="removePages.length" class="text-muted-foreground"> ({{ removePages.length }} removed)</span>
                </button>
              </div>
              <KccPagesPanel
                v-if="!isBatch && pagesOpened && target"
                v-show="tab === 'pages'"
                v-model:removed="removePages"
                :book-id="target.selection.bookIds?.[0] ?? 0"
                :disabled="running"
              />
              <div v-show="isBatch || tab === 'options'" class="space-y-5">
                <div class="space-y-2">
                  <p class="settings-label">Result</p>
                  <div class="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      class="rounded-md border p-3 text-start transition-colors disabled:cursor-not-allowed disabled:border-dashed disabled:bg-muted/30"
                      :class="mode === 'keep' ? 'border-primary bg-primary/10' : 'border-input hover:bg-muted'"
                      :disabled="keepDisabled"
                      @click="handleKeep"
                    >
                      <span class="block text-sm font-medium">Keep original</span>
                      <span v-if="check && !check.canKeep" class="block text-xs text-warning">{{ check.keepBlockedReason }}</span>
                      <span v-else class="block text-xs text-muted-foreground">{{ keepHint }}</span>
                    </button>
                    <button
                      type="button"
                      class="rounded-md border p-3 text-start transition-colors disabled:cursor-not-allowed disabled:border-dashed disabled:bg-muted/30"
                      :class="mode === 'replace' ? 'border-primary bg-primary/10' : 'border-input hover:bg-muted'"
                      :disabled="replaceDisabled"
                      @click="handleReplace"
                    >
                      <span class="block text-sm font-medium">Replace original</span>
                      <span v-if="check && !check.canReplace" class="block text-xs text-warning">{{ check.replaceBlockedReason }}</span>
                      <span v-else class="block text-xs text-muted-foreground">{{ replaceHint }}</span>
                    </button>
                  </div>
                  <p v-if="isBatch" class="settings-hint">Books that can't be converted this way are skipped and listed with the reason.</p>
                </div>

                <div v-if="!modeBlockedReason" class="space-y-2">
                  <label for="kcc-convert-preset" class="settings-label block">Options</label>
                  <div class="flex flex-col gap-2 sm:flex-row">
                    <select id="kcc-convert-preset" v-model="presetValue" class="input-field flex-1" :disabled="running">
                      <option value="">KCC defaults</option>
                      <option v-for="preset in presets" :key="preset.id" :value="String(preset.id)">{{ preset.name }}</option>
                    </select>
                    <Button v-if="schema && customOptions === null" variant="outline" size="sm" :disabled="running" @click="handleCustomize">
                      {{ selectedPreset ? 'Edit options' : 'Choose options' }}
                    </Button>
                  </div>
                  <p v-if="!presets.length && customOptions === null" class="settings-hint">
                    No presets yet. Choose options, then save them as a preset to use them again.
                  </p>

                  <template v-if="schema && customOptions !== null">
                    <div class="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 sm:flex-row sm:items-center">
                      <input
                        v-model="newPresetName"
                        type="text"
                        maxlength="100"
                        class="input-field flex-1"
                        placeholder="New preset name, e.g. Manga - Libra Colour"
                        aria-label="New preset name"
                      />
                      <Button size="sm" variant="outline" :disabled="!canSaveNew" @click="handleSaveNew">
                        <Save :size="14" aria-hidden="true" />
                        Save as new preset
                      </Button>
                      <Button v-if="selectedPreset" size="sm" variant="outline" :disabled="savingPreset" @click="handleUpdatePreset">
                        Update "{{ selectedPreset.name }}"
                      </Button>
                    </div>
                    <p class="settings-hint">Not saving is fine too: Convert uses these options just this once.</p>
                    <KccOptionsForm :schema="schema" :model-value="customOptions" :disabled="running" @update:model-value="handleCustomOptions" />
                  </template>
                </div>

                <div v-if="isBatch" class="flex items-start gap-3 rounded-md border border-border p-3">
                  <ToggleSwitch :model-value="force" @update:model-value="handleForce" />
                  <span class="text-sm">Also convert books that already look converted, and overwrite existing _kcc copies</span>
                </div>
                <div
                  v-else-if="forceWarning && !running && job?.state !== 'done'"
                  class="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3"
                >
                  <AlertTriangle :size="16" class="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                  <div class="min-w-0 flex-1 space-y-2 text-sm">
                    <p>{{ forceWarning }}</p>
                    <label class="flex items-center gap-2">
                      <ToggleSwitch :model-value="force" @update:model-value="handleForce" />
                      Convert anyway
                    </label>
                  </div>
                </div>
              </div>
              <p
                v-if="removePages.length && mode === 'replace' && !running && job?.state !== 'done'"
                class="flex items-start gap-2 text-sm text-warning"
              >
                <AlertTriangle :size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
                The {{ removePages.length }} removed {{ removePages.length === 1 ? 'page' : 'pages' }} will be gone from the book's file, since
                Replace swaps it for the CBZ.
              </p>
              <div v-if="running" class="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 :size="16" class="animate-spin" aria-hidden="true" />
                Converting... You can close this window: the card in the corner shows when it's done.
              </div>
              <div v-else-if="resultText" class="flex items-start gap-2 text-sm text-foreground">
                <CheckCircle2 :size="16" class="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                <span>{{ resultText }}</span>
              </div>
              <div v-if="job?.state === 'done' && job.warning" class="flex items-start gap-2 text-sm text-warning">
                <AlertTriangle :size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{{ job.warning }}</span>
              </div>
              <div v-else-if="job?.state === 'failed'" class="flex items-start gap-2 text-sm text-destructive">
                <XCircle :size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{{ job.error }}</span>
              </div>
              <p v-if="job?.ignoredOptions.length" class="settings-hint">
                Left out (this KCC version doesn't have them): {{ job.ignoredOptions.join(', ') }}
              </p>
            </template>
            <p v-if="error" role="alert" class="settings-error-state">{{ error }}</p>
          </template>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" size="sm" @click="close">Close</Button>
          <Button v-if="!batchResult" size="sm" :disabled="!canStart" @click="handleStart">
            <Loader2 v-if="starting" :size="14" class="animate-spin" aria-hidden="true" />
            {{ isBatch ? `Convert ${target?.count.toLocaleString()} books` : 'Convert' }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
