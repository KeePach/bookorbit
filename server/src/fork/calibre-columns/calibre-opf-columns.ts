import { XMLParser } from 'fast-xml-parser';

/**
 * One Calibre custom column as Calibre serializes it into an OPF.
 *
 * Calibre's library `metadata.opf` (OPF 2) writes one element per column:
 *   <meta name="calibre:user_metadata:#collection" content="{...json...}"/>
 * An EPUB 3 package written by Calibre carries all columns in one element instead:
 *   <meta property="calibre:user_metadata">{"#collection": {...json...}}</meta>
 * Either way each column is a JSON object whose `#value#` holds the book's value.
 */
export interface CalibreColumn {
  /** Lookup name as Calibre shows it, lowercased, including the `#`. */
  lookup: string;
  datatype: string;
  /** Separator Calibre uses to show several values (`list_to_ui`), set only for multi-value columns. */
  multipleSeparator: string | null;
  value: unknown;
}

const NAME_PREFIX = 'calibre:user_metadata:';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  isArray: (name) => name === 'meta',
  textNodeName: '#text',
  allowBooleanAttributes: true,
  htmlEntities: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

/** Columns keyed by lowercased lookup name (`#collection`). Unreadable XML or JSON yields what could be read. */
export function parseCalibreColumns(xml: string): Map<string, CalibreColumn> {
  const columns = new Map<string, CalibreColumn>();
  let root: Record<string, unknown>;
  try {
    root = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return columns;
  }
  const pkg = asRecord(root['package']);
  const metadata = asRecord(pkg?.['metadata']);
  const metas = metadata?.['meta'];
  if (!Array.isArray(metas)) return columns;

  for (const meta of metas) {
    const node = asRecord(meta);
    if (!node) continue;
    const name = node['@_name'];
    if (typeof name === 'string' && name.startsWith(NAME_PREFIX)) {
      const column = toColumn(name.slice(NAME_PREFIX.length), parseJson(node['@_content']));
      if (column) columns.set(column.lookup, column);
      continue;
    }
    if (node['@_property'] === 'calibre:user_metadata') {
      const all = asRecord(parseJson(node['#text']));
      if (!all) continue;
      for (const [lookup, raw] of Object.entries(all)) {
        const column = toColumn(lookup, raw);
        // The per-column OPF 2 form is the one Calibre keeps current in a library folder, so it wins.
        if (column && !columns.has(column.lookup)) columns.set(column.lookup, column);
      }
    }
  }
  return columns;
}

function toColumn(rawLookup: string, raw: unknown): CalibreColumn | null {
  const lookup = rawLookup.trim().toLowerCase();
  if (!/^#[a-z0-9_]+$/.test(lookup)) return null;
  const fm = asRecord(raw);
  if (!fm || !('#value#' in fm)) return null;
  const datatype = typeof fm['datatype'] === 'string' ? fm['datatype'] : 'text';
  return { lookup, datatype, multipleSeparator: multipleSeparator(fm), value: fm['#value#'] };
}

function multipleSeparator(fm: Record<string, unknown>): string | null {
  const isMultiple = fm['is_multiple'];
  const details = asRecord(fm['is_multiple2']) ?? asRecord(isMultiple);
  const listToUi = details?.['list_to_ui'];
  if (typeof listToUi === 'string' && listToUi) return listToUi;
  if (typeof isMultiple === 'string' && isMultiple) return isMultiple === '|' ? ', ' : `${isMultiple} `;
  return null;
}

function parseJson(raw: unknown): unknown {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
