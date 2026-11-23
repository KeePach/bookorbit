/** Test helpers that build OPFs the way Calibre writes them. */

export interface ColumnSpec {
  lookup: string;
  datatype?: string;
  multiple?: boolean;
  value: unknown;
  extra?: unknown;
}

function columnJson(spec: ColumnSpec): Record<string, unknown> {
  const label = spec.lookup.replace(/^#/, '');
  const datatype = spec.datatype ?? 'text';
  return {
    table: `custom_column_${label.length}`,
    column: 'value',
    datatype,
    is_multiple: spec.multiple ? (datatype === 'composite' ? ',' : '|') : null,
    kind: 'field',
    name: label,
    search_terms: [spec.lookup],
    label,
    colnum: 2,
    display: {},
    is_custom: true,
    is_category: true,
    link_column: 'value',
    category_sort: 'value',
    is_csp: false,
    is_editable: true,
    rec_index: 22,
    '#value#': spec.value,
    '#extra#': spec.extra ?? null,
    is_multiple2: spec.multiple ? { cache_to_list: '|', ui_to_list: ',', list_to_ui: ', ' } : {},
  };
}

function escapeAttribute(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A library `metadata.opf` as Calibre's backup writes it (OPF 2, one meta per column). */
export function calibreLibraryOpf(title: string, columns: ColumnSpec[]): string {
  const metas = columns
    .map((spec) => `        <meta name="calibre:user_metadata:${spec.lookup}" content="${escapeAttribute(JSON.stringify(columnJson(spec)))}"/>`)
    .join('\n');
  return `<?xml version='1.0' encoding='utf-8'?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uuid_id" version="2.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
        <dc:identifier opf:scheme="calibre" id="calibre_id">1</dc:identifier>
        <dc:identifier opf:scheme="uuid" id="uuid_id">0b8f4c1e-0000-4000-8000-000000000001</dc:identifier>
        <dc:title>${title}</dc:title>
        <dc:creator opf:file-as="Davos" opf:role="aut">Davos</dc:creator>
        <dc:language>eng</dc:language>
        <meta name="calibre:title_sort" content="${title}"/>
${metas}
    </metadata>
    <guide>
        <reference type="cover" title="Cover" href="cover.jpg"/>
    </guide>
</package>
`;
}

/** An EPUB 3 package OPF as Calibre embeds it (all columns in one `calibre:user_metadata` property). */
export function calibreEpub3Opf(title: string, columns: ColumnSpec[]): string {
  const all = Object.fromEntries(columns.map((spec) => [spec.lookup, columnJson(spec)]));
  const json = JSON.stringify(all).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" prefix="calibre: https://calibre-ebook.com">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <meta property="calibre:user_metadata">${json}</meta>
  </metadata>
</package>
`;
}
