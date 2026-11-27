import { BadRequestException, Injectable } from '@nestjs/common';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import sharp from 'sharp';

import type { KccPagesInfo } from '@bookorbit/types';

import type { RequestUser } from '../../common/types/request-user';
import { writeZipArchive, type ZipRewriteEntry } from '../../modules/file-write/formats/shared/zip-rewrite';
import { CbzService } from '../../modules/reader/cbz/cbz.service';
import type { KccBookFile } from './kcc.repository';

/** Formats whose pages BookOrbit's comic reader lists, so pages can be chosen before converting. */
export const KCC_PAGE_FORMATS = new Set(['cbz', 'cbr', 'cb7']);
const THUMB_WIDTH = 240;

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/jxl': '.jxl',
  'image/tiff': '.tif',
};

async function toBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

/**
 * Pages for the Convert dialog's Pages tab, in the comic reader's own order (upstream CbzService),
 * so the pages removed there are exactly the ones the user saw.
 */
@Injectable()
export class KccPagesService {
  constructor(private readonly comics: CbzService) {}

  async info(user: RequestUser, file: KccBookFile): Promise<KccPagesInfo> {
    const format = file.format?.toLowerCase() ?? '';
    if (!KCC_PAGE_FORMATS.has(format)) {
      return {
        supported: false,
        reason: `Choosing pages isn't supported for ${format ? format.toUpperCase() : 'this'} files`,
        pageCount: 0,
        version: '',
      };
    }
    const pageCount = await this.comics.getPageCount(file.fileId, user);
    return { supported: true, reason: null, pageCount, version: file.fileHash ?? `${file.fileId}-${pageCount}` };
  }

  /** A small WebP of one page for the grid. */
  async thumbnail(user: RequestUser, file: KccBookFile, pageIndex: number): Promise<{ data: Buffer; etag: string }> {
    const page = await this.comics.streamPage(file.fileId, pageIndex, user);
    if (page.notModified) throw new Error('unexpected not-modified page');
    const data = await sharp(await toBuffer(page.stream), { failOn: 'none' })
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
    return { data, etag: `"kcc-thumb-${page.etag.replace(/"/g, '')}"` };
  }

  /**
   * Writes a CBZ with every page except `removePages` (0-based, reader order), numbered so KCC
   * keeps that order. Pages go to `scratchDir` one at a time first, so memory stays at one page.
   * Returns how many pages it kept.
   */
  async writeWithoutPages(
    user: RequestUser,
    file: KccBookFile,
    removePages: readonly number[],
    scratchDir: string,
    outPath: string,
  ): Promise<number> {
    const pageCount = await this.comics.getPageCount(file.fileId, user);
    const removed = new Set(removePages);
    for (const index of removed) {
      if (!Number.isInteger(index) || index < 0 || index >= pageCount) {
        throw new BadRequestException({ errorCode: 'KCC_BAD_PAGES', message: `Page ${index + 1} doesn't exist in this book (${pageCount} pages)` });
      }
    }
    const kept = Array.from({ length: pageCount }, (_, index) => index).filter((index) => !removed.has(index));
    if (kept.length === 0) throw new BadRequestException({ errorCode: 'KCC_BAD_PAGES', message: 'Keep at least one page' });

    await mkdir(scratchDir, { recursive: true });
    const width = Math.max(4, String(kept.length).length);
    const entries: ZipRewriteEntry[] = [];
    for (const [position, index] of kept.entries()) {
      const page = await this.comics.streamPage(file.fileId, index, user);
      if (page.notModified) throw new Error('unexpected not-modified page');
      const name = `${String(position + 1).padStart(width, '0')}${EXTENSION_BY_MIME[page.mimeType] ?? '.jpg'}`;
      const path = join(scratchDir, name);
      await pipeline(page.stream as Readable, createWriteStream(path));
      // Pages are already compressed images; storing them skips a pointless deflate pass.
      entries.push({ name, source: () => createReadStream(path), store: true });
    }
    await writeZipArchive(outPath, entries);
    return kept.length;
  }
}
