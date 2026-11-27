<script setup lang="ts">
import { computed } from 'vue'
import { Wand2 } from '@lucide/vue'
import { getPrimaryBookFile, type BookFileRef } from '@bookorbit/types'
import { useKccConvertDialog } from '../composables/useKccConvertDialog'
import { KCC_SOURCE_FORMATS } from '../lib/kcc-api'

const props = defineProps<{ bookId: number; title: string; files: readonly Pick<BookFileRef, 'format' | 'role'>[] }>()
const emit = defineEmits<{ select: [] }>()

const { open } = useKccConvertDialog()
const visible = computed(() => {
  const format = getPrimaryBookFile(props.files)?.format?.toLowerCase()
  return format !== undefined && KCC_SOURCE_FORMATS.has(format)
})

function handleClick(): void {
  emit('select')
  open({ selection: { bookIds: [props.bookId] }, count: 1, title: props.title })
}
</script>

<template>
  <button
    v-if="visible"
    class="flex w-full items-center gap-2 px-2 py-1.5 text-start rounded-xs text-sm text-foreground hover:bg-muted transition-colors"
    data-testid="detail-kcc-convert"
    @click="handleClick"
  >
    <Wand2 class="size-3.5 shrink-0" aria-hidden="true" />
    Convert with KCC
  </button>
</template>
