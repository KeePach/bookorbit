import { SERIES_RELEASE_COVER_MAX_LENGTH, SERIES_RELEASE_URL_MAX_LENGTH } from '@bookorbit/types';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATA_IMAGE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

/** A real calendar day written `YYYY-MM-DD`; `2026-02-30` is not one. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2200) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The trimmed link when it is an http or https URL of a sane length, otherwise null. */
export function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > SERIES_RELEASE_URL_MAX_LENGTH) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * A cover is an https link or a small inline jpeg, png or webp. A plain http link is refused because
 * the page's content policy would block it, and anything else could carry script.
 */
export function normalizeCover(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:')) {
    return trimmed.length <= SERIES_RELEASE_COVER_MAX_LENGTH && DATA_IMAGE.test(trimmed) ? trimmed : null;
  }
  const url = normalizeHttpUrl(trimmed);
  return url?.startsWith('https://') ? url : null;
}

/** "Vol. 6" becomes "Vol. 7". Null when the label holds no number to count up from. */
export function bumpVolume(volume: string): string | null {
  if (!/\d/.test(volume)) return null;
  return volume.replace(/(\d+)(?!.*\d)/, (digits) => String(Number(digits) + 1));
}

/** Today's date in the server's time zone as `YYYY-MM-DD`. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
