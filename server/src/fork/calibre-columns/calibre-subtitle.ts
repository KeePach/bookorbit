import { convertColumnValue } from './calibre-column-value';
import type { CalibreColumn } from './calibre-opf-columns';

/** `book_metadata.subtitle` is a varchar(1000). */
export const SUBTITLE_MAX_LENGTH = 1000;

export interface SubtitleInput {
  /** The book's Calibre subtitle column, or undefined when its metadata.opf has none. */
  column: CalibreColumn | undefined;
  /** The book's subtitle in BookOrbit right now. */
  current: string | null;
  /** The subtitle this sync last wrote (or found already equal) for the book, if any. */
  previouslyWritten: string | null;
  /** The book's Subtitle field is locked in BookOrbit. */
  locked: boolean;
}

export interface SubtitleDecision {
  /** `set` writes `value` (a string, or null to clear). `keep` leaves the book alone. */
  action: 'set' | 'keep';
  value: string | null;
  /**
   * What the sync owns afterwards: the subtitle BookOrbit holds because of Calibre, or null when the
   * current subtitle came from somewhere else (the book file, a provider, a person).
   */
  written: string | null;
}

/**
 * Calibre wins for a subtitle it has: a non-empty column is written over whatever BookOrbit holds.
 * An empty column only clears a subtitle that came from Calibre (one this sync wrote), so a book
 * without a Calibre subtitle keeps one it got from its file or a metadata provider. A locked Subtitle
 * field is never touched.
 */
export function decideSubtitle(input: SubtitleInput): SubtitleDecision {
  const ownsCurrent = input.previouslyWritten !== null && input.current === input.previouslyWritten;
  if (input.locked) return { action: 'keep', value: null, written: null };

  const value = input.column ? subtitleText(input.column) : undefined;
  // No column in this OPF (or a value that is not text): leave the book as it is.
  if (value === undefined) return { action: 'keep', value: null, written: ownsCurrent ? input.current : null };

  if (value !== null) {
    if (input.current === value) return { action: 'keep', value: null, written: value };
    return { action: 'set', value, written: value };
  }
  if (ownsCurrent) return { action: 'set', value: null, written: null };
  return { action: 'keep', value: null, written: null };
}

/** The column as one line of subtitle text, null when empty, undefined when it cannot be text. */
function subtitleText(column: CalibreColumn): string | null | undefined {
  const converted = convertColumnValue(column, 'text');
  if (!converted.ok) return undefined;
  if (converted.value === null) return null;
  if (typeof converted.value !== 'string') return undefined;
  const text = converted.value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, SUBTITLE_MAX_LENGTH) : null;
}
