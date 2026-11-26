import { ref } from 'vue'

export interface KccConvertTarget {
  bookIds: number[]
  /** The book's title, or a label such as "12 books" for a batch. */
  title: string
}

const target = ref<KccConvertTarget | null>(null)

/** One Convert dialog for the app: menu items and the selection bar open it, a single host renders it. */
export function useKccConvertDialog() {
  function open(next: KccConvertTarget): void {
    if (next.bookIds.length === 0) return
    target.value = next
  }

  function close(): void {
    target.value = null
  }

  return { target, open, close }
}
