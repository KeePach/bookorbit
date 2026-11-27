import { ref } from 'vue'
import type { BookSelectionPayload } from '@bookorbit/types'

export interface KccConvertTarget {
  /** What to convert, in the shape the other bulk actions send: picked ids, or "all matching" a query. */
  selection: BookSelectionPayload
  count: number
  /** The book's title, or a label such as "12 books" for a batch. */
  title: string
}

const target = ref<KccConvertTarget | null>(null)

/** One Convert dialog for the app: menu items and the selection bars open it, a single host renders it. */
export function useKccConvertDialog() {
  function open(next: KccConvertTarget): void {
    if (next.count === 0) return
    target.value = next
  }

  /** Opens the dialog for a selection bar's current selection. */
  function openForSelection(selection: BookSelectionPayload, count: number): void {
    open({ selection, count, title: count === 1 ? '1 book' : `${count.toLocaleString()} books` })
  }

  function close(): void {
    target.value = null
  }

  return { target, open, openForSelection, close }
}
