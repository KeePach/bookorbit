import { createHash } from 'crypto';
import type { CustomMetadataFieldType } from '@bookorbit/types';

export interface LinkedField {
  fieldId: number;
  fieldKey: string;
  fieldType: CustomMetadataFieldType;
  /** Calibre lookup name, lowercased, with the `#`. */
  column: string;
}

export const UNLINKED = '-';

export interface ParsedLinkOverrides {
  /** BookOrbit field key -> Calibre lookup name, or `-` for a field that must not be linked. */
  byFieldKey: Map<string, string>;
  invalid: string[];
}

/**
 * Reads `FORK_CALIBRE_COLUMN_LINKS`, a list of `field_key=#column` pairs separated by commas,
 * semicolons or new lines, for fields whose key is not the Calibre lookup name.
 * `field_key=-` keeps a field out of the sync. Example: `kobo_shelf=#category, notes=-`.
 */
export function parseLinkOverrides(raw: string | undefined): ParsedLinkOverrides {
  const byFieldKey = new Map<string, string>();
  const invalid: string[] = [];
  for (const entry of (raw ?? '').split(/[,;\n]/)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const match = /^([a-z0-9][a-z0-9_]*)\s*=\s*(-|#?[a-z0-9_]+)$/i.exec(trimmed);
    if (!match) {
      invalid.push(trimmed);
      continue;
    }
    const target = match[2].toLowerCase();
    byFieldKey.set(match[1].toLowerCase(), target === UNLINKED ? UNLINKED : `#${target.replace(/^#/, '')}`);
  }
  return { byFieldKey, invalid };
}

/**
 * Every active custom field is linked: to the column its override names, or else to the Calibre
 * column whose lookup name equals the field key (`collection` <-> `#collection`). A field whose
 * column a book's OPF doesn't have is simply left alone for that book.
 */
export function resolveLinks(
  fields: Array<{ id: number; key: string; type: CustomMetadataFieldType }>,
  overrides: Map<string, string>,
): LinkedField[] {
  return fields
    .map((field) => ({ fieldId: field.id, fieldKey: field.key, fieldType: field.type, column: overrides.get(field.key) ?? `#${field.key}` }))
    .filter((link) => link.column !== UNLINKED)
    .sort((a, b) => a.fieldId - b.fieldId);
}

/**
 * Changes whenever a library gains, loses or relinks a field, or the subtitle column changes, so its
 * books are read again.
 */
export function linksSignature(links: LinkedField[], subtitleColumn: string | null = null): string {
  let text = links.map((link) => `${link.fieldId}:${link.fieldType}:${link.column}`).join('|');
  if (subtitleColumn) text += `|subtitle:${subtitleColumn}`;
  return createHash('sha1').update(text).digest('hex');
}
