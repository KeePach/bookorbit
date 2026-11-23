import { describe, expect, it } from 'vitest';

import { linksSignature, parseLinkOverrides, resolveLinks } from './calibre-column-links';

describe('parseLinkOverrides', () => {
  it('reads field_key=#column pairs separated by commas, semicolons or lines', () => {
    const parsed = parseLinkOverrides(' kobo_shelf=#category, Fandom = #Subtitle;\nwords=words ');

    expect([...parsed.byFieldKey]).toEqual([
      ['kobo_shelf', '#category'],
      ['fandom', '#subtitle'],
      ['words', '#words'],
    ]);
    expect(parsed.invalid).toEqual([]);
  });

  it('keeps a field out of the sync with -', () => {
    expect(parseLinkOverrides('notes=-').byFieldKey.get('notes')).toBe('-');
  });

  it('reports entries it cannot read', () => {
    expect(parseLinkOverrides('collection, a=#b c, =#x').invalid).toEqual(['collection', 'a=#b c', '=#x']);
    expect(parseLinkOverrides(undefined).byFieldKey.size).toBe(0);
  });
});

describe('resolveLinks', () => {
  const fields = [
    { id: 3, key: 'kobo_shelf', type: 'text' as const },
    { id: 1, key: 'collection', type: 'text' as const },
    { id: 2, key: 'notes', type: 'text' as const },
  ];

  it('links each field to the column named like its key, unless an override says otherwise', () => {
    const links = resolveLinks(fields, parseLinkOverrides('kobo_shelf=#category, notes=-').byFieldKey);

    expect(links).toEqual([
      { fieldId: 1, fieldKey: 'collection', fieldType: 'text', column: '#collection' },
      { fieldId: 3, fieldKey: 'kobo_shelf', fieldType: 'text', column: '#category' },
    ]);
  });

  it('gives a new signature when a field is added or relinked, and the same one otherwise', () => {
    const base = linksSignature(resolveLinks(fields, new Map()));

    expect(linksSignature(resolveLinks([...fields].reverse(), new Map()))).toBe(base);
    expect(linksSignature(resolveLinks([...fields, { id: 4, key: 'words', type: 'number' }], new Map()))).not.toBe(base);
    expect(linksSignature(resolveLinks(fields, new Map([['notes', '#comments']])))).not.toBe(base);
  });
});
