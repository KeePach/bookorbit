import { bumpVolume, isIsoDate, normalizeCover, normalizeHttpUrl, todayIso } from './series-release.validation';

describe('isIsoDate', () => {
  it('accepts real calendar days', () => {
    expect(isIsoDate('2026-12-19')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
  });

  it('rejects impossible days and other shapes', () => {
    for (const value of [
      '2026-02-30',
      '2027-02-29',
      '2026-13-01',
      '2026-00-10',
      '26-12-19',
      '2026/12/19',
      '2026-12-19T00:00:00Z',
      '1800-01-01',
      '',
      ' 2026-12-19',
    ]) {
      expect(isIsoDate(value)).toBe(false);
    }
    expect(isIsoDate(20261219)).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe('normalizeHttpUrl', () => {
  it('keeps http and https links, trimmed', () => {
    expect(normalizeHttpUrl('  https://store.example/volume-6  ')).toBe('https://store.example/volume-6');
    expect(normalizeHttpUrl('http://store.example/')).toBe('http://store.example/');
  });

  it('refuses other schemes, plain text and overlong links', () => {
    expect(normalizeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeHttpUrl('ftp://store.example/')).toBeNull();
    expect(normalizeHttpUrl('not a link')).toBeNull();
    expect(normalizeHttpUrl('')).toBeNull();
    expect(normalizeHttpUrl(`https://store.example/${'a'.repeat(2000)}`)).toBeNull();
    expect(normalizeHttpUrl(undefined)).toBeNull();
  });
});

describe('normalizeCover', () => {
  it('accepts an https link and a small inline image', () => {
    expect(normalizeCover('https://img.example/cover.jpg')).toBe('https://img.example/cover.jpg');
    expect(normalizeCover('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
    expect(normalizeCover('data:image/webp;base64,UklGRg==')).not.toBeNull();
  });

  it('refuses plain http, scripts and other data types', () => {
    expect(normalizeCover('http://img.example/cover.jpg')).toBeNull();
    expect(normalizeCover('javascript:alert(1)')).toBeNull();
    expect(normalizeCover('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
    expect(normalizeCover('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    expect(normalizeCover('data:image/png;base64,not base64!')).toBeNull();
    expect(normalizeCover('   ')).toBeNull();
  });

  it('refuses an inline image over the size limit', () => {
    expect(normalizeCover(`data:image/png;base64,${'A'.repeat(450_000)}`)).toBeNull();
    expect(normalizeCover(`data:image/png;base64,${'A'.repeat(1000)}`)).not.toBeNull();
  });
});

describe('bumpVolume', () => {
  it('counts the last number up and keeps the words around it', () => {
    expect(bumpVolume('6')).toBe('7');
    expect(bumpVolume('Vol. 6')).toBe('Vol. 7');
    expect(bumpVolume('Omnibus 2')).toBe('Omnibus 3');
    expect(bumpVolume('9')).toBe('10');
    expect(bumpVolume('Book 3 of 12')).toBe('Book 3 of 13');
  });

  it('has no next volume when the label holds no number', () => {
    expect(bumpVolume('Special')).toBeNull();
    expect(bumpVolume('')).toBeNull();
  });
});

describe('todayIso', () => {
  it('writes the local day with zero padding', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(todayIso(new Date(2026, 10, 14, 0, 1))).toBe('2026-11-14');
  });
});
