<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import { ArrowLeftRight, Loader2, RefreshCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import { errorMessage } from '@/lib/api-json'
import { useMangabakaSyncSettings } from '../composables/useMangabakaSync'
import MangabakaSyncResultLine from './MangabakaSyncResultLine.vue'

const ERROR_KEY = 'seriesReleases.errors.mangabakaSync'
const { settings, saving, error, load, save, syncAll } = useMangabakaSyncSettings()

const tokenInput = ref('')
const editingToken = ref(false)
const showTokenForm = computed(() => editingToken.value || (settings.value !== null && !settings.value.configured))
const running = computed(() => settings.value?.running ?? false)

function startReplacingToken(): void {
  editingToken.value = true
}

function cancelReplacingToken(): void {
  editingToken.value = false
  tokenInput.value = ''
}

async function saveToken(): Promise<void> {
  const token = tokenInput.value.trim()
  if (!token) return
  try {
    await save({ apiToken: token })
    tokenInput.value = ''
    editingToken.value = false
    toast.success('MangaBaka token saved.')
  } catch (reason) {
    toast.error(errorMessage(reason, ERROR_KEY))
  }
}

async function removeToken(): Promise<void> {
  try {
    await save({ apiToken: '' })
    editingToken.value = false
    toast.success('MangaBaka token removed.')
  } catch (reason) {
    toast.error(errorMessage(reason, ERROR_KEY))
  }
}

async function setEnabled(enabled: boolean): Promise<void> {
  try {
    await save({ enabled })
  } catch (reason) {
    toast.error(errorMessage(reason, ERROR_KEY))
  }
}

async function runAll(): Promise<void> {
  try {
    await syncAll()
    toast.success('Syncing every selected series to MangaBaka.')
  } catch (reason) {
    toast.error(errorMessage(reason, ERROR_KEY))
  }
}

onMounted(() => void load())
</script>

<template>
  <section class="mt-6 rounded-lg border border-border bg-muted/30 p-3" data-testid="mangabaka-sync-card">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="flex items-center gap-1.5">
          <ArrowLeftRight :size="14" class="text-muted-foreground" aria-hidden="true" />
          <h2 class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">MangaBaka reading sync</h2>
        </div>
        <p class="mt-0.5 text-xs text-muted-foreground">
          Sends the reading status, chapter and volume of the series you pick to your MangaBaka library. One way only, and never lowers MangaBaka's
          numbers. Pick a series with the switch on its page.
        </p>
      </div>
      <div v-if="settings?.configured" class="flex items-center gap-2">
        <label class="flex items-center gap-1.5 text-xs text-foreground">
          <ToggleSwitch :model-value="settings.enabled" :disabled="saving" aria-label="Sync to MangaBaka" @update:model-value="setEnabled" />
          {{ settings.enabled ? 'On' : 'Off' }}
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="saving || running || !settings.enabled || settings.series.length === 0"
          data-testid="mangabaka-sync-all"
          @click="runAll"
        >
          <Loader2 v-if="running" :size="14" class="animate-spin" aria-hidden="true" />
          <RefreshCw v-else :size="14" aria-hidden="true" />
          {{ running ? 'Syncing…' : 'Sync all now' }}
        </Button>
      </div>
    </div>

    <p v-if="error" role="alert" class="mt-2 text-xs text-destructive">{{ error }}</p>

    <template v-else-if="settings">
      <form v-if="showTokenForm" class="mt-2 flex flex-wrap items-center gap-2" data-testid="mangabaka-token-form" @submit.prevent="saveToken">
        <input
          v-model="tokenInput"
          type="password"
          autocomplete="off"
          spellcheck="false"
          placeholder="mb-…"
          aria-label="MangaBaka personal access token"
          class="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground"
        />
        <Button type="submit" size="sm" :disabled="saving || tokenInput.trim() === ''">Save token</Button>
        <Button v-if="editingToken" type="button" variant="ghost" size="sm" :disabled="saving" @click="cancelReplacingToken">Cancel</Button>
        <p class="basis-full text-[11px] text-muted-foreground">
          Create one on mangabaka.org under your account settings, API and apps, Personal access tokens. It is checked before it is saved, and stays
          on this server.
        </p>
      </form>
      <div v-else class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Token saved (…{{ settings.tokenHint }}).</span>
        <button type="button" class="font-medium text-primary hover:underline" :disabled="saving" @click="startReplacingToken">Replace</button>
        <button type="button" class="font-medium text-destructive hover:underline" :disabled="saving" @click="removeToken">Remove</button>
      </div>

      <ul v-if="settings.configured && settings.series.length > 0" class="mt-3 space-y-2" data-testid="mangabaka-sync-series">
        <li v-for="series in settings.series" :key="series.seriesId" class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-2">
            <RouterLink
              :to="{ name: 'series-detail', params: { seriesId: series.seriesId } }"
              class="truncate text-sm font-medium text-foreground hover:underline"
            >
              {{ series.seriesName }}
            </RouterLink>
            <a
              v-if="series.last?.url"
              :href="series.last.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[11px] text-primary hover:underline"
            >
              MangaBaka
            </a>
          </div>
          <MangabakaSyncResultLine :result="series.last" />
        </li>
      </ul>
      <p v-else-if="settings.configured" class="mt-2 text-xs text-muted-foreground">
        No series picked yet. Open a series and turn on "Sync to MangaBaka".
      </p>
    </template>
  </section>
</template>
