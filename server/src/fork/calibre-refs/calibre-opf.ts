const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER = /<dc:identifier\b([^>]*)>([^<]*)<\/dc:identifier>/gi;
const SCHEME = /\bopf:scheme\s*=\s*["']([^"']*)["']/i;

export interface CalibreOpfRefs {
  uuid: string;
  calibreBookId: number | null;
}

/**
 * Calibre's library metadata.opf carries the book uuid as scheme="uuid" and the numeric book id as
 * scheme="calibre". Copies Calibre writes into a book sent to a device use scheme="calibre" for the
 * uuid instead, so a calibre-scheme value that is itself a uuid counts as the uuid.
 */
export function parseCalibreOpfRefs(xml: string): CalibreOpfRefs | null {
  let uuid: string | null = null;
  let calibreBookId: number | null = null;
  for (const match of xml.matchAll(IDENTIFIER)) {
    const scheme = SCHEME.exec(match[1] ?? '')?.[1]
      ?.trim()
      .toLowerCase();
    const value = (match[2] ?? '').trim();
    if (!scheme || !value) continue;
    if (scheme === 'uuid' && UUID.test(value)) uuid ??= value.toLowerCase();
    if (scheme === 'calibre') {
      if (UUID.test(value)) uuid ??= value.toLowerCase();
      else if (/^\d{1,9}$/.test(value)) calibreBookId ??= Number(value);
    }
  }
  return uuid ? { uuid, calibreBookId } : null;
}

export function isCalibreUuid(value: string): boolean {
  return UUID.test(value);
}
