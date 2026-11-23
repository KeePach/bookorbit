import { describe, expect, it } from 'vitest';

import { convertColumnValue } from './calibre-column-value';
import type { CalibreColumn } from './calibre-opf-columns';

function column(value: unknown, datatype = 'text', multipleSeparator: string | null = null): CalibreColumn {
  return { lookup: '#col', datatype, multipleSeparator, value };
}

const date = (iso: string) => ({ __class__: 'datetime.datetime', __value__: iso });

describe('convertColumnValue', () => {
  it('keeps hierarchical text as it is, dots included', () => {
    expect(convertColumnValue(column('Fanfic.Ero'), 'text')).toEqual({ ok: true, value: 'Fanfic.Ero' });
    expect(convertColumnValue(column('  Web novel  '), 'text')).toEqual({ ok: true, value: 'Web novel' });
  });

  it('joins several values with the separator Calibre shows them with', () => {
    expect(convertColumnValue(column(['Ero', 'Konosuba'], 'text', ', '), 'text')).toEqual({ ok: true, value: 'Ero, Konosuba' });
    expect(convertColumnValue(column(['A', '', 'B'], 'text', ' & '), 'text')).toEqual({ ok: true, value: 'A & B' });
  });

  it('clears the field when Calibre has no value', () => {
    for (const empty of [null, undefined, '', '   ', []]) {
      expect(convertColumnValue(column(empty), 'text')).toEqual({ ok: true, value: null });
      expect(convertColumnValue(column(empty, 'int'), 'number')).toEqual({ ok: true, value: null });
    }
  });

  it('turns long text into plain text', () => {
    expect(convertColumnValue(column('<div><p>One &amp; two</p><p>Three<br/>four</p></div>', 'comments'), 'text')).toEqual({
      ok: true,
      value: 'One & two\nThree\nfour',
    });
  });

  it('reads numbers, and halves ratings to stars', () => {
    expect(convertColumnValue(column(297977, 'int'), 'number')).toEqual({ ok: true, value: 297977 });
    expect(convertColumnValue(column(2.5, 'float'), 'number')).toEqual({ ok: true, value: 2.5 });
    expect(convertColumnValue(column('574'), 'number')).toEqual({ ok: true, value: 574 });
    expect(convertColumnValue(column(7, 'rating'), 'number')).toEqual({ ok: true, value: 3.5 });
    expect(convertColumnValue(column(8, 'rating'), 'text')).toEqual({ ok: true, value: '4' });
  });

  it('refuses a value the field type cannot hold', () => {
    expect(convertColumnValue(column('Fanfic'), 'number')).toEqual({ ok: false, reason: 'not_a_number' });
    expect(convertColumnValue(column('soon'), 'date')).toEqual({ ok: false, reason: 'not_a_date' });
    expect(convertColumnValue(column('maybe'), 'boolean')).toEqual({ ok: false, reason: 'not_a_boolean' });
    expect(convertColumnValue(column('Fanfic'), 'url')).toEqual({ ok: false, reason: 'not_a_url' });
  });

  it('reads Calibre datetimes as a calendar day, and its "no date" as empty', () => {
    expect(convertColumnValue(column(date('2026-11-15T18:02:00+00:00'), 'datetime'), 'date')).toEqual({ ok: true, value: '2026-11-15' });
    expect(convertColumnValue(column(date('0101-01-01T00:00:00+00:00'), 'datetime'), 'date')).toEqual({ ok: true, value: null });
    expect(convertColumnValue(column(date('2026-11-15T18:02:00+00:00'), 'datetime'), 'text')).toEqual({ ok: true, value: '2026-11-15' });
  });

  it('reads yes/no columns', () => {
    expect(convertColumnValue(column(true, 'bool'), 'boolean')).toEqual({ ok: true, value: true });
    expect(convertColumnValue(column(false, 'bool'), 'boolean')).toEqual({ ok: true, value: false });
    expect(convertColumnValue(column(false, 'bool'), 'text')).toEqual({ ok: true, value: 'No' });
  });

  it('accepts web links for URL fields', () => {
    expect(convertColumnValue(column('https://forum.questionablequesting.com/threads/1'), 'url')).toEqual({
      ok: true,
      value: 'https://forum.questionablequesting.com/threads/1',
    });
  });
});
