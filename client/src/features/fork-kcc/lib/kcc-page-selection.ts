/** Pages still in the result, 0-based in the comic reader's order. */
export function keptPages(pageCount: number, removed: readonly number[]): number[] {
  const gone = new Set(removed)
  return Array.from({ length: pageCount }, (_, index) => index).filter((index) => !gone.has(index))
}

/**
 * Click selects or unselects one page; shift-click selects every shown page between the last
 * clicked one and this one, the way file managers do.
 */
export function clickPage(
  selected: ReadonlySet<number>,
  shown: readonly number[],
  page: number,
  anchor: number | null,
  shift: boolean,
): { selected: Set<number>; anchor: number } {
  const next = new Set(selected)
  if (shift && anchor !== null && shown.includes(anchor)) {
    const from = shown.indexOf(anchor)
    const to = shown.indexOf(page)
    const [start, end] = from <= to ? [from, to] : [to, from]
    for (const index of shown.slice(start, end + 1)) next.add(index)
    return { selected: next, anchor }
  }
  if (next.has(page)) next.delete(page)
  else next.add(page)
  return { selected: next, anchor: page }
}

/** "3, 47-49, 120" for the removed-pages bar, as 1-based page numbers. */
export function describePages(pages: readonly number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  const parts: string[] = []
  let start: number | null = null
  let previous: number | null = null
  for (const page of [...sorted, Number.NaN]) {
    if (start !== null && previous !== null && page === previous + 1) {
      previous = page
      continue
    }
    if (start !== null && previous !== null) parts.push(start === previous ? `${start + 1}` : `${start + 1}-${previous + 1}`)
    start = page
    previous = page
  }
  return parts.join(', ')
}
