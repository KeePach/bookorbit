import { describe, expect, it } from 'vitest';

import { keepCopyName, looksConvertedByKcc } from './kcc-detect';

describe('looksConvertedByKcc', () => {
  it('recognises KCC page names, processed or not', () => {
    // Names from a real KCC 13.0.4 CBZ: a double spread split into -kcc-b and -kcc-c.
    expect(looksConvertedByKcc(['kcc-0001-kcc-x.jpg', 'kcc-0002-kcc-x.jpg', 'kcc-0004-kcc-b.jpg', 'kcc-0004-kcc-c.jpg', 'ComicInfo.xml'])).toBe(true);
    expect(looksConvertedByKcc(['kcc-0001.png', 'kcc-0002.png'])).toBe(true);
    expect(looksConvertedByKcc(['Chapter 1/kcc-0001-kcc-x-above.jpg', 'Chapter 1/kcc-0001-kcc-x-below.jpg'])).toBe(true);
  });

  it('does not flag ordinary scans', () => {
    expect(looksConvertedByKcc(['Saga 01/001.jpg', 'Saga 01/002.jpg', 'ComicInfo.xml'])).toBe(false);
    expect(looksConvertedByKcc(['kcc-cover.jpg', '001.jpg', '002.jpg'])).toBe(false);
    expect(looksConvertedByKcc([])).toBe(false);
  });
});

describe('keepCopyName', () => {
  it('adds _kcc and always ends in .cbz', () => {
    expect(keepCopyName('Saga #01.cbz')).toBe('Saga #01_kcc.cbz');
    expect(keepCopyName('Akira v01.cbr')).toBe('Akira v01_kcc.cbz');
    expect(keepCopyName('Scan.pdf')).toBe('Scan_kcc.cbz');
  });
});
