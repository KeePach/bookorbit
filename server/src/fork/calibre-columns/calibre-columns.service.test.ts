import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { BookMetadataLockService } from '../../modules/book-metadata-lock/book-metadata-lock.service';
import type { CustomMetadataService } from '../../modules/custom-metadata/custom-metadata.service';
import type { MetadataScoreService } from '../../modules/metadata-score/metadata-score.service';
import { calibreLibraryOpf } from './calibre-columns-test-fixtures';
import type { CalibreColumnsRepository, LibraryField, PendingBook } from './calibre-columns.repository';
import { CalibreColumnsService } from './calibre-columns.service';

describe('CalibreColumnsService', () => {
  let dir: string;
  let fields: LibraryField[];
  let pending: PendingBook[];
  let scanEnd: number;
  let libraryIds: number[];
  let lockedSubtitles: Set<number>;
  type RepositoryMethod =
    | 'ensureStateTable'
    | 'listActiveFieldsByLibrary'
    | 'listLibraryIds'
    | 'latestScanEndByLibrary'
    | 'findPendingBooks'
    | 'recordStates'
    | 'writeSubtitle';
  let repository: { [K in RepositoryMethod]: Mock<CalibreColumnsRepository[K]> };
  let customMetadata: { updateBookValues: Mock<CustomMetadataService['updateBookValues']> };
  let locks: { getBookIdsWithLockedField: Mock<BookMetadataLockService['getBookIdsWithLockedField']> };
  let score: { calculateAndSaveMany: Mock<MetadataScoreService['calculateAndSaveMany']> };

  function book(bookId: number, opfPath: string, extra: Partial<PendingBook> = {}): PendingBook {
    return { bookId, opfPath, opfMtime: null, opfSize: null, subtitle: null, subtitleWritten: null, ...extra };
  }

  async function writeOpf(name: string, xml: string): Promise<string> {
    const path = join(dir, `${name}.opf`);
    await writeFile(path, xml, 'utf8');
    return path;
  }

  async function makeService(links = '', subtitleColumn: string | null = null): Promise<CalibreColumnsService> {
    const service = new CalibreColumnsService(
      repository as unknown as CalibreColumnsRepository,
      customMetadata as unknown as CustomMetadataService,
      locks as unknown as BookMetadataLockService,
      score as unknown as MetadataScoreService,
      { links, pollSeconds: 0, subtitleColumn },
    );
    await service.onModuleInit();
    return service;
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fork-calibre-columns-'));
    fields = [
      { libraryId: 7, id: 1, key: 'collection', type: 'text' },
      { libraryId: 7, id: 2, key: 'kobo_shelf', type: 'text' },
      { libraryId: 7, id: 3, key: 'words', type: 'number' },
    ];
    pending = [];
    scanEnd = 1000;
    libraryIds = [7];
    lockedSubtitles = new Set();
    repository = {
      ensureStateTable: vi.fn<CalibreColumnsRepository['ensureStateTable']>().mockResolvedValue(undefined),
      listActiveFieldsByLibrary: vi.fn<CalibreColumnsRepository['listActiveFieldsByLibrary']>(() => Promise.resolve(fields)),
      listLibraryIds: vi.fn<CalibreColumnsRepository['listLibraryIds']>(() => Promise.resolve(libraryIds)),
      latestScanEndByLibrary: vi.fn<CalibreColumnsRepository['latestScanEndByLibrary']>((ids: number[]) =>
        Promise.resolve(new Map(ids.map((id) => [id, scanEnd]))),
      ),
      findPendingBooks: vi.fn<CalibreColumnsRepository['findPendingBooks']>((_libraryId: number, _signature: string, after: number) =>
        Promise.resolve(pending.filter((book) => book.bookId > after)),
      ),
      recordStates: vi.fn<CalibreColumnsRepository['recordStates']>().mockResolvedValue(undefined),
      writeSubtitle: vi.fn<CalibreColumnsRepository['writeSubtitle']>().mockResolvedValue(true),
    };
    customMetadata = { updateBookValues: vi.fn<CustomMetadataService['updateBookValues']>().mockResolvedValue(undefined) };
    locks = {
      getBookIdsWithLockedField: vi.fn<BookMetadataLockService['getBookIdsWithLockedField']>((ids: number[]) =>
        Promise.resolve(new Set(ids.filter((id) => lockedSubtitles.has(id)))),
      ),
    };
    score = { calculateAndSaveMany: vi.fn<MetadataScoreService['calculateAndSaveMany']>().mockResolvedValue(undefined) };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('copies linked columns into the fields and records what it read', async () => {
    const opfPath = await writeOpf(
      'konosuba',
      calibreLibraryOpf('Konosuba', [
        { lookup: '#collection', value: 'Fanfic.Ero' },
        { lookup: '#category', multiple: true, value: ['Ero', 'Konosuba'] },
        { lookup: '#words', datatype: 'int', value: 297977 },
        { lookup: '#unlinked', value: 'ignored' },
      ]),
    );
    pending = [book(11, opfPath, { opfMtime: '2026-11-15 12:02:00.123456+00', opfSize: 4096 })];

    const service = await makeService('kobo_shelf=#category');
    const [summary] = await service.sync();

    expect(customMetadata.updateBookValues).toHaveBeenCalledWith(11, 7, [
      { fieldId: 1, value: 'Fanfic.Ero' },
      { fieldId: 2, value: 'Ero, Konosuba' },
      { fieldId: 3, value: 297977 },
    ]);
    expect(repository.recordStates).toHaveBeenCalledWith([
      { bookId: 11, opfPath, opfMtime: '2026-11-15 12:02:00.123456+00', opfSize: 4096, signature: expect.any(String), subtitleWritten: null },
    ]);
    expect(summary).toEqual({
      libraryId: 7,
      booksRead: 1,
      booksUnreadable: 0,
      valuesWritten: 3,
      valuesCleared: 0,
      valuesRefused: 0,
      subtitlesWritten: 0,
      subtitlesCleared: 0,
      subtitlesLocked: 0,
    });
    expect(repository.writeSubtitle).not.toHaveBeenCalled();
  });

  it('leaves a field alone when the OPF lacks its column, and clears it when the column is empty', async () => {
    const opfPath = await writeOpf('webnovel', calibreLibraryOpf('Webnovel', [{ lookup: '#collection', value: null }]));
    pending = [book(12, opfPath)];

    const [summary] = await (await makeService()).sync();

    expect(customMetadata.updateBookValues).toHaveBeenCalledWith(12, 7, [{ fieldId: 1, value: null }]);
    expect(summary).toMatchObject({ valuesWritten: 0, valuesCleared: 1 });
  });

  it('does not write a value the field type cannot hold', async () => {
    const opfPath = await writeOpf(
      'words',
      calibreLibraryOpf('Words', [
        { lookup: '#collection', value: 'Fanfic' },
        { lookup: '#words', value: 'many' },
      ]),
    );
    pending = [book(13, opfPath)];

    const [summary] = await (await makeService()).sync();

    expect(customMetadata.updateBookValues).toHaveBeenCalledWith(13, 7, [{ fieldId: 1, value: 'Fanfic' }]);
    expect(summary).toMatchObject({ valuesWritten: 1, valuesRefused: 1, booksRead: 1 });
  });

  it('writes the other values one by one when BookOrbit refuses one of them', async () => {
    const opfPath = await writeOpf(
      'both',
      calibreLibraryOpf('Both', [
        { lookup: '#collection', value: 'Fanfic' },
        { lookup: '#words', datatype: 'int', value: 5 },
      ]),
    );
    pending = [book(14, opfPath)];
    customMetadata.updateBookValues.mockImplementation((_book, _library, values) =>
      values.some((value) => value.fieldId === 3)
        ? Promise.reject(new BadRequestException('Custom metadata field 3 is not enabled for this book'))
        : Promise.resolve(),
    );

    const [summary] = await (await makeService()).sync();

    expect(customMetadata.updateBookValues).toHaveBeenCalledWith(14, 7, [{ fieldId: 1, value: 'Fanfic' }]);
    expect(summary).toMatchObject({ valuesWritten: 1, valuesRefused: 1, booksRead: 1 });
  });

  it('skips an unreadable metadata.opf without recording it, so a later scan retries it', async () => {
    pending = [book(15, join(dir, 'missing.opf'))];

    const [summary] = await (await makeService()).sync();

    expect(customMetadata.updateBookValues).not.toHaveBeenCalled();
    expect(repository.recordStates).toHaveBeenCalledWith([]);
    expect(summary).toMatchObject({ booksRead: 0, booksUnreadable: 1 });
  });

  it('only looks at a library again after a scan finishes or its field links change', async () => {
    const service = await makeService();
    await service.sync();
    expect(repository.findPendingBooks).toHaveBeenCalledTimes(1);

    await service.sync();
    expect(repository.findPendingBooks).toHaveBeenCalledTimes(1);

    scanEnd = 2000;
    await service.sync();
    expect(repository.findPendingBooks).toHaveBeenCalledTimes(2);

    fields = [...fields, { libraryId: 7, id: 4, key: 'status', type: 'text' }];
    await service.sync();
    expect(repository.findPendingBooks).toHaveBeenCalledTimes(3);
    expect(repository.findPendingBooks.mock.calls[2][1]).not.toBe(repository.findPendingBooks.mock.calls[1][1]);
  });

  it('ignores libraries without custom fields and fields switched off with -', async () => {
    fields = [{ libraryId: 7, id: 1, key: 'notes', type: 'text' }];

    const summaries = await (await makeService('notes=-')).sync();

    expect(summaries).toEqual([]);
    expect(repository.findPendingBooks).not.toHaveBeenCalled();
  });

  it('pages through a large library', async () => {
    const opfPath = await writeOpf('page', calibreLibraryOpf('Page', [{ lookup: '#collection', value: 'Fanfic' }]));
    pending = Array.from({ length: 450 }, (_, index) => book(index + 1, opfPath));
    repository.findPendingBooks.mockImplementation((_l: number, _s: string, after: number, limit: number) =>
      Promise.resolve(pending.filter((book) => book.bookId > after).slice(0, limit)),
    );

    const [summary] = await (await makeService()).sync();

    expect(repository.findPendingBooks.mock.calls.map((call) => call[2])).toEqual([0, 200, 400]);
    expect(summary).toMatchObject({ booksRead: 450, valuesWritten: 450 });
  });

  it('runs one follow-up pass for calls made while a pass is running', async () => {
    const service = await makeService();
    const first = service.sync();
    const second = service.sync();
    const third = service.sync();
    await Promise.all([first, second, third]);

    expect(repository.listActiveFieldsByLibrary).toHaveBeenCalledTimes(2);
    expect(second).toBe(third);
  });

  describe('subtitle', () => {
    it('copies the Calibre subtitle into a library without custom fields and rescores the book', async () => {
      fields = [];
      libraryIds = [7, 8];
      const opfPath = await writeOpf('sub', calibreLibraryOpf('Sub', [{ lookup: '#subtitle', value: 'A Tale of Two Cats' }]));
      pending = [book(21, opfPath, { subtitle: 'Old' })];

      const summaries = await (await makeService('', '#subtitle')).sync();

      expect(summaries.map((summary) => summary.libraryId)).toEqual([7, 8]);
      expect(repository.writeSubtitle).toHaveBeenCalledWith(21, 'Old', 'A Tale of Two Cats');
      expect(score.calculateAndSaveMany).toHaveBeenCalledWith([21]);
      expect(repository.recordStates.mock.calls[0][0]).toEqual([expect.objectContaining({ bookId: 21, subtitleWritten: 'A Tale of Two Cats' })]);
      expect(summaries[0]).toMatchObject({ subtitlesWritten: 1, subtitlesCleared: 0, valuesWritten: 0 });
    });

    it('keeps a subtitle from elsewhere when the Calibre column is empty', async () => {
      const opfPath = await writeOpf('empty', calibreLibraryOpf('Empty', [{ lookup: '#subtitle', value: null }]));
      pending = [book(22, opfPath, { subtitle: 'From a provider' })];

      const [summary] = await (await makeService('', '#subtitle')).sync();

      expect(repository.writeSubtitle).not.toHaveBeenCalled();
      expect(score.calculateAndSaveMany).not.toHaveBeenCalled();
      expect(repository.recordStates.mock.calls[0][0]).toEqual([expect.objectContaining({ bookId: 22, subtitleWritten: null })]);
      expect(summary).toMatchObject({ subtitlesWritten: 0, subtitlesCleared: 0 });
    });

    it('clears a subtitle it wrote once Calibre has none', async () => {
      const opfPath = await writeOpf('cleared', calibreLibraryOpf('Cleared', [{ lookup: '#subtitle', value: '' }]));
      pending = [book(23, opfPath, { subtitle: 'From Calibre', subtitleWritten: 'From Calibre' })];

      const [summary] = await (await makeService('', '#subtitle')).sync();

      expect(repository.writeSubtitle).toHaveBeenCalledWith(23, 'From Calibre', null);
      expect(summary).toMatchObject({ subtitlesCleared: 1 });
    });

    it('never touches a locked Subtitle field', async () => {
      lockedSubtitles = new Set([24]);
      const opfPath = await writeOpf('locked', calibreLibraryOpf('Locked', [{ lookup: '#subtitle', value: 'Calibre' }]));
      pending = [book(24, opfPath, { subtitle: 'Mine' })];

      const [summary] = await (await makeService('', '#subtitle')).sync();

      expect(repository.writeSubtitle).not.toHaveBeenCalled();
      expect(summary).toMatchObject({ subtitlesLocked: 1, subtitlesWritten: 0 });
    });

    it('owns nothing when the subtitle changed before it could be written', async () => {
      repository.writeSubtitle.mockResolvedValue(false);
      const opfPath = await writeOpf('race', calibreLibraryOpf('Race', [{ lookup: '#subtitle', value: 'Calibre' }]));
      pending = [book(25, opfPath)];

      const [summary] = await (await makeService('', '#subtitle')).sync();

      expect(repository.recordStates.mock.calls[0][0]).toEqual([expect.objectContaining({ bookId: 25, subtitleWritten: null })]);
      expect(summary).toMatchObject({ subtitlesWritten: 0 });
      expect(score.calculateAndSaveMany).not.toHaveBeenCalled();
    });

    it('reads every book again when the subtitle column is switched on', async () => {
      await (await makeService()).sync();
      await (await makeService('', '#subtitle')).sync();

      const [withoutSubtitle, withSubtitle] = repository.findPendingBooks.mock.calls.map((call) => call[1]);
      expect(withSubtitle).not.toBe(withoutSubtitle);
    });

    it('leaves subtitles and libraries without fields alone when switched off', async () => {
      fields = [];
      libraryIds = [7, 8];

      expect(await (await makeService('', null)).sync()).toEqual([]);
      expect(repository.listLibraryIds).not.toHaveBeenCalled();
    });
  });

  it('turns itself off when the state table cannot be created', async () => {
    repository.ensureStateTable.mockRejectedValue(new Error('permission denied'));

    expect(await (await makeService()).sync()).toEqual([]);
    expect(repository.listActiveFieldsByLibrary).not.toHaveBeenCalled();
  });
});
