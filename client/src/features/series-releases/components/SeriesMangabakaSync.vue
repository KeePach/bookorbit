<script setup lang="ts">
import { watch } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import { RefreshCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import { errorMessage } from '@/lib/api-json'
import { useMangabakaSeriesSync } from '../composables/useMangabakaSync'
import MangabakaSyncResultLine from './MangabakaSyncResultLine.vue'

const props = defineProps<{ seriesId: number }>()

const ERROR_KEY = 'seriesReleases.errors.mangabakaSync'
const { status, busy, load, setSelected, syncNow } = useMangabakaSeriesSync(() => props.seriesId)

watch(
  () => props.seriesId,
  () => void load(),
  { immediate: true },
)

async function toggle(selected: boolean): Promise<void> {
  try {
    await setSelected(selected)
  } catch (reason) {
    toast.error(errorMessage(reason, ERROR_KEY))
  }
}

async function runNow(): Promise<void> {
  try {
    await syncNow()
  } catch (reason) {
    toast.error(errorMessage(reason, ERROR_KEY))
  }
}
</script>

<template>
  <div v-if="status?.configured" class="mt-2 border-t border-border/60 pt-2" data-testid="series-mangabaka-sync">
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex items-center gap-1.5 text-xs text-foreground">
        <ToggleSwitch
          :model-value="status.selected"
          :disabled="busy"
          aria-label="Sync to MangaBaka"
          data-testid="series-mangabaka-sync-toggle"
          @update:model-value="toggle"
        />
        Sync to MangaBaka
      </label>
      <a
        v-if="status.mangabakaId && status.last?.url"
        :href="status.last.url"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[11px] text-primary hover:underline"
      >
        MangaBaka #{{ status.mangabakaId }}
      </a>
      <span v-else-if="status.mangabakaId" class="text-[11px] text-muted-foreground">MangaBaka #{{ status.mangabakaId }}</span>
      <span v-else class="text-[11px] text-muted-foreground">No MangaBaka id on these books yet</span>
      <Button v-if="status.selected" type="button" variant="ghost" size="sm" class="h-6 px-2" :disabled="busy || !status.enabled" @click="runNow">
        <RefreshCw :size="12" :class="busy ? 'animate-spin' : ''" aria-hidden="true" />
        Sync now
      </Button>
      <RouterLink v-if="!status.enabled" :to="{ name: 'series-releases' }" class="text-[11px] text-muted-foreground hover:underline">
        Sync is switched off
      </RouterLink>
    </div>
    <MangabakaSyncResultLine v-if="status.selected" :result="status.last" class="mt-1" />
  </div>
</template>
