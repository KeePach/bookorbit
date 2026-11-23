import { describe, expect, it } from 'vitest';

import { calibreEpub3Opf, calibreLibraryOpf } from './calibre-columns-test-fixtures';
import { parseCalibreColumns } from './calibre-opf-columns';

describe('parseCalibreColumns', () => {
  it('reads every column of a Calibre library metadata.opf, keyed by lowercased lookup name', () => {
    const columns = parseCalibreColumns(
      calibreLibraryOpf('Konosuba', [
        { lookup: '#collection', value: 'Fanfic.Ero' },
        { lookup: '#Category', multiple: true, value: ['Ero', 'Konosuba'] },
        { lookup: '#words', datatype: 'int', value: 297977 },
      ]),
    );

    expect([...columns.keys()].sort()).toEqual(['#category', '#collection', '#words']);
    expect(columns.get('#collection')).toEqual({ lookup: '#collection', datatype: 'text', multipleSeparator: null, value: 'Fanfic.Ero' });
    expect(columns.get('#category')).toMatchObject({ multipleSeparator: ', ', value: ['Ero', 'Konosuba'] });
    expect(columns.get('#words')).toMatchObject({ datatype: 'int', value: 297977 });
  });

  it('decodes markup and quotes inside the escaped JSON', () => {
    const columns = parseCalibreColumns(
      calibreLibraryOpf('Notes', [{ lookup: '#notes', datatype: 'comments', value: '<p>Tom &amp; "Jerry" <b>& co</b></p>' }]),
    );

    expect(columns.get('#notes')?.value).toBe('<p>Tom &amp; "Jerry" <b>& co</b></p>');
  });

  it('reads the EPUB 3 form, where one property holds every column', () => {
    const columns = parseCalibreColumns(
      calibreEpub3Opf('Embedded', [
        { lookup: '#collection', value: 'Web novel' },
        { lookup: '#read', datatype: 'bool', value: true },
      ]),
    );

    expect(columns.get('#collection')?.value).toBe('Web novel');
    expect(columns.get('#read')?.value).toBe(true);
  });

  it('keeps a column whose value is empty, so the field can be cleared', () => {
    const columns = parseCalibreColumns(calibreLibraryOpf('Empty', [{ lookup: '#collection', value: null }]));

    expect(columns.get('#collection')).toMatchObject({ value: null });
  });

  it('skips broken JSON and returns nothing for something that is not XML', () => {
    const xml = calibreLibraryOpf('Broken', [{ lookup: '#collection', value: 'Fanfic' }]).replace(
      '</metadata>',
      '<meta name="calibre:user_metadata:#bad" content="{not json"/></metadata>',
    );

    expect([...parseCalibreColumns(xml).keys()]).toEqual(['#collection']);
    expect(parseCalibreColumns('not xml at all').size).toBe(0);
    expect(parseCalibreColumns('').size).toBe(0);
  });

  it('ignores an OPF without Calibre columns', () => {
    const xml = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Plain</dc:title></metadata></package>`;

    expect(parseCalibreColumns(xml).size).toBe(0);
  });
});
