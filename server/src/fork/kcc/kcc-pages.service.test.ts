import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import * as unzipper from 'unzipper';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RequestUser } from '../../common/types/request-user';
import { writeZipArchive } from '../../modules/file-write/formats/shared/zip-rewrite';
import { CbzService } from '../../modules/reader/cbz/cbz.service';
import { KccPagesService } from './kcc-pages.service';
import type { KccBookFile } from './kcc.repository';

const user = { id: 1 } as RequestUser;

async function page(label: number): Promise<Buffer> {
  return sharp({ create: { width: 400, height: 600, channels: 3, background: { r: label * 40, g: 0, b: 0 } } })
    .jpeg()
    .toBuffer();
}

describe('KccPagesService', () => {
  let dir: string;
  let file: KccBookFile;
  let comics: CbzService;
  let service: KccPagesService;
  const bookService = { verifyFileAccess: vi.fn() };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kcc-pages-'));
    const absolutePath = join(dir, 'Teppu Vol. 4.cbz');
    // Stored out of order, with credits pages, to check the reader's order is what counts.
    await writeZipArchive(absolutePath, [
      { name: 'Teppu 04/003.jpg', source: await page(3) },
      { name: 'Teppu 04/001.jpg', source: await page(1) },
      { name: 'Teppu 04/002.jpg', source: await page(2) },
      { name: 'Teppu 04/004.jpg', source: await page(4) },
      { name: 'Teppu 04/005.jpg', source: await page(5) },
      { name: 'ComicInfo.xml', source: Buffer.from('<ComicInfo/>') },
    ]);
    file = {
      bookId: 3,
      libraryId: 1,
      title: 'Teppu 4',
      fileId: 30,
      absolutePath,
      relPath: 'Teppu Vol. 4.cbz',
      bookFolderPath: absolutePath,
      format: 'cbz',
      fileHash: null,
      fileWriteEnabled: true,
      fileRenameEnabled: true,
      excludePatterns: [],
    };
    bookService.verifyFileAccess.mockResolvedValue({ format: 'cbz', absolutePath });
    comics = new CbzService(bookService as never);
    service = new KccPagesService(comics);
  });

  afterEach(async () => {
    await comics.onModuleDestroy();
    await rm(dir, { recursive: true, force: true });
  });

  it('lists the reader pages of a comic and says no for a PDF', async () => {
    await expect(service.info(user, file)).resolves.toEqual({ supported: true, reason: null, pageCount: 5, version: '30-5' });
    await expect(service.info(user, { ...file, fileHash: 'abc' })).resolves.toMatchObject({ version: 'abc' });
    await expect(service.info(user, { ...file, format: 'pdf' })).resolves.toEqual({
      supported: false,
      reason: "Choosing pages isn't supported for PDF files",
      pageCount: 0,
      version: '',
    });
  });

  it('makes a small WebP thumbnail of a page', async () => {
    const thumb = await service.thumbnail(user, file, 0);
    const meta = await sharp(thumb.data).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 240, height: 360 });
    expect(thumb.etag).toMatch(/^"kcc-thumb-/);
  });

  it('leaves the removed pages out and keeps reading order', async () => {
    const out = join(dir, 'out.cbz');
    await expect(service.writeWithoutPages(user, file, [1, 3], join(dir, 'scratch'), out)).resolves.toBe(3);

    const zip = await unzipper.Open.file(out);
    expect(zip.files.map((entry) => entry.path)).toEqual(['0001.jpg', '0002.jpg', '0003.jpg']);
    // Pages 1, 3 and 5 of the reader, told apart by their red channel.
    const reds = await Promise.all(zip.files.map(async (entry) => (await sharp(await entry.buffer()).stats()).channels[0].mean));
    expect(reds.map((red) => Math.round(red / 40))).toEqual([1, 3, 5]);
  });

  it('refuses pages that do not exist, or removing every page', async () => {
    await expect(service.writeWithoutPages(user, file, [5], join(dir, 's1'), join(dir, 'a.cbz'))).rejects.toMatchObject({
      response: { errorCode: 'KCC_BAD_PAGES', message: "Page 6 doesn't exist in this book (5 pages)" },
    });
    await expect(service.writeWithoutPages(user, file, [0, 1, 2, 3, 4], join(dir, 's2'), join(dir, 'b.cbz'))).rejects.toMatchObject({
      response: { message: 'Keep at least one page' },
    });
  });
});
