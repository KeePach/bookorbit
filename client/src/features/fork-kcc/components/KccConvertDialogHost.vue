<script setup lang="ts">
import { computed, watch } from 'vue'
import { AlertTriangle, CheckCircle2, Loader2, Wand2, XCircle } from '@lucide/vue'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import type { KccOptionValues } from '@bookorbit/types'
import { Button } from '@/components/ui/button'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import KccOptionsForm from './KccOptionsForm.vue'
import { useKccConvert } from '../composables/useKccConvert'
import { useKccConvertDialog } from '../composables/useKccConvertDialog'

const { target, close } = useKccConvertDialog()
const convert = useKccConvert()
const { status, check, presets, schema, job, loading, starting, error, mode, presetId, customOptions, force, running, modeBlockedReason, canStart } =
  convert

const open = computed(() => target.value !== null)
const presetValue = computed({
  get: () => (presetId.value === null ? '' : String(presetId.value)),
  set: (value: string) => {
    presetId.value = value === '' ? null : Number(value)
    customOptions.value = null
  },
})
const forceWarning = computed(() => {
  if (!check.value) return null
  if (check.value.alreadyConverted) return `${check.value.fileName} looks like it was already converted with KCC (its pages carry KCC's names).`
  if (mode.value === 'keep' && check.value.keepCopyExists) return `${check.value.keepCopyName} already exists and will be overwritten.`
  return null
})
const resultText = computed(() => {
  if (job.value?.state !== 'done') return null
  return job.value.mode === 'replace'
    ? `${job.value.outputName} replaced the original in the book's folder. Drag it to your Kobo.`
    : `${job.value.outputName} is next to the original. Drag it to your Kobo.`
})

watch(
  () => target.value?.bookId,
  (bookId) => {
    if (bookId !== undefined) void convert.load(bookId)
  },
)

function handleOpenChange(value: boolean): void {
  if (!value) close()
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
        class="fixed left-1/2 top-1/2 z-[60] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-card shadow-xl focus-visible:outline-none"
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

            <div v-if="check" class="space-y-2">
              <p class="settings-label">Result</p>
              <div class="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  class="rounded-md border p-3 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  :class="mode === 'keep' ? 'border-primary bg-primary/10' : 'border-input hover:bg-muted'"
                  :disabled="!check.canKeep || running"
                  @click="handleKeep"
                >
                  <span class="block text-sm font-medium">Keep original</span>
                  <span class="block text-xs text-muted-foreground">Adds {{ check.keepCopyName }} next to it</span>
                </button>
                <button
                  type="button"
                  class="rounded-md border p-3 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  :class="mode === 'replace' ? 'border-primary bg-primary/10' : 'border-input hover:bg-muted'"
                  :disabled="!check.canReplace || running"
                  @click="handleReplace"
                >
                  <span class="block text-sm font-medium">Replace original</span>
                  <span class="block text-xs text-muted-foreground">The book's file becomes the CBZ</span>
                </button>
              </div>
              <p v-if="!check.canKeep" class="settings-hint">Keep: {{ check.keepBlockedReason }}</p>
              <p v-if="!check.canReplace" class="settings-hint">Replace: {{ check.replaceBlockedReason }}</p>
            </div>

            <div v-if="check && !modeBlockedReason" class="space-y-2">
              <label for="kcc-convert-preset" class="settings-label block">Options</label>
              <div class="flex flex-col gap-2 sm:flex-row">
                <select id="kcc-convert-preset" v-model="presetValue" class="input-field flex-1" :disabled="running">
                  <option value="">KCC defaults</option>
                  <option v-for="preset in presets" :key="preset.id" :value="String(preset.id)">{{ preset.name }}</option>
                </select>
                <Button v-if="schema && customOptions === null" variant="outline" size="sm" :disabled="running" @click="handleCustomize">
                  Adjust for this book
                </Button>
              </div>
              <KccOptionsForm
                v-if="schema && customOptions !== null"
                :schema="schema"
                :model-value="customOptions"
                :disabled="running"
                @update:model-value="handleCustomOptions"
              />
            </div>

            <div
              v-if="forceWarning && !running && job?.state !== 'done'"
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

            <div v-if="running" class="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 :size="16" class="animate-spin" aria-hidden="true" />
              Converting... KCC can take a few minutes per volume. You can close this window: a notice in the corner shows when it's done.
            </div>
            <div v-else-if="resultText" class="flex items-start gap-2 text-sm text-foreground">
              <CheckCircle2 :size="16" class="mt-0.5 shrink-0 text-success" aria-hidden="true" />
              <span>{{ resultText }}</span>
            </div>
            <div v-else-if="job?.state === 'failed'" class="flex items-start gap-2 text-sm text-destructive">
              <XCircle :size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{{ job.error }}</span>
            </div>
            <p v-if="job?.ignoredOptions.length" class="settings-hint">
              Left out (this KCC version doesn't have them): {{ job.ignoredOptions.join(', ') }}
            </p>
            <p v-if="error" role="alert" class="settings-error-state">{{ error }}</p>
          </template>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" size="sm" @click="close">Close</Button>
          <Button size="sm" :disabled="!canStart" @click="handleStart">
            <Loader2 v-if="starting" :size="14" class="animate-spin" aria-hidden="true" />
            Convert
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
