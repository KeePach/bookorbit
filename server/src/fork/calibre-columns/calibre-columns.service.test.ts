import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { CustomMetadataService } from '../../modules/custom-metadata/custom-metadata.service';
import { calibreLibraryOpf } from './calibre-columns-test-fixtures';
import type { CalibreColumnsRepository, LibraryField, PendingBook } from './calibre-columns.repository';
import { CalibreColumnsService } from './calibre-columns.service';

describe('CalibreColumnsService', () => {
  let dir: string;
  let fields: LibraryField[];
  let pending: PendingBook[];
  let scanEnd: number;
  type RepositoryMethod = 'ensureStateTable' | 'listActiveFieldsByLibrary' | 'latestScanEndByLibrary' | 'findPendingBooks' | 'recordStates';
  let repository: { [K in RepositoryMethod]: Mock<CalibreColumnsRepository[K]> };
  let customMetadata: { updateBookValues: Mock<CustomMetadataService['updateBookValues']> };

  async function writeOpf(name: string, xml: string): Promise<string> {
    const path = join(dir, `${name}.opf`);
    await writeFile(path, xml, 'utf8');
    return path;
  }

  async function makeService(links = ''): Promise<CalibreColumnsService> {
    const service = new CalibreColumnsService(repository as unknown as CalibreColumnsRepository, customMetadata as unknown as CustomMetadataService, {
      links,
      pollSeconds: 0,
    });
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
    repository = {
      ensureStateTable: vi.fn<CalibreColumnsRepository['ensureStateTable']>().mockResolvedValue(undefined),
      listActiveFieldsByLibrary: vi.fn<CalibreColumnsRepository['listActiveFieldsByLibrary']>(() => Promise.resolve(fields)),
      latestScanEndByLibrary: vi.fn<CalibreColumnsRepository['latestScanEndByLibrary']>(() => Promise.resolve(new Map([[7, scanEnd]]))),
      findPendingBooks: vi.fn<CalibreColumnsRepository['findPendingBooks']>((_libraryId: number, _signature: string, after: number) =>
        Promise.resolve(pending.filter((book) => book.bookId > after)),
      ),
      recordStates: vi.fn<CalibreColumnsRepository['recordStates']>().mockResolvedValue(undefined),
    };
    customMetadata = { updateBookValues: vi.fn<CustomMetadataService['updateBookValues']>().mockResolvedValue(undefined) };
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
    pending = [{ bookId: 11, opfPath, opfMtime: '2026-11-15 12:02:00.123456+00', opfSize: 4096 }];

    const service = await makeService('kobo_shelf=#category');
    const [summary] = await service.sync();

    expect(customMetadata.updateBookValues).toHaveBeenCalledWith(11, 7, [
      { fieldId: 1, value: 'Fanfic.Ero' },
      { fieldId: 2, value: 'Ero, Konosuba' },
      { fieldId: 3, value: 297977 },
    ]);
    expect(repository.recordStates).toHaveBeenCalledWith([
      { bookId: 11, opfPath, opfMtime: '2026-11-15 12:02:00.123456+00', opfSize: 4096, signature: expect.any(String) },
    ]);
    expect(summary).toEqual({ libraryId: 7, booksRead: 1, booksUnreadable: 0, valuesWritten: 3, valuesCleared: 0, valuesRefused: 0 });
  });

  it('leaves a field alone when the OPF lacks its column, and clears it when the column is empty', async () => {
    const opfPath = await writeOpf('webnovel', calibreLibraryOpf('Webnovel', [{ lookup: '#collection', value: null }]));
    pending = [{ bookId: 12, opfPath, opfMtime: null, opfSize: null }];

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
    pending = [{ bookId: 13, opfPath, opfMtime: null, opfSize: null }];

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
    pending = [{ bookId: 14, opfPath, opfMtime: null, opfSize: null }];
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
    pending = [{ bookId: 15, opfPath: join(dir, 'missing.opf'), opfMtime: null, opfSize: null }];

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
    pending = Array.from({ length: 450 }, (_, index) => ({ bookId: index + 1, opfPath, opfMtime: null, opfSize: null }));
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

  it('turns itself off when the state table cannot be created', async () => {
    repository.ensureStateTable.mockRejectedValue(new Error('permission denied'));

    expect(await (await makeService()).sync()).toEqual([]);
    expect(repository.listActiveFieldsByLibrary).not.toHaveBeenCalled();
  });
});
