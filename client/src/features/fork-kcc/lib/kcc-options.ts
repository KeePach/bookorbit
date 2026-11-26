import type { KccOptionDef, KccOptionValues } from '@bookorbit/types'

/** `-m, --manga-style` */
export function optionLabel(option: KccOptionDef): string {
  return option.flags.join(', ')
}

/** The stored value, or KCC's default when the option was left alone. */
export function optionValue(values: KccOptionValues, option: KccOptionDef): boolean | number | string | null {
  return values[option.dest] ?? option.default
}

/** Sets one option. Going back to KCC's default (or clearing a field) removes it, so presets only hold changes. */
export function withOptionValue(values: KccOptionValues, option: KccOptionDef, value: boolean | number | string | null): KccOptionValues {
  const next = { ...values }
  const isDefault =
    value === null ||
    (typeof value === 'number' && Number.isNaN(value)) ||
    value === option.default ||
    (option.kind === 'bool' && value === false && option.default !== true)
  if (isDefault) delete next[option.dest]
  else next[option.dest] = value
  return next
}
