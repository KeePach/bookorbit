import { ref } from 'vue'
import type { KccOptionSchema, KccPreset, KccPresetInput, KccStatus } from '@bookorbit/types'
import { kccApi, kccErrorText } from '../lib/kcc-api'

/** KCC's status, its option list and the user's presets. */
export function useKccPresets() {
  const status = ref<KccStatus | null>(null)
  const schema = ref<KccOptionSchema | null>(null)
  const presets = ref<KccPreset[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      status.value = await kccApi.status()
      presets.value = await kccApi.presets()
      schema.value = status.value.reachable ? await kccApi.options() : null
    } catch (reason) {
      error.value = kccErrorText(reason)
    } finally {
      loading.value = false
    }
  }

  async function save(id: number | null, input: KccPresetInput): Promise<KccPreset> {
    const saved = id === null ? await kccApi.createPreset(input) : await kccApi.updatePreset(id, input)
    presets.value = [...presets.value.filter((preset) => preset.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name))
    return saved
  }

  async function remove(id: number): Promise<void> {
    await kccApi.deletePreset(id)
    presets.value = presets.value.filter((preset) => preset.id !== id)
  }

  return { status, schema, presets, loading, error, load, save, remove }
}
