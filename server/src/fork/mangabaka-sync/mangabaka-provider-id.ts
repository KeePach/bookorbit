/**
 * The MangaBaka provider id BookOrbit stores on a book says which series it belongs to and which
 * volume and chapter it is (see the provider's `id_suffix`):
 *   `1692`        the series only
 *   `1692v11`     chapter 11 (the older form, `v` alone means chapter)
 *   `1692vol3`    volume 3
 *   `1692vol2v11` volume 2, chapter 11
 *   `1692os`      a oneshot
 * Ranges keep a dash (`1692vol9-10`, `1692v0-6`) and numbers may have decimals (`1692v10.5`).
 */
export interface MangabakaProviderId {
  seriesId: string;
  /** The last volume the book covers, or null when the id names none. */
  volume: number | null;
  /** The last chapter the book covers, or null when the id names none. */
  chapter: number | null;
  oneshot: boolean;
}

const NUMBER = String.raw`\d+(?:\.\d+)?`;
const RANGE = String.raw`(${NUMBER})(?:-(${NUMBER}))?`;
const PROVIDER_ID = new RegExp(String.raw`^(\d+)(?:(os)|(?:vol${RANGE})?(?:v${RANGE})?)$`, 'i');

function rangeEnd(start: string | undefined, end: string | undefined): number | null {
  if (start === undefined) return null;
  const first = Number(start);
  const last = end === undefined ? first : Number(end);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  return Math.max(first, last);
}

export function parseMangabakaProviderId(raw: string | null | undefined): MangabakaProviderId | null {
  const value = raw?.trim() ?? '';
  const match = PROVIDER_ID.exec(value);
  if (!match) return null;
  const seriesId = match[1].replace(/^0+(?=\d)/, '');
  if (seriesId === '0') return null;
  return {
    seriesId,
    oneshot: match[2] !== undefined,
    volume: rangeEnd(match[3], match[4]),
    chapter: rangeEnd(match[5], match[6]),
  };
}
