import type { CustomMetadataFieldType, CustomMetadataPrimitiveValue } from '@bookorbit/types';

import type { CalibreColumn } from './calibre-opf-columns';

export type ColumnValueResult = { ok: true; value: CustomMetadataPrimitiveValue } | { ok: false; reason: string };

/**
 * Turns a Calibre column value into a value for a BookOrbit custom field of `fieldType`.
 *
 * An empty Calibre value is `null`, which clears the BookOrbit value. A value the field type
 * cannot hold (a word in a Number field, say) is refused with a reason, and the field is left as it is.
 */
export function convertColumnValue(column: CalibreColumn, fieldType: CustomMetadataFieldType): ColumnValueResult {
  const raw = column.value;
  if (isEmpty(raw)) return { ok: true, value: null };

  switch (fieldType) {
    case 'text':
      return textValue(column);
    case 'url': {
      const text = textValue(column);
      if (!text.ok || text.value === null) return text;
      return isHttpUrl(text.value as string) ? text : { ok: false, reason: 'not_a_url' };
    }
    case 'number':
      return numberValue(column);
    case 'date':
      return dateValue(raw);
    case 'boolean':
      return booleanValue(raw);
  }
}

function textValue(column: CalibreColumn): ColumnValueResult {
  const raw = column.value;
  if (Array.isArray(raw)) {
    const items = raw.map((item) => scalarText(item, column.datatype)).filter((item): item is string => item !== null);
    return { ok: true, value: items.length > 0 ? items.join(column.multipleSeparator ?? ', ') : null };
  }
  return { ok: true, value: scalarText(raw, column.datatype) };
}

function scalarText(raw: unknown, datatype: string): string | null {
  if (isEmpty(raw)) return null;
  if (typeof raw === 'string') {
    const text = datatype === 'comments' ? htmlToText(raw) : raw.trim();
    return text || null;
  }
  if (typeof raw === 'number') return String(datatype === 'rating' ? raw / 2 : raw);
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  const date = encodedDate(raw);
  if (date !== undefined) return date;
  return null;
}

function numberValue(column: CalibreColumn): ColumnValueResult {
  const raw = column.value;
  let value: number;
  if (typeof raw === 'number') value = raw;
  else if (typeof raw === 'string' && raw.trim() !== '') value = Number(raw.trim());
  else return { ok: false, reason: 'not_a_number' };
  if (!Number.isFinite(value)) return { ok: false, reason: 'not_a_number' };
  // Calibre keeps ratings doubled (0-10) so half stars fit an integer.
  return { ok: true, value: column.datatype === 'rating' ? value / 2 : value };
}

function dateValue(raw: unknown): ColumnValueResult {
  const encoded = encodedDate(raw);
  const date = encoded !== undefined ? encoded : typeof raw === 'string' ? isoDate(raw) : undefined;
  return date === undefined ? { ok: false, reason: 'not_a_date' } : { ok: true, value: date };
}

function booleanValue(raw: unknown): ColumnValueResult {
  if (typeof raw === 'boolean') return { ok: true, value: raw };
  if (typeof raw === 'string') {
    const word = raw.trim().toLowerCase();
    if (word === 'true' || word === 'yes') return { ok: true, value: true };
    if (word === 'false' || word === 'no') return { ok: true, value: false };
  }
  return { ok: false, reason: 'not_a_boolean' };
}

/** Calibre writes datetimes as `{"__class__": "datetime.datetime", "__value__": "<ISO, UTC>"}`. */
function encodedDate(raw: unknown): string | null | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const node = raw as Record<string, unknown>;
  if (node['__class__'] !== 'datetime.datetime' || typeof node['__value__'] !== 'string') return undefined;
  return isoDate(node['__value__']);
}

/**
 * The calendar day of a Calibre datetime in this server's time zone (the container's `TZ`),
 * which is how Calibre shows it on a machine in that zone. Calibre's "no date" (year 101) is null.
 */
function isoDate(iso: string): string | null | undefined {
  const parsed = new Date(iso.trim());
  if (Number.isNaN(parsed.getTime())) return undefined;
  if (parsed.getUTCFullYear() <= 101) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isEmpty(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === 'string') return raw.trim() === '';
  if (Array.isArray(raw)) return raw.every(isEmpty);
  return false;
}
