import { randomUUID } from 'crypto';
import { writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { eq, sql } from 'drizzle-orm';

import { Permission } from '@bookorbit/types';

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
  type LocatedBookFile,
  type ReaderStateIsolationE2EContext,
} from './e2e/reader-state-isolation/reader-state-isolation-harness';

const KOREADER_USERNAME = `fork-calibre-${randomUUID().slice(0, 8)}`;
const KOREADER_PASSWORD = 'ForkCalibrePass123';
const DEVICE_ID = 'e2e-fork-0001';
const CALIBRE_UUID = randomUUID();

function calibreOpf(uuid: string, calibreId: number, title: string): string {
  return `<?xml version='1.0' encoding='utf-8'?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uuid_id" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier opf:scheme="calibre" id="calibre_id">${calibreId}</dc:identifier>
    <dc:identifier opf:scheme="uuid" id="uuid_id">${uuid}</dc:identifier>
    <dc:title>${title}</dc:title>
  </metadata>
</package>`;
}

describe('Fork: Calibre uuid linking for KOReader (e2e)', { timeout: 180_000 }, () => {
  let ctx!: ReaderStateIsolationE2EContext;
  let book!: LocatedBookFile;

  const deviceHeaders = () => ({ 'x-auth-user': KOREADER_USERNAME, 'x-auth-key': KOREADER_PASSWORD });

  beforeAll(async () => {
    ctx = await createReaderStateIsolationE2EContext();
    const library = await createLibraryWithFolder(ctx, { mode: 'book_per_folder', name: `fork-calibre-${randomUUID()}` });
    const title = `Fork Fic ${randomUUID().slice(0, 8)}`;
    const epubPath = await createEpubFixture(library.folderPath, `${title} (12)/${title} - Author.epub`, { title });
    await writeFile(join(dirname(epubPath), 'metadata.opf'), calibreOpf(CALIBRE_UUID, 12, title));
    await triggerAndWaitForLibraryScan(ctx, library.libraryId);
    book = await locateBookByAbsolutePath(ctx, epubPath);

    const reader = await createUserAndLogin(ctx, { permissions: [Permission.KoreaderSync] });
    await grantLibraryAccess(ctx, reader.userId, library.libraryId);
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

  it('creates its own table on startup, outside the upstream migrations', async () => {
    const result = await ctx.db.execute(sql`select to_regclass('public.fork_book_calibre_refs') as name`);
    expect((result.rows[0] as { name: string | null }).name).toBe('fork_book_calibre_refs');
  });

  it('advertises its capabilities to the plugin', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/koreader/plugin/fork/capabilities', headers: deviceHeaders() });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ capabilities: ['calibreResolve', 'fileUpdates', 'releaseLinks'] });
  });

  it('requires KOReader credentials', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/koreader/plugin/fork/calibre-resolve',
      payload: { uuids: [CALIBRE_UUID] },
    });
    expect(response.statusCode).toBe(401);
  });

  it('resolves a Calibre uuid to the book that carries it, indexing on demand', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/koreader/plugin/fork/calibre-resolve',
      headers: deviceHeaders(),
      payload: { uuids: [CALIBRE_UUID.toUpperCase(), randomUUID()] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ matches: [{ uuid: CALIBRE_UUID, bookId: book.bookId, bookFileId: book.bookFileId }] });
  });

  it('rejects values that are not uuids', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/koreader/plugin/fork/calibre-resolve',
      headers: deviceHeaders(),
      payload: { uuids: ['3234'] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('lets the upstream match check link a device copy hash to the resolved file', async () => {
    const deviceCopyHash = randomUUID().replace(/-/g, '');
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/koreader/plugin/match-check',
      headers: deviceHeaders(),
      payload: {
        deviceId: DEVICE_ID,
        deviceModel: 'E2E',
        pluginVersion: '2.4.0',
        hashes: [deviceCopyHash],
        books: [{ hash: deviceCopyHash, title: 'Fork Fic', source: 'file', bookFileId: book.bookFileId }],
      },
    });

    expect([200, 201]).toContain(response.statusCode);
    const body = response.json() as { matches: { hash: string; bookId: number; bookFileId: number }[] };
    expect(body.matches).toContainEqual(expect.objectContaining({ hash: deviceCopyHash, bookId: book.bookId, bookFileId: book.bookFileId }));

    const links = await ctx.db.select().from(schema.koreaderBookHashLinks).where(eq(schema.koreaderBookHashLinks.hash, deviceCopyHash));
    expect(links).toHaveLength(1);
  });
});
