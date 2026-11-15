import { LicenseMatcher, normTitle, titleCandidates } from './series-license-matcher';

function licensedRecord(id: number, title: string, extra: Record<string, unknown> = {}) {
  return { id, title, is_licensed: true, publishers: [{ name: 'Seven Seas', type: 'English' }], ...extra };
}

describe('normTitle', () => {
  it('drops accents, case and punctuation', () => {
    expect(normTitle('Yokohama Kaidashi Kikō!')).toBe('yokohama kaidashi kiko');
    expect(normTitle("  A-Bout!: Asagiri's ")).toBe('a bout asagiri s');
  });
});

describe('titleCandidates', () => {
  it('offers the name with and without its bracketed part', () => {
    expect(titleCandidates('Aki Sora [Digital]')).toEqual(['Aki Sora [Digital]', 'Aki Sora', 'Digital']);
  });
});

describe('LicenseMatcher', () => {
  it('matches by stored MangaBaka id, publishers included', () => {
    const matcher = new LicenseMatcher([{ seriesId: 1, name: 'Whatever', mangabakaId: '77' }]);
    matcher.feed(licensedRecord(77, 'Some Manga'));
    expect(matcher.finish()).toEqual([{ seriesId: 1, licensed: true, mangabakaId: '77', matchedBy: 'id', publishers: 'Seven Seas' }]);
  });

  it('reports an id that is not licensed as not licensed', () => {
    const matcher = new LicenseMatcher([{ seriesId: 1, name: 'Whatever', mangabakaId: '77' }]);
    matcher.feed({ id: 77, title: 'Some Manga', is_licensed: false });
    expect(matcher.finish()).toEqual([{ seriesId: 1, licensed: false, mangabakaId: '77', matchedBy: 'id', publishers: null }]);
  });

  it('follows merged ids to the surviving record', () => {
    const matcher = new LicenseMatcher([{ seriesId: 1, name: 'Whatever', mangabakaId: '10' }]);
    matcher.feed({ id: 10, merged_with: 20 });
    matcher.feed({ id: 20, merged_with: 30 });
    matcher.feed(licensedRecord(30, 'Surviving Entry'));
    expect(matcher.finish()[0]).toMatchObject({ licensed: true, mangabakaId: '30', matchedBy: 'id' });
  });

  it('matches by title only when exactly one licensed series carries it', () => {
    const matcher = new LicenseMatcher([
      { seriesId: 1, name: 'Aki Sora [Digital]', mangabakaId: null },
      { seriesId: 2, name: 'Common Name', mangabakaId: null },
      { seriesId: 3, name: 'Nowhere Found', mangabakaId: null },
    ]);
    matcher.feed(licensedRecord(5, 'Aki Sora'));
    matcher.feed(licensedRecord(6, 'Common Name'));
    matcher.feed(licensedRecord(7, 'Common Name'));
    const [a, b, c] = matcher.finish();
    expect(a).toMatchObject({ licensed: true, mangabakaId: '5', matchedBy: 'title' });
    expect(b).toMatchObject({ licensed: false, mangabakaId: null, matchedBy: null });
    expect(c).toMatchObject({ licensed: false, mangabakaId: null, matchedBy: null });
  });

  it('also matches English alternative titles, but never unlicensed ones', () => {
    const matcher = new LicenseMatcher([
      { seriesId: 1, name: 'The English Name', mangabakaId: null },
      { seriesId: 2, name: 'Unlicensed Thing', mangabakaId: null },
    ]);
    matcher.feed(licensedRecord(5, 'Native Title', { titles: [{ title: 'The English Name', language: 'en' }] }));
    matcher.feed({ id: 6, title: 'Unlicensed Thing', is_licensed: false });
    const [a, b] = matcher.finish();
    expect(a).toMatchObject({ licensed: true, mangabakaId: '5', matchedBy: 'title' });
    expect(b).toMatchObject({ licensed: false, matchedBy: null });
  });

  it('skips deleted and malformed lines without falling over', () => {
    const matcher = new LicenseMatcher([{ seriesId: 1, name: 'Aki Sora', mangabakaId: null }]);
    matcher.feed({ id: 9, title: 'Aki Sora', is_licensed: true, state: 'deleted' });
    matcher.feed(null);
    matcher.feed('garbage');
    matcher.feed({ title: 'no id' });
    expect(matcher.linesSeen).toBe(4);
    expect(matcher.finish()[0]).toMatchObject({ licensed: false, matchedBy: null });
  });
});
