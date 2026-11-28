import { randomUUID } from 'crypto';
import { createServer, type IncomingMessage, type Server } from 'http';
import type { AddressInfo } from 'net';

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../src/db/schema';
import { UserBookStatusService } from '../src/modules/user-book-status/user-book-status.service';
import {
  authHeader,
  closeMetadataWriteE2EContext,
  createLibraryWithFolder,
  createMetadataWriteE2EContext,
  type CreatedLibrary,
  type MetadataWriteE2EContext,
} from './e2e/metadata-write/metadata-write-harness';

const TIMEOUT_MS = 120_000;
const TOKEN = 'mb-e2e-token-wxyz';

interface SeenRequest {
  method: string;
  path: string;
  apiKey: string | undefined;
  body: unknown;
}

/** A stand-in for api.mangabaka.org: series 10 is releasing, the library starts empty. */
class FakeMangabaka {
  readonly requests: SeenRequest[] = [];
  entry: Record<string, unknown> | null = null;
  private server: Server | null = null;
  url = '';

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  writes(): SeenRequest[] {
    return this.requests.filter((r) => r.method === 'POST' || r.method === 'PATCH');
  }

  private async handle(req: IncomingMessage, res: import('http').ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    const path = req.url ?? '';
    const apiKey = req.headers['x-api-key'] as string | undefined;
    this.requests.push({ method: req.method ?? '', path, apiKey, body });
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (apiKey !== TOKEN) return send(401, { message: 'Unauthorized' });
    if (path.startsWith('/v1/my/library?')) return send(200, { status: 200, data: [] });
    if (path === '/v1/series/10') {
      return send(200, {
        status: 200,
        data: {
          id: 10,
          title: 'Fake',
          canonical_url: 'https://mangabaka.org/manga/10/Fake',
          status: 'releasing',
          total_chapters: '40',
          final_volume: '4',
          merged_with: null,
        },
      });
    }
    if (path === '/v1/my/library/10') {
      if (req.method === 'GET') return this.entry ? send(200, { status: 200, data: this.entry }) : send(404, { message: 'Not found' });
      if (req.method === 'POST') {
        this.entry = { ...body, series_id: 10 };
        return send(201, { status: 201, data: true });
      }
      if (req.method === 'PATCH') {
        this.entry = { ...this.entry, ...body };
        return send(200, { status: 200, data: true });
      }
    }
    return send(404, { message: 'Not found' });
  }
}

