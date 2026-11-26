import { ref } from 'vue'

export interface KccConvertTarget {
  bookId: number
  title: string
}

const target = ref<KccConvertTarget | null>(null)

/** One Convert dialog for the app: menu items open it, a single host renders it. */
export function useKccConvertDialog() {
  function open(next: KccConvertTarget): void {
    target.value = next
  }

  function close(): void {
    target.value = null
  }

  return { target, open, close }
}
