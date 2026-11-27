<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CheckCircle2, Loader2, Wand2, X, XCircle } from '@lucide/vue'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import { useBookMetadataFetchStatus } from '@/features/book-metadata-fetch/composables/useBookMetadataFetchStatus'
import { dismissKccProgress, kccSession, resumeKccJobs } from '../lib/kcc-job-tracker'

/** KCC conversions in the corner, styled like the metadata fetch card, which it sits above. */
const { hasPermission } = usePermissions()
const { status: metadataStatus } = useBookMetadataFetchStatus()
const expanded = ref(false)

const session = kccSession
const metadataCardShown = computed(() => {
  const status = metadataStatus.value
  return status.queued + status.processing + status.failed > 0
})
const running = computed(() => session.value.remaining > 0)
const title = computed(() => (running.value ? 'Converting with KCC' : 'KCC conversion finished'))
const subtitle = computed(() => {
  const { remaining, done, failed, total } = session.value
  if (remaining > 0) return total > 1 ? `${done + failed} of ${total} done` : 'This can take a few minutes'
  const parts = [`${done} converted`]
  if (failed) parts.push(`${failed} failed`)
  return parts.join(', ')
})
const detail = computed(() => {
  if (session.value.current) return session.value.current.title
  const last = session.value.jobs.at(-1)
  if (!running.value && session.value.total === 1 && last?.state === 'done') return `${last.outputName} is ready`
  return ' '
})
const progressPercent = computed(() => {
  const { total, done, failed } = session.value
  return total === 0 ? 0 : Math.round(((done + failed) / total) * 100)
})
const iconClass = computed(() => {
  if (running.value) return 'text-primary animate-pulse'
  return session.value.failed > 0 ? 'text-destructive' : 'text-success'
})

function toggleExpanded(): void {
  expanded.value = !expanded.value
}

function handleDismiss(): void {
  expanded.value = false
  dismissKccProgress()
}

onMounted(() => {
  if (hasPermission('library_edit_metadata')) void resumeKccJobs().catch(() => undefined)
})
</script>

<template>
  <div
    v-if="session.visible"
    class="fixed end-3 z-50 flex flex-col items-end gap-2 sm:end-6"
    :class="
      metadataCardShown
        ? 'bottom-[calc(11rem+env(safe-area-inset-bottom))] sm:bottom-[6.5rem]'
        : 'bottom-[calc(6rem+env(safe-area-inset-bottom))] sm:bottom-6'
    "
  >
    <div v-if="expanded" class="w-80 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-popover shadow-xl">
      <div class="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span class="text-xs font-semibold text-foreground">KCC conversions</span>
        <button
          class="rounded-xs p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Close list"
          @click="toggleExpanded"
        >
          <X :size="14" aria-hidden="true" />
        </button>
      </div>
      <ul class="max-h-72 divide-y divide-border overflow-y-auto">
        <li v-for="job in session.jobs" :key="job.id" class="flex items-start gap-2 px-4 py-2 text-xs">
          <Loader2 v-if="job.state === 'running'" :size="14" class="mt-0.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
          <CheckCircle2 v-else-if="job.state === 'done'" :size="14" class="mt-0.5 shrink-0 text-success" aria-hidden="true" />
          <XCircle v-else-if="job.state === 'failed'" :size="14" class="mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
          <span v-else class="mt-1 size-2.5 shrink-0 rounded-full border border-muted-foreground/50" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <router-link :to="`/book/${job.bookId}`" class="block truncate text-foreground hover:underline">{{ job.title }}</router-link>
            <span v-if="job.state === 'done'" class="block truncate text-muted-foreground">{{ job.outputName }}</span>
            <span v-if="job.state === 'done' && job.warning" class="block text-warning">{{ job.warning }}</span>
            <span v-else-if="job.state === 'failed'" class="block text-destructive">{{ job.error }}</span>
            <span v-else-if="job.state === 'queued'" class="block text-muted-foreground">Waiting</span>
          </div>
        </li>
      </ul>
    </div>

    <div class="relative w-60">
      <button
        class="relative flex w-full items-center gap-3 overflow-hidden rounded-lg border border-border bg-card px-4 py-3 pe-9 text-sm shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click="toggleExpanded"
      >
        <div class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60">
          <Wand2 :size="20" :class="iconClass" />
        </div>
        <div class="flex min-w-0 flex-col items-start gap-0.5">
          <span class="text-xs font-semibold leading-none text-foreground">{{ title }}</span>
          <span class="text-xs leading-none text-muted-foreground">{{ subtitle }}</span>
          <span class="mt-0.5 w-full truncate text-start text-xs leading-none text-muted-foreground">{{ detail }}</span>
        </div>
        <div class="absolute bottom-0 end-0 start-0 h-[3px] bg-muted">
          <div class="h-full bg-primary transition-all duration-500" :style="{ width: `${running ? progressPercent : 100}%` }" />
        </div>
      </button>
      <button
        class="absolute end-1.5 top-1.5 rounded-xs p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Hide KCC progress"
        @click="handleDismiss"
      >
        <X :size="14" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
