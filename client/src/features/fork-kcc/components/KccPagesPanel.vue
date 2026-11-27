<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Check, Loader2, RotateCcw, Trash2, Undo2 } from '@lucide/vue'
import type { KccPagesInfo } from '@bookorbit/types'
import { Button } from '@/components/ui/button'
import { kccApi, kccErrorText, kccPageThumbUrl } from '../lib/kcc-api'
import { clickPage, describePages, keptPages } from '../lib/kcc-page-selection'

/**
 * The Convert dialog's Pages tab: every page of the book, in the comic reader's order. Removing
 * pages only hides them here; the conversion leaves them out, and the book's file isn't touched
 * until then.
 */
const props = defineProps<{ bookId: number; removed: number[]; disabled?: boolean }>()
const emit = defineEmits<{ 'update:removed': [value: number[]] }>()

const info = ref<KccPagesInfo | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const selected = ref(new Set<number>())
const anchor = ref<number | null>(null)
/** Each Remove, so Undo can bring back the last batch of pages. */
const history = ref<number[][]>([])

const shown = computed(() => (info.value ? keptPages(info.value.pageCount, props.removed) : []))
const removedText = computed(() => describePages(props.removed))

function handlePageClick(page: number, event: MouseEvent): void {
  if (props.disabled) return
  const next = clickPage(selected.value, shown.value, page, anchor.value, event.shiftKey)
  selected.value = next.selected
  anchor.value = next.anchor
}

function handleClearSelection(): void {
  selected.value = new Set()
  anchor.value = null
}

function handleRemove(): void {
  if (selected.value.size === 0) return
  const pages = [...selected.value]
  history.value = [...history.value, pages]
  emit(
    'update:removed',
    [...props.removed, ...pages].sort((a, b) => a - b),
  )
  handleClearSelection()
}

function handleUndo(): void {
  const last = history.value.at(-1)
  if (!last) return
  history.value = history.value.slice(0, -1)
  const restore = new Set(last)
  emit(
    'update:removed',
    props.removed.filter((page) => !restore.has(page)),
  )
}

function handleRestoreAll(): void {
  history.value = []
  emit('update:removed', [])
}

onMounted(async () => {
  try {
    info.value = await kccApi.pages(props.bookId)
  } catch (reason) {
    error.value = kccErrorText(reason)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-3">
    <div v-if="loading" class="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 :size="16" class="animate-spin" aria-hidden="true" />
      Reading the pages...
    </div>
    <p v-else-if="error" class="settings-error-state">{{ error }}</p>
    <p v-else-if="info && !info.supported" class="settings-hint">{{ info.reason }}. The whole file is converted.</p>

    <template v-else-if="info">
      <div class="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-card pb-2">
        <span class="text-sm text-muted-foreground">
          {{ shown.length }} of {{ info.pageCount }} pages
          <template v-if="selected.size">· {{ selected.size }} selected</template>
        </span>
        <div class="ms-auto flex flex-wrap gap-2">
          <Button v-if="selected.size" variant="ghost" size="sm" :disabled="disabled" @click="handleClearSelection">Clear selection</Button>
          <Button variant="destructive-ghost" size="sm" :disabled="disabled || selected.size === 0" @click="handleRemove">
            <Trash2 :size="14" aria-hidden="true" />
            Remove selected
          </Button>
        </div>
      </div>

      <div v-if="removed.length" class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
        <span class="min-w-0 flex-1">
          Removed {{ removed.length }} {{ removed.length === 1 ? 'page' : 'pages' }}: {{ removedText }}. The conversion leaves
          {{ removed.length === 1 ? 'it' : 'them' }} out.
        </span>
        <Button v-if="history.length" variant="ghost" size="sm" :disabled="disabled" @click="handleUndo">
          <Undo2 :size="14" aria-hidden="true" />
          Undo
        </Button>
        <Button variant="ghost" size="sm" :disabled="disabled" @click="handleRestoreAll">
          <RotateCcw :size="14" aria-hidden="true" />
          Restore all
        </Button>
      </div>

      <p class="settings-hint">Click pages to select them, shift-click to select a range, then remove them.</p>

      <ul class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        <li v-for="page in shown" :key="page">
          <button
            type="button"
            class="group relative block w-full overflow-hidden rounded-md border-2 bg-muted text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="selected.has(page) ? 'border-destructive' : 'border-transparent hover:border-border'"
            :aria-pressed="selected.has(page)"
            :aria-label="`Page ${page + 1}`"
            :disabled="disabled"
            @click="handlePageClick(page, $event)"
          >
            <img
              :src="kccPageThumbUrl(bookId, page)"
              :alt="`Page ${page + 1}`"
              loading="lazy"
              decoding="async"
              class="aspect-[2/3] w-full object-contain"
            />
            <span class="absolute bottom-1 start-1 rounded bg-background/85 px-1.5 text-xs tabular-nums text-foreground">{{ page + 1 }}</span>
            <span
              v-if="selected.has(page)"
              class="absolute end-1 top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
            >
              <Check :size="12" aria-hidden="true" />
            </span>
            <span v-if="selected.has(page)" class="absolute inset-0 bg-destructive/15" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>
