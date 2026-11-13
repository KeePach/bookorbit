import { createWriteStream } from 'fs';
import { rename, rm } from 'fs/promises';

import { ZipArchive } from 'archiver';
import * as unzipper from 'unzipper';

import { readEpubEntry } from '../../book/epub-delivery-validation';

/** A page larger than this is left as it is: a cover page is a few hundred bytes. */
const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const PAGE_ENTRY = /\.(?:xhtml|html|htm)$/i;
const SVG_OR_IMAGE_TAG = /<(?:svg|image)\b[^>]*>/gi;
const STRETCH_ATTRIBUTE = /(\spreserveAspectRatio\s*=\s*)(["'])\s*none\s*\2/gi;

/** Every entry gets the DOS epoch, so rebuilding the same conversion gives the same bytes. */
const ZIP_ENTRY_DATE = new Date(Date.UTC(1980, 0, 1, 0, 0, 0));

/**
 * Calibre and other tools wrap a cover in an SVG sized to the whole page with
 * `preserveAspectRatio="none"`, which stretches the picture to the screen. `xMidYMid meet` fits the
 * same picture inside the same box without changing its shape. Only the attribute on an `<svg>` or
 * `<image>` tag is touched, never text that happens to mention it.
 */
export function keepSvgAspectRatio(markup: string): string {
  if (!/preserveAspectRatio/i.test(markup)) return markup;
  return markup.replace(SVG_OR_IMAGE_TAG, (tag) => tag.replace(STRETCH_ATTRIBUTE, '$1$2xMidYMid meet$2'));
}

/**
 * Rewrites a converted KEPUB in place so no cover or full-page SVG is stretched. Returns false and
 * leaves the file untouched when no page needs the change, which is the usual case. Only the
 * converted copy is changed, never the source book.
 */
export async function keepCoverAspectRatio(kepubPath: string): Promise<boolean> {
  const zip = await unzipper.Open.file(kepubPath);
  const patched = new Map<string, Buffer>();
  for (const entry of zip.files) {
    if (entry.type !== 'File' || !PAGE_ENTRY.test(entry.path) || entry.uncompressedSize > MAX_PAGE_BYTES) continue;
    const original = (await readEpubEntry(entry, MAX_PAGE_BYTES)).toString('utf-8');
    const updated = keepSvgAspectRatio(original);
    if (updated !== original) patched.set(entry.path, Buffer.from(updated, 'utf-8'));
  }
  if (patched.size === 0) return false;

  const rebuiltPath = `${kepubPath}.aspect`;
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const output = createWriteStream(rebuiltPath);
  const written = new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => {
      archive.abort();
      output.destroy();
      reject(error);
    };
    output.on('close', resolve);
    output.on('error', fail);
    archive.on('error', fail);
  });
  archive.pipe(output);

  try {
    // The mimetype entry comes first and is stored, as the EPUB container format requires.
    archive.append(Buffer.from('application/epub+zip'), { name: 'mimetype', store: true, date: ZIP_ENTRY_DATE });
    for (const entry of zip.files) {
      if (entry.type !== 'File' || entry.path === 'mimetype') continue;
      archive.append(patched.get(entry.path) ?? entry.stream(), { name: entry.path, date: ZIP_ENTRY_DATE });
    }
    await Promise.all([archive.finalize(), written]);
    await rename(rebuiltPath, kepubPath);
    return true;
  } catch (error) {
    await rm(rebuiltPath, { force: true });
    throw error;
  }
}
