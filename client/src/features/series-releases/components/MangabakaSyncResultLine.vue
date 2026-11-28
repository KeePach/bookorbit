<script setup lang="ts">
import { computed } from 'vue'
import { AlertCircle, CheckCircle2, CircleDashed, MinusCircle } from '@lucide/vue'
import type { MangabakaSyncResult } from '@bookorbit/types'
import { formatDate } from '@/i18n/formatters'

const props = defineProps<{ result: MangabakaSyncResult | null }>()

const when = computed(() => {
  if (!props.result) return ''
  return formatDate(new Date(props.result.syncedAt), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
})

const tone = computed(() => {
  switch (props.result?.outcome) {
    case 'created':
    case 'updated':
      return 'text-success'
    case 'error':
      return 'text-destructive'
    default:
      return 'text-muted-foreground'
  }
})
</script>

<template>
  <p v-if="result" class="flex items-start gap-1.5 text-xs" :class="tone" data-testid="mangabaka-sync-result">
    <CheckCircle2 v-if="result.outcome === 'created' || result.outcome === 'updated'" :size="13" class="mt-px shrink-0" aria-hidden="true" />
    <AlertCircle v-else-if="result.outcome === 'error'" :size="13" class="mt-px shrink-0" aria-hidden="true" />
    <MinusCircle v-else-if="result.outcome === 'skipped'" :size="13" class="mt-px shrink-0" aria-hidden="true" />
    <CircleDashed v-else :size="13" class="mt-px shrink-0" aria-hidden="true" />
    <span>
      {{ result.message }}
      <span class="text-muted-foreground">· {{ when }}</span>
    </span>
  </p>
  <p v-else class="text-xs text-muted-foreground">Not synced yet.</p>
</template>
