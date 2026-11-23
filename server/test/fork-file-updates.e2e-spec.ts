import { createHash, randomUUID } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { eq } from 'drizzle-orm';

import { Permission } from '@bookorbit/types';

import { computeFileHash } from '../src/common/utils/file-hash.utils';
import * as schema from '../src/db/schema';
import { createEpubFixture } from './e2e/metadata-write/metadata-write-fixture-builder';
import {
  authHeader,
  closeReaderStateIsolationE2EContext,
  createLibraryWithFolder,
  createReaderStateIsolationE2EContext,
  createUserAndLogin,
  grantLibraryAccess,
  locateBookByAbsolutePath,
  triggerAndWaitForLibraryScan,
  type CreatedLibrary,
  type LocatedBookFile,
  type ReaderStateIsolationE2EContext,
} from './e2e/reader-state-isolation/reader-state-isolation-harness';

const KOREADER_USERNAME = `fork-updates-${randomUUID().slice(0, 8)}`;
const KOREADER_PASSWORD = 'ForkUpdatesPass123';
const OTHER_HASH = 'f'.repeat(32);

describe('Fork: KOReader file updates (e2e)', { timeout: 180_000 }, () => {
  let ctx!: ReaderStateIsolationE2EContext;
  let fanfics!: CreatedLibrary;
  let novels!: CreatedLibrary;
  let hidden!: CreatedLibrary;
  let fic!: LocatedBookFile;
  let novel!: LocatedBookFile;
  let hiddenBook!: LocatedBookFile;
  let ficHash!: string;

  const deviceHeaders = () => ({ 'x-auth-user': KOREADER_USERNAME, 'x-auth-key': KOREADER_PASSWORD });

  async function checkUpdates(items: { bookFileId: number; hash: string }[], libraryIds?: number[]) {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/koreader/plugin/fork/file-updates',
      headers: deviceHeaders(),
      payload: { items, ...(libraryIds ? { libraryIds } : {}) },
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as { items: { bookFileId: number; status: string; fileHash?: string; title?: string | null; libraryId?: number }[] })
      .items;
  }

  beforeAll(async () => {
    ctx = await createReaderStateIsolationE2EContext();
    fanfics = await createLibraryWithFolder(ctx, { mode: 'book_per_folder', name: `fork-fanfics-${randomUUID()}` });
    novels = await createLibraryWithFolder(ctx, { mode: 'book_per_folder', name: `fork-novels-${randomUUID()}` });
    const ficPath = await createEpubFixture(fanfics.folderPath, 'Fic (1)/Fic - Author.epub', { title: 'Fork Update Fic' });
    const novelPath = await createEpubFixture(novels.folderPath, 'Novel (2)/Novel - Author.epub', { title: 'Fork Update Novel' });
    hidden = await createLibraryWithFolder(ctx, { mode: 'book_per_folder', name: `fork-hidden-${randomUUID()}` });
    const hiddenPath = await createEpubFixture(hidden.folderPath, 'Hidden (3)/Hidden - Author.epub', { title: 'Fork Hidden Book' });
    for (const library of [fanfics, novels, hidden]) await triggerAndWaitForLibraryScan(ctx, library.libraryId);
    fic = await locateBookByAbsolutePath(ctx, ficPath);
    novel = await locateBookByAbsolutePath(ctx, novelPath);
    hiddenBook = await locateBookByAbsolutePath(ctx, hiddenPath);
    ficHash = (await ctx.db.select({ hash: schema.bookFiles.fileHash }).from(schema.bookFiles).where(eq(schema.bookFiles.id, fic.bookFileId)))[0]!
      .hash!;

    const reader = await createUserAndLogin(ctx, { permissions: [Permission.KoreaderSync] });
    await grantLibraryAccess(ctx, reader.userId, fanfics.libraryId);
    await grantLibraryAccess(ctx, reader.userId, novels.libraryId);
    const credentials = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/koreader/credentials',
      headers: authHeader(reader.accessToken),
      payload: { username: KOREADER_USERNAME, password: KOREADER_PASSWORD },
    });
    expect([200, 201]).toContain(credentials.statusCode);
  }, 180_000);

  afterAll(async () => {
    if (ctx) await closeReaderStateIsolationE2EContext(ctx);
  });

  it('lists only the libraries the device user can see', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/koreader/plugin/fork/libraries', headers: deviceHeaders() });
    expect(response.statusCode).toBe(200);
    const ids = (response.json() as { libraries: { id: number; name: string }[] }).libraries.map((library) => library.id);
    expect(ids).toEqual(expect.arrayContaining([fanfics.libraryId, novels.libraryId]));
    expect(ids).not.toContain(hidden.libraryId);
  });

  it('treats a file in a library the user cannot see as missing, and refuses to serve it', async () => {
    const items = await checkUpdates([{ bookFileId: hiddenBook.bookFileId, hash: OTHER_HASH }]);
    expect(items[0]).toEqual({ bookFileId: hiddenBook.bookFileId, status: 'missing' });
    const download = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/koreader/plugin/fork/files/${hiddenBook.bookFileId}/original`,
      headers: deviceHeaders(),
    });
    expect([403, 404]).toContain(download.statusCode);
  });

  it('reports current, updated, out-of-scope and missing files', async () => {
    const items = await checkUpdates(
      [
        { bookFileId: fic.bookFileId, hash: ficHash.toUpperCase() },
        { bookFileId: fic.bookFileId, hash: OTHER_HASH },
        { bookFileId: novel.bookFileId, hash: OTHER_HASH },
        { bookFileId: 999_999_999, hash: OTHER_HASH },
      ],
      [fanfics.libraryId],
    );

    expect(items[0]).toMatchObject({ bookFileId: fic.bookFileId, status: 'current', bookId: fic.bookId });
    expect(items[0]).toHaveProperty('title');
    expect(items[1]).toMatchObject({ bookFileId: fic.bookFileId, status: 'updated', fileHash: ficHash, libraryId: fanfics.libraryId });
    expect(items[2]).toMatchObject({ bookFileId: novel.bookFileId, status: 'out_of_scope' });
    expect(items[3]).toEqual({ bookFileId: 999_999_999, status: 'missing' });
  });

  it('checks every library when none is chosen', async () => {
    const items = await checkUpdates([{ bookFileId: novel.bookFileId, hash: OTHER_HASH }]);
    expect(items[0]).toMatchObject({ status: 'updated' });
  });

  it('serves the original file byte for byte, so its hash matches BookOrbit', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/koreader/plugin/fork/files/${fic.bookFileId}/original`,
      headers: deviceHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-bookorbit-file-hash']).toBe(ficHash);

    const original = await readFile(fic.absolutePath);
    expect(createHash('sha256').update(response.rawPayload).digest('hex')).toBe(createHash('sha256').update(original).digest('hex'));

    const dir = await mkdtemp(join(tmpdir(), 'fork-download-'));
    try {
      const downloaded = join(dir, 'book.epub');
      await writeFile(downloaded, response.rawPayload);
      expect(await computeFileHash(downloaded)).toBe(ficHash);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses downloads without credentials and for unknown files', async () => {
    const anonymous = await ctx.app.inject({ method: 'GET', url: `/api/v1/koreader/plugin/fork/files/${fic.bookFileId}/original` });
    expect(anonymous.statusCode).toBe(401);
    const unknown = await ctx.app.inject({ method: 'GET', url: '/api/v1/koreader/plugin/fork/files/999999999/original', headers: deviceHeaders() });
    expect(unknown.statusCode).toBe(404);
  });

  it('releases only the hash link that points at the given file', async () => {
    const deviceHash = randomUUID().replace(/-/g, '');
    const link = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/koreader/plugin/match-check',
      headers: deviceHeaders(),
      payload: {
        deviceId: 'e2e-fork-0002',
        deviceModel: 'E2E',
        pluginVersion: '2.4.0',
        hashes: [deviceHash],
        books: [{ hash: deviceHash, title: 'Fic', source: 'file', bookFileId: fic.bookFileId }],
      },
    });
    expect([200, 201]).toContain(link.statusCode);
    const links = () => ctx.db.select().from(schema.koreaderBookHashLinks).where(eq(schema.koreaderBookHashLinks.hash, deviceHash));
    expect(await links()).toHaveLength(1);

    const wrongFile = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/koreader/plugin/fork/release-links',
      headers: deviceHeaders(),
      payload: { items: [{ hash: deviceHash, bookFileId: novel.bookFileId }] },
    });
    expect(wrongFile.json()).toEqual({ released: 0 });
    expect(await links()).toHaveLength(1);

    const released = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/koreader/plugin/fork/release-links',
      headers: deviceHeaders(),
      payload: { items: [{ hash: deviceHash.toUpperCase(), bookFileId: fic.bookFileId }] },
    });
    expect(released.json()).toEqual({ released: 1 });
    expect(await links()).toHaveLength(0);

    const unmatched = await ctx.db.select().from(schema.koreaderUnmatchedBooks).where(eq(schema.koreaderUnmatchedBooks.hash, deviceHash));
    expect(unmatched).toHaveLength(0);
  });
});
