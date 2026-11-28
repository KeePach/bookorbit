import { describe, expect, it } from 'vitest';

import { parseMangabakaProviderId } from './mangabaka-provider-id';

describe('parseMangabakaProviderId', () => {
  it('reads the forms the provider writes', () => {
    expect(parseMangabakaProviderId('1692')).toEqual({ seriesId: '1692', volume: null, chapter: null, oneshot: false });
    expect(parseMangabakaProviderId('1692v11')).toEqual({ seriesId: '1692', volume: null, chapter: 11, oneshot: false });
    expect(parseMangabakaProviderId('1692vol3')).toEqual({ seriesId: '1692', volume: 3, chapter: null, oneshot: false });
    expect(parseMangabakaProviderId('1692vol2v11')).toEqual({ seriesId: '1692', volume: 2, chapter: 11, oneshot: false });
    expect(parseMangabakaProviderId('1692os')).toEqual({ seriesId: '1692', volume: null, chapter: null, oneshot: true });
  });

  it('takes the end of a range and keeps decimals', () => {
    expect(parseMangabakaProviderId('2320vol9-10')?.volume).toBe(10);
    expect(parseMangabakaProviderId('2320v0-6')?.chapter).toBe(6);
    expect(parseMangabakaProviderId('2320v10.5')?.chapter).toBe(10.5);
    expect(parseMangabakaProviderId('2320vol1-3v1-20')).toMatchObject({ volume: 3, chapter: 20 });
  });

  it('refuses anything else', () => {
    for (const raw of [null, undefined, '', 'abc', 'v12', '12x', '0', '12vol', '12v', '12 v3', 's-123']) {
      expect(parseMangabakaProviderId(raw)).toBeNull();
    }
  });

  it('tolerates case and spaces around the id', () => {
    expect(parseMangabakaProviderId(' 55VOL2V8 ')).toMatchObject({ seriesId: '55', volume: 2, chapter: 8 });
  });
});
