import { describe, expect, it } from 'vitest';

import { parseColumn } from './calibre-columns.config';
import type { CalibreColumn } from './calibre-opf-columns';
import { decideSubtitle, SUBTITLE_MAX_LENGTH } from './calibre-subtitle';

function column(value: unknown, datatype = 'text'): CalibreColumn {
  return { lookup: '#subtitle', datatype, multipleSeparator: null, value };
}

describe('decideSubtitle', () => {
  it('writes a Calibre subtitle over another one', () => {
    expect(decideSubtitle({ column: column('  Book  One '), current: 'Other', previouslyWritten: null, locked: false })).toEqual({
      action: 'set',
      value: 'Book One',
      written: 'Book One',
    });
  });

  it('does not rewrite a subtitle that already matches, but owns it', () => {
    expect(decideSubtitle({ column: column('Same'), current: 'Same', previouslyWritten: null, locked: false })).toEqual({
      action: 'keep',
      value: null,
      written: 'Same',
    });
  });

  it('clears only a subtitle it wrote', () => {
    expect(decideSubtitle({ column: column(null), current: 'Calibre', previouslyWritten: 'Calibre', locked: false })).toEqual({
      action: 'set',
      value: null,
      written: null,
    });
    expect(decideSubtitle({ column: column(''), current: 'Provider', previouslyWritten: 'Calibre', locked: false })).toEqual({
      action: 'keep',
      value: null,
      written: null,
    });
    expect(decideSubtitle({ column: column(null), current: null, previouslyWritten: null, locked: false }).action).toBe('keep');
  });

  it('leaves the book alone when the OPF has no subtitle column', () => {
    expect(decideSubtitle({ column: undefined, current: 'Calibre', previouslyWritten: 'Calibre', locked: false })).toEqual({
      action: 'keep',
      value: null,
      written: 'Calibre',
    });
    expect(decideSubtitle({ column: undefined, current: 'Edited', previouslyWritten: 'Calibre', locked: false }).written).toBeNull();
  });

  it('never touches a locked field', () => {
    expect(decideSubtitle({ column: column('Calibre'), current: 'Mine', previouslyWritten: null, locked: true })).toEqual({
      action: 'keep',
      value: null,
      written: null,
    });
  });

  it('turns comments and multi-value columns into one line and fits the column size', () => {
    expect(
      decideSubtitle({ column: column('<p>Part <b>one</b></p><p>two</p>', 'comments'), current: null, previouslyWritten: null, locked: false }).value,
    ).toBe('Part one two');
    const long = decideSubtitle({ column: column('x'.repeat(SUBTITLE_MAX_LENGTH + 50)), current: null, previouslyWritten: null, locked: false });
    expect(long.value).toHaveLength(SUBTITLE_MAX_LENGTH);
  });
});

describe('parseColumn', () => {
  it('reads a lookup name, with or without #, and - to switch off', () => {
    expect(parseColumn(undefined, '#subtitle')).toBe('#subtitle');
    expect(parseColumn('  ', '#subtitle')).toBe('#subtitle');
    expect(parseColumn('Tagline', '#subtitle')).toBe('#tagline');
    expect(parseColumn('#sub_title', '#subtitle')).toBe('#sub_title');
    expect(parseColumn('-', '#subtitle')).toBeNull();
    expect(parseColumn('not valid!', '#subtitle')).toBe('#subtitle');
  });
});
