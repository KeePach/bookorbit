<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Plus, RefreshCw, Save, Trash2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import type { KccOptionValues, KccPreset } from '@bookorbit/types'
import { Button } from '@/components/ui/button'
import KccOptionsForm from '../components/KccOptionsForm.vue'
import { useKccPresets } from '../composables/useKccPresets'
import { kccErrorText } from '../lib/kcc-api'

const { status, schema, presets, loading, error, load, save, remove } = useKccPresets()

const selectedId = ref<number | null>(null)
const name = ref('')
const options = ref<KccOptionValues>({})
const saving = ref(false)
const editing = ref(false)

const canSave = computed(() => !saving.value && name.value.trim().length > 0)

function edit(preset: KccPreset | null): void {
  selectedId.value = preset?.id ?? null
  name.value = preset?.name ?? ''
  options.value = { ...preset?.options }
  editing.value = true
}

function handleSelect(preset: KccPreset): void {
  edit(preset)
}

function handleNew(): void {
  edit(null)
}

async function handleSave(): Promise<void> {
  if (!canSave.value) return
  saving.value = true
  try {
    const saved = await save(selectedId.value, { name: name.value.trim(), options: options.value })
    selectedId.value = saved.id
    toast.success(`Saved "${saved.name}"`)
  } catch (reason) {
    toast.error(kccErrorText(reason))
  } finally {
    saving.value = false
  }
}

async function handleDelete(): Promise<void> {
  if (selectedId.value === null) return
  saving.value = true
  try {
    await remove(selectedId.value)
    editing.value = false
    selectedId.value = null
  } catch (reason) {
    toast.error(kccErrorText(reason))
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="settings-title">KCC comic conversion</h2>
      <p class="settings-subtitle">
        Presets for "Convert with KCC" on a comic's page. The result is always one CBZ with BookOrbit's metadata inside, linked for KOReader.
      </p>
    </div>

    <div v-if="loading" class="settings-loading-state">Loading...</div>
    <div v-else-if="error" class="settings-error-state">{{ error }}</div>
    <template v-else-if="status">
      <div class="settings-card flex items-center justify-between gap-3 bg-card px-4 py-3">
        <div class="min-w-0">
          <p class="settings-label">KCC container</p>
          <p v-if="!status.configured" class="settings-hint">
            Not set up. Add the kcc service from docker/fork-kcc to your compose file and set FORK_KCC_URL on BookOrbit.
          </p>
          <p v-else-if="!status.reachable" class="settings-hint text-destructive">Can't reach KCC: {{ status.error }}</p>
          <p v-else class="settings-hint">Connected, KCC {{ status.version }}</p>
        </div>
        <Button variant="outline" size="sm" @click="load">
          <RefreshCw :size="14" aria-hidden="true" />
          Check
        </Button>
      </div>

      <div class="space-y-2">
        <p class="settings-group-label">Presets</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="preset in presets"
            :key="preset.id"
            type="button"
            class="h-8 rounded-md border px-3 text-sm transition-colors"
            :class="
              preset.id === selectedId && editing ? 'border-primary bg-primary/10 text-foreground' : 'border-input bg-background hover:bg-muted'
            "
            @click="handleSelect(preset)"
          >
            {{ preset.name }}
          </button>
          <Button variant="outline" size="sm" :disabled="!schema" @click="handleNew">
            <Plus :size="14" aria-hidden="true" />
            New preset
          </Button>
        </div>
        <p v-if="!presets.length" class="settings-hint">
          No presets yet. A conversion can also use KCC's defaults or options set just for that book.
        </p>
      </div>

      <div v-if="editing && schema" class="space-y-4">
        <div class="flex flex-col gap-2 md:flex-row md:items-end">
          <div class="flex-1 space-y-1.5">
            <label for="kcc-preset-name" class="settings-label block">Preset name</label>
            <input id="kcc-preset-name" v-model="name" type="text" maxlength="100" class="input-field w-full" placeholder="Manga - Libra Colour" />
          </div>
          <div class="flex gap-2">
            <Button :disabled="!canSave" @click="handleSave">
              <Save :size="14" aria-hidden="true" />
              Save
            </Button>
            <Button v-if="selectedId !== null" variant="destructive-ghost" :disabled="saving" @click="handleDelete">
              <Trash2 :size="14" aria-hidden="true" />
              Delete
            </Button>
          </div>
        </div>
        <KccOptionsForm v-model="options" :schema="schema" :disabled="saving" />
      </div>
    </template>
  </div>
</template>
