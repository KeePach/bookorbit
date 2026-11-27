import { randomUUID } from 'crypto';
import { rename, writeFile } from 'fs/promises';
import { join } from 'path';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../src/db/schema';
import { BookMetadataLockService } from '../src/modules/book-metadata-lock/book-metadata-lock.service';
import { CalibreColumnsService } from '../src/fork/calibre-columns/calibre-columns.service';
import { calibreLibraryOpf, type ColumnSpec } from '../src/fork/calibre-columns/calibre-columns-test-fixtures';
import { createEpubFixture } from './e2e/metadata-write/metadata-write-fixture-builder';
import {
  authHeader,
  closeMetadataWriteE2EContext,
  createLibraryWithFolder,
  createMetadataWriteE2EContext,
  locateBookFileByRelPath,
  triggerAndWaitForLibraryScan,
  type CreatedLibrary,
  type MetadataWriteE2EContext,
} from './e2e/metadata-write/metadata-write-harness';

const TIMEOUT_MS = 120_000;
const FIELD_KEYS = ['collection', 'kobo_shelf', 'words', 'status'];

describe('Fork: Calibre custom columns fill custom fields (e2e)', () => {
  let ctx: MetadataWriteE2EContext;
  let service: CalibreColumnsService;
  let library: CreatedLibrary;
  const fieldIds: Record<string, number> = {};
  const bookIds: Record<string, number> = {};
  const previousEnv = {
    links: process.env.FORK_CALIBRE_COLUMN_LINKS,
    poll: process.env.FORK_CALIBRE_COLUMNS_POLL_SECONDS,
    subtitle: process.env.FORK_CALIBRE_SUBTITLE_COLUMN,
  };

  const books: Record<string, { folder: string; columns: ColumnSpec[] | null }> = {
    konosuba: {
      folder: join('Davos', 'Konosuba (12)'),
      columns: [
        { lookup: '#collection', value: 'Fanfic.Ero' },
        { lookup: '#category', multiple: true, value: ['Ero', 'Konosuba'] },
        { lookup: '#words', datatype: 'int', value: 297977 },
      ],
    },
    stellar: { folder: join('Commonnerfer', 'Stellar Brockton (13)'), columns: [{ lookup: '#collection', value: 'Fanfic' }] },
    webnovel: { folder: join('Someone', 'A Web Novel (14)'), columns: [{ lookup: '#collection', value: 'Web novel.Ero' }] },
    noColumn: { folder: join('Other', 'No Column (15)'), columns: [{ lookup: '#category', multiple: true, value: [] }] },
    noOpf: { folder: join('Other', 'No Opf (16)'), columns: null },
  };

  /** Calibre replaces metadata.opf rather than rewriting it in place. */
  async function writeOpf(name: string, columns: ColumnSpec[]): Promise<void> {
    const path = join(library.folderPath, books[name].folder, 'metadata.opf');
    await writeFile(`${path}.tmp`, calibreLibraryOpf(name, columns), 'utf8');
    await rename(`${path}.tmp`, path);
  }

  async function createField(label: string, type: string): Promise<number> {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/custom-metadata/fields',
      headers: authHeader(ctx.adminToken),
      payload: { label, type, enabledLibraryIds: [library.libraryId] },
    });
    expect(response.statusCode).toBe(201);
    const field = response.json() as { id: number; key: string };
    expect(field.key).toBe(label);
    return field.id;
  }

  async function valuesOf(fieldKey: string): Promise<Record<string, unknown>> {
    const rows = await ctx.db
      .select()
      .from(schema.bookCustomMetadataValues)
      .where(
        and(eq(schema.bookCustomMetadataValues.fieldId, fieldIds[fieldKey]), inArray(schema.bookCustomMetadataValues.bookId, Object.values(bookIds))),
      );
    const byName: Record<string, unknown> = {};
    for (const [name, id] of Object.entries(bookIds)) {
      const row = rows.find((candidate) => candidate.bookId === id);
      if (row) byName[name] = row.valueText ?? row.valueNumber ?? row.valueDate ?? row.valueBoolean;
    }
    return byName;
  }

  async function scopeCount(operator: string, value: string): Promise<number> {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/smart-scopes',
      headers: authHeader(ctx.adminToken),
      payload: {
        name: `Calibre ${operator} ${value} ${randomUUID()}`,
        icon: 'Library',
        defaultSort: [],
        filter: { type: 'group', join: 'AND', rules: [{ type: 'rule', field: `custom:${fieldIds.collection}`, operator, value }] },
      },
    });
    expect(response.statusCode).toBe(201);
    return (response.json() as { bookCount: number }).bookCount;
  }

  async function subtitleOf(name: string): Promise<string | null> {
    const [row] = await ctx.db
      .select({ subtitle: schema.bookMetadata.subtitle })
      .from(schema.bookMetadata)
      .where(eq(schema.bookMetadata.bookId, bookIds[name]));
    return row?.subtitle ?? null;
  }

  async function setSubtitle(name: string, subtitle: string | null): Promise<void> {
    await ctx.db.update(schema.bookMetadata).set({ subtitle }).where(eq(schema.bookMetadata.bookId, bookIds[name]));
  }

  async function rescanAndSync() {
    await triggerAndWaitForLibraryScan(ctx, library.libraryId);
    return (await service.sync()).find((summary) => summary.libraryId === library.libraryId);
  }

  beforeAll(async () => {
    process.env.FORK_CALIBRE_COLUMN_LINKS = 'kobo_shelf=#category';
    process.env.FORK_CALIBRE_COLUMNS_POLL_SECONDS = '0';
    delete process.env.FORK_CALIBRE_SUBTITLE_COLUMN;
    ctx = await createMetadataWriteE2EContext();
    service = ctx.app.get(CalibreColumnsService);
    // Keys are unique server-wide; fields from an earlier run of this suite would push ours to `collection_1`.
    await ctx.db.delete(schema.customMetadataFields).where(inArray(schema.customMetadataFields.key, FIELD_KEYS));

    library = await createLibraryWithFolder(ctx, { name: `fork-calibre-columns-${randomUUID()}`, mode: 'book_per_folder' });
    for (const [name, book] of Object.entries(books)) {
      await createEpubFixture(library.folderPath, join(book.folder, `${name}.epub`), { title: name });
      if (book.columns) await writeOpf(name, book.columns);
    }
    await triggerAndWaitForLibraryScan(ctx, library.libraryId);
    for (const name of Object.keys(books)) {
      bookIds[name] = (await locateBookFileByRelPath(ctx, library.libraryId, join(books[name].folder, `${name}.epub`))).bookId;
    }

    fieldIds.collection = await createField('collection', 'text');
    fieldIds.kobo_shelf = await createField('kobo_shelf', 'text');
    fieldIds.words = await createField('words', 'number');
  }, TIMEOUT_MS);

  afterAll(async () => {
    await ctx.db.delete(schema.customMetadataFields).where(inArray(schema.customMetadataFields.key, FIELD_KEYS));
    await closeMetadataWriteE2EContext(ctx);
    for (const [key, value] of [
      ['FORK_CALIBRE_COLUMN_LINKS', previousEnv.links],
      ['FORK_CALIBRE_COLUMNS_POLL_SECONDS', previousEnv.poll],
      ['FORK_CALIBRE_SUBTITLE_COLUMN', previousEnv.subtitle],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it(
    'fills each field from the column named like its key, or the one its link names',
    async () => {
      const summary = (await service.sync()).find((candidate) => candidate.libraryId === library.libraryId);

      expect(summary).toMatchObject({ booksRead: 4, booksUnreadable: 0, valuesRefused: 0 });
      expect(await valuesOf('collection')).toEqual({ konosuba: 'Fanfic.Ero', stellar: 'Fanfic', webnovel: 'Web novel.Ero' });
      expect(await valuesOf('kobo_shelf')).toEqual({ konosuba: 'Ero, Konosuba' });
      expect(await valuesOf('words')).toEqual({ konosuba: 297977 });
    },
    TIMEOUT_MS,
  );

  it(
    'makes the dotted collections usable in smart scopes',
    async () => {
      expect(await scopeCount('startsWith', 'fanfic')).toBe(2);
      expect(await scopeCount('eq', 'Fanfic')).toBe(1);
      expect(await scopeCount('startsWith', 'Web novel')).toBe(1);
      expect(await scopeCount('endsWith', '.Ero')).toBe(2);
    },
    TIMEOUT_MS,
  );

  it(
    'does nothing until a scan finishes, then reads only the books whose metadata.opf changed',
    async () => {
      expect(await service.sync()).toEqual([]);

      await writeOpf('stellar', [{ lookup: '#collection', value: 'Fanfic.Ero' }]);
      await writeOpf('konosuba', [
        { lookup: '#collection', value: null },
        { lookup: '#category', multiple: true, value: ['Konosuba'] },
        { lookup: '#words', datatype: 'int', value: 300100 },
      ]);
      const summary = await rescanAndSync();

      expect(summary).toMatchObject({ booksRead: 2, valuesCleared: 1 });
      expect(await valuesOf('collection')).toEqual({ stellar: 'Fanfic.Ero', webnovel: 'Web novel.Ero' });
      expect(await valuesOf('kobo_shelf')).toEqual({ konosuba: 'Konosuba' });
      expect(await valuesOf('words')).toEqual({ konosuba: 300100 });

      const unchanged = await rescanAndSync();
      expect(unchanged).toMatchObject({ booksRead: 0, valuesWritten: 0, valuesCleared: 0 });
    },
    TIMEOUT_MS,
  );

  it(
    'reads every book again when a field is added, so the new field fills right away',
    async () => {
      await writeOpf('webnovel', [
        { lookup: '#collection', value: 'Web novel.Ero' },
        { lookup: '#status', datatype: 'enumeration', value: 'In-Progress' },
      ]);
      await triggerAndWaitForLibraryScan(ctx, library.libraryId);
      fieldIds.status = await createField('status', 'text');

      const summary = (await service.sync()).find((candidate) => candidate.libraryId === library.libraryId);

      expect(summary).toMatchObject({ booksRead: 4 });
      expect(await valuesOf('status')).toEqual({ webnovel: 'In-Progress' });
      expect(await valuesOf('collection')).toEqual({ stellar: 'Fanfic.Ero', webnovel: 'Web novel.Ero' });
    },
    TIMEOUT_MS,
  );

  it(
    'copies the Calibre subtitle into the Subtitle field, keeps others, and respects a lock',
    async () => {
      await writeOpf('stellar', [
        { lookup: '#collection', value: 'Fanfic.Ero' },
        { lookup: '#subtitle', value: 'A Worm Fanfic' },
      ]);
      await writeOpf('webnovel', [
        { lookup: '#collection', value: 'Web novel.Ero' },
        { lookup: '#status', datatype: 'enumeration', value: 'In-Progress' },
        { lookup: '#subtitle', value: null },
      ]);
      await writeOpf('konosuba', [
        { lookup: '#collection', value: null },
        { lookup: '#category', multiple: true, value: ['Konosuba'] },
        { lookup: '#words', datatype: 'int', value: 300100 },
        { lookup: '#subtitle', value: 'From Calibre' },
      ]);
      await ctx.app.get(BookMetadataLockService).replaceLockedFields(bookIds.konosuba, ['subtitle']);
      await triggerAndWaitForLibraryScan(ctx, library.libraryId);
      // As if a metadata provider had set it: Calibre has no subtitle for this book, so it stays.
      await setSubtitle('webnovel', 'From a provider');

      const summary = (await service.sync()).find((candidate) => candidate.libraryId === library.libraryId);

      expect(summary).toMatchObject({ booksRead: 3, subtitlesWritten: 1, subtitlesCleared: 0, subtitlesLocked: 1 });
      expect(await subtitleOf('stellar')).toBe('A Worm Fanfic');
      expect(await subtitleOf('webnovel')).toBe('From a provider');
      expect(await subtitleOf('konosuba')).toBeNull();
      expect(await valuesOf('collection')).toEqual({ stellar: 'Fanfic.Ero', webnovel: 'Web novel.Ero' });

      const unchanged = await rescanAndSync();
      expect(unchanged).toMatchObject({ booksRead: 0, subtitlesWritten: 0 });
    },
    TIMEOUT_MS,
  );

  it(
    'puts the Calibre subtitle back after something else replaced it',
    async () => {
      await setSubtitle('stellar', 'Edited by hand');

      const summary = await rescanAndSync();

      expect(summary).toMatchObject({ booksRead: 1, subtitlesWritten: 1 });
      expect(await subtitleOf('stellar')).toBe('A Worm Fanfic');
    },
    TIMEOUT_MS,
  );

  it(
    'clears a subtitle it wrote once Calibre has none',
    async () => {
      await writeOpf('stellar', [
        { lookup: '#collection', value: 'Fanfic.Ero' },
        { lookup: '#subtitle', value: '' },
      ]);
      await triggerAndWaitForLibraryScan(ctx, library.libraryId);
      const afterScan = await subtitleOf('stellar');

      const summary = (await service.sync()).find((candidate) => candidate.libraryId === library.libraryId);

      expect(await subtitleOf('stellar')).toBeNull();
      // The scan may already have taken it away while re-reading the book's files; if not, the sync does.
      expect(summary).toMatchObject({ subtitlesCleared: afterScan === null ? 0 : 1 });
    },
    TIMEOUT_MS,
  );

  it(
    'keeps its state in its own table, removed with the book',
    async () => {
      const result = await ctx.db.execute(
        sql`select count(*)::int as count from fork_calibre_column_state where book_id in (${sql.join(
          Object.values(bookIds).map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
      expect((result.rows[0] as { count: number }).count).toBe(4);
    },
    TIMEOUT_MS,
  );
});