describe('Fork: MangaBaka reading sync (e2e)', () => {
  let ctx: MetadataWriteE2EContext;
  let library: CreatedLibrary;
  let adminId: number;
  let seriesId: number;
  let otherSeriesId: number;
  const bookIds: number[] = [];
  let otherBookId: number;
  const fake = new FakeMangabaka();
  const runId = randomUUID().slice(0, 8);
  const previousEnv = { url: process.env.FORK_MANGABAKA_API_URL, debounce: process.env.FORK_MANGABAKA_SYNC_DEBOUNCE_MS };

  async function addBook(name: string, series: number, index: string, providerId: string | null): Promise<number> {
    const [book] = await ctx.db
      .insert(schema.books)
      .values({ libraryId: library.libraryId, libraryFolderId: library.libraryFolderId, folderPath: `${library.folderPath}/${name}.cbz` })
      .returning({ id: schema.books.id });
    await ctx.db.insert(schema.bookSeriesMemberships).values({ bookId: book.id, seriesId: series, seriesIndex: index });
    if (providerId) await ctx.db.insert(schema.bookProviderIds).values({ bookId: book.id, provider: 'mangabaka', externalId: providerId });
    return book.id;
  }

  async function setStatus(bookId: number, status: 'read' | 'reading' | 'unread', finishedAt: Date | null = null): Promise<void> {
    await ctx.db
      .insert(schema.userBookStatus)
      .values({ userId: adminId, bookId, status, source: 'manual', startedAt: new Date('2026-11-01T18:00:00Z'), finishedAt })
      .onConflictDoUpdate({
        target: [schema.userBookStatus.userId, schema.userBookStatus.bookId],
        set: { status, finishedAt },
      });
  }

  async function call(method: 'GET' | 'PATCH' | 'PUT' | 'POST', url: string, payload?: unknown) {
    return ctx.app.inject({ method, url: `/api/v1/fork/mangabaka-sync${url}`, headers: authHeader(ctx.adminToken), payload: payload as never });
  }

  beforeAll(async () => {
    await fake.start();
    process.env.FORK_MANGABAKA_API_URL = fake.url;
    process.env.FORK_MANGABAKA_SYNC_DEBOUNCE_MS = '200';
    ctx = await createMetadataWriteE2EContext();
    library = await createLibraryWithFolder(ctx, { name: `MangaBaka sync e2e ${runId}`, mode: 'book_per_file' });
    const me = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: authHeader(ctx.adminToken) });
    adminId = (me.json() as { id: number }).id;
    const [series] = await ctx.db
      .insert(schema.bookSeries)
      .values({ name: `Fake Series ${runId}`, normalizedName: `fake series ${runId}` })
      .returning();
    const [other] = await ctx.db
      .insert(schema.bookSeries)
      .values({ name: `Other Series ${runId}`, normalizedName: `other series ${runId}` })
      .returning();
    seriesId = series.id;
    otherSeriesId = other.id;
    bookIds.push(await addBook('ch1', seriesId, '1', '10vol1v1'));
    bookIds.push(await addBook('ch2', seriesId, '2', '10vol1v2'));
    bookIds.push(await addBook('ch3', seriesId, '3', '10vol2v3'));
    bookIds.push(await addBook('no-id', seriesId, '4', null));
    otherBookId = await addBook('other', otherSeriesId, '1', '77v1');
    await setStatus(bookIds[0], 'read', new Date('2026-11-02T18:00:00Z'));
    await setStatus(bookIds[1], 'read', new Date('2026-11-03T18:00:00Z'));
  }, TIMEOUT_MS);

  afterAll(async () => {
    if (ctx) await closeMetadataWriteE2EContext(ctx);
    await fake.stop();
    process.env.FORK_MANGABAKA_API_URL = previousEnv.url;
    process.env.FORK_MANGABAKA_SYNC_DEBOUNCE_MS = previousEnv.debounce;
  });

  it(
    'refuses a token MangaBaka rejects, saves a good one, and never sends it back',
    async () => {
      const refused = await call('PATCH', '/settings', { apiToken: 'mb-wrong' });
      expect(refused.statusCode).toBe(400);
      expect(refused.json()).toMatchObject({ errorCode: 'MANGABAKA_TOKEN_REFUSED' });

      const saved = await call('PATCH', '/settings', { apiToken: TOKEN });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({ configured: true, enabled: true, tokenHint: 'wxyz', series: [] });
      expect(saved.body).not.toContain(TOKEN);
    },
    TIMEOUT_MS,
  );

  it(
    'shows the series MangaBaka id before it is picked',
    async () => {
      const status = await call('GET', `/series/${seriesId}`);
      expect(status.statusCode).toBe(200);
      expect(status.json()).toEqual({ configured: true, enabled: true, selected: false, mangabakaId: '10', last: null });
    },
    TIMEOUT_MS,
  );

  it(
    'adds the series to MangaBaka when it is picked',
    async () => {
      const picked = await call('PUT', `/series/${seriesId}`, { selected: true });
      expect(picked.statusCode).toBe(200);
      expect(picked.json()).toMatchObject({
        selected: true,
        last: { outcome: 'created', mangabakaId: '10', url: 'https://mangabaka.org/manga/10/Fake', progressChapter: 2, progressVolume: 1 },
      });
      expect(fake.writes()).toEqual([
        {
          method: 'POST',
          path: '/v1/my/library/10',
          apiKey: TOKEN,
          body: { state: 'reading', progress_chapter: 2, progress_volume: 1, start_date: expect.stringMatching(/^2026-11-0[12]$/) },
        },
      ]);
    },
    TIMEOUT_MS,
  );

  it(
    'follows a status change of one of its books, and ignores series that are not picked',
    async () => {
      const statuses = ctx.app.get(UserBookStatusService);
      await statuses.updateManual(adminId, bookIds[2], { status: 'read' });
      await statuses.updateManual(adminId, otherBookId, { status: 'read' });
      await new Promise((resolve) => setTimeout(resolve, 1_500));

      const writes = fake.writes();
      expect(writes).toHaveLength(2);
      expect(writes[1]).toMatchObject({ method: 'PATCH', path: '/v1/my/library/10', body: { progress_chapter: 3, progress_volume: 2 } });
      expect(fake.requests.some((r) => r.path.includes('/77'))).toBe(false);

      const [row] = await ctx.db
        .select()
        .from(schema.userBookStatus)
        .where(and(eq(schema.userBookStatus.userId, adminId), eq(schema.userBookStatus.bookId, bookIds[2])));
      expect(row.status).toBe('read');
    },
    TIMEOUT_MS,
  );

  it(
    'never lowers what MangaBaka has',
    async () => {
      fake.entry = { ...fake.entry, progress_chapter: 30 };
      const now = await call('POST', `/series/${seriesId}/sync`);
      expect(now.json()).toMatchObject({ last: { outcome: 'unchanged' } });
      expect(fake.writes()).toHaveLength(2);
    },
    TIMEOUT_MS,
  );

  it(
    'lists the picked series with its last result, and forgets it when turned off',
    async () => {
      const settings = await call('GET', '/settings');
      expect(settings.json().series).toEqual([
        expect.objectContaining({ seriesId, seriesName: `Fake Series ${runId}`, last: expect.objectContaining({ outcome: 'unchanged' }) }),
      ]);

      const off = await call('PUT', `/series/${seriesId}`, { selected: false });
      expect(off.json()).toMatchObject({ selected: false, last: null });
      const notPicked = await call('POST', `/series/${seriesId}/sync`);
      expect(notPicked.statusCode).toBe(404);
    },
    TIMEOUT_MS,
  );
});
