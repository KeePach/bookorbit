<script setup lang="ts">
import { computed, useId } from 'vue'
import type { KccOptionDef, KccOptionSchema, KccOptionValues } from '@bookorbit/types'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import { optionLabel, optionValue, withOptionValue } from '../lib/kcc-options'

const props = defineProps<{ schema: KccOptionSchema; modelValue: KccOptionValues; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: KccOptionValues] }>()

const formId = `kcc-options-${useId()}`
const changedCount = computed(() => Object.keys(props.modelValue).length)

function update(option: KccOptionDef, value: boolean | number | string | null): void {
  emit('update:modelValue', withOptionValue(props.modelValue, option, value))
}

function handleToggle(option: KccOptionDef, value: boolean): void {
  update(option, value)
}

function handleInput(option: KccOptionDef, event: Event): void {
  const raw = (event.target as HTMLInputElement | HTMLSelectElement).value
  if (option.kind === 'int' || option.kind === 'float') {
    update(option, raw === '' ? null : Number(raw))
  } else {
    update(option, raw === '' ? null : raw)
  }
}

function handleReset(): void {
  emit('update:modelValue', {})
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between gap-3">
      <p class="settings-hint">
        KCC {{ schema.version ?? '' }} options. Anything you leave alone uses KCC's default.
        <span v-if="changedCount">{{ changedCount }} changed.</span>
      </p>
      <button
        v-if="changedCount"
        type="button"
        class="text-xs text-muted-foreground underline hover:text-foreground"
        :disabled="disabled"
        @click="handleReset"
      >
        Reset all
      </button>
    </div>

    <section v-for="group in schema.groups" :key="group.title" class="space-y-1">
      <p class="settings-group-label">{{ group.title }}</p>
      <div class="settings-card divide-y divide-border">
        <div
          v-for="option in group.options"
          :key="option.dest"
          class="flex flex-col gap-2 bg-card px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-6"
          :class="{ 'bg-primary/5': option.dest in modelValue }"
        >
          <label :for="`${formId}-${option.dest}`" class="min-w-0 flex-1">
            <span class="block text-sm text-foreground">{{ option.help || option.dest }}</span>
            <span class="block font-mono text-xs text-muted-foreground">{{ optionLabel(option) }}</span>
          </label>

          <div class="shrink-0 md:w-56">
            <ToggleSwitch
              v-if="option.kind === 'bool'"
              :id="`${formId}-${option.dest}`"
              :model-value="optionValue(modelValue, option) === true"
              :disabled="disabled"
              @update:model-value="handleToggle(option, $event)"
            />
            <select
              v-else-if="option.dest === 'profile'"
              :id="`${formId}-${option.dest}`"
              class="input-field w-full"
              :value="optionValue(modelValue, option) ?? ''"
              :disabled="disabled"
              @change="handleInput(option, $event)"
            >
              <option v-for="profile in schema.profiles" :key="profile.code" :value="profile.code">{{ profile.code }} - {{ profile.label }}</option>
            </select>
            <input
              v-else
              :id="`${formId}-${option.dest}`"
              class="input-field w-full"
              :type="option.kind === 'str' ? 'text' : 'number'"
              :step="option.kind === 'float' ? 'any' : '1'"
              :value="optionValue(modelValue, option) ?? ''"
              :placeholder="option.default === null ? 'KCC default' : String(option.default)"
              :disabled="disabled"
              @change="handleInput(option, $event)"
            />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
