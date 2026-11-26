import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RequestUser } from '../../common/types/request-user';
import { KccFilePlacementService } from './kcc-file-placement.service';
import type { KccBookFile } from './kcc.repository';

describe('KccFilePlacementService', () => {
  let dir: string;
  let converted: string;
  const repo = { pathTaken: vi.fn(), moveBookFile: vi.fn() };
  const fileWriteRepo = { recordHashHistory: vi.fn(), updateFileStateAfterMetadataWrite: vi.fn() };
  const koreaderRepo = { upsertBookHashLink: vi.fn(), clearUnmatchedBooks: vi.fn() };
  const fileLocks = { withLock: vi.fn((_key: string, fn: () => Promise<unknown>) => fn()) };
  const selfWrites = { begin: vi.fn(), end: vi.fn() };
  const user = { id: 7 } as RequestUser;
  let service: KccFilePlacementService;

  const bookFile = (name: string, format: string): KccBookFile => ({
    bookId: 3,
    libraryId: 1,
    title: 'Akira',
    fileId: 11,
    absolutePath: join(dir, name),
    relPath: `Akira/${name}`,
    bookFolderPath: join(dir, name),
    format,
    fileHash: 'a'.repeat(32),
    fileWriteEnabled: true,
    excludePatterns: ['*_kcc.cbz'],
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    repo.pathTaken.mockResolvedValue(false);
    dir = await mkdtemp(join(tmpdir(), 'kcc-place-'));
    converted = join(dir, '..', `${dir.split('/').pop()}-converted.cbz`);
    await writeFile(converted, 'converted');
    service = new KccFilePlacementService(repo as never, fileWriteRepo as never, koreaderRepo as never, fileLocks as never, selfWrites as never);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(converted, { force: true });
  });

  it('replaces a CBZ in place and records the old hash', async () => {
    const file = bookFile('Akira v01.cbz', 'cbz');
    await writeFile(file.absolutePath, 'original');

    const placed = await service.replace(file, converted, 'b'.repeat(32), 'job1');

    expect(placed.absolutePath).toBe(file.absolutePath);
    expect(await readFile(file.absolutePath, 'utf-8')).toBe('converted');
    expect(fileWriteRepo.recordHashHistory).toHaveBeenCalledWith(11, 'a'.repeat(32), 'file_write');
    expect(repo.moveBookFile).not.toHaveBeenCalled();
    expect(fileWriteRepo.updateFileStateAfterMetadataWrite).toHaveBeenCalledWith(
      3,
      11,
      'a'.repeat(32),
      expect.objectContaining({ fileHash: 'b'.repeat(32) }),
    );
    expect(await readdir(dir)).toEqual(['Akira v01.cbz']);
    expect(selfWrites.end).toHaveBeenCalled();
  });

  it('turns a CBR into a CBZ of the same name and moves the row', async () => {
    const file = bookFile('Akira v01.cbr', 'cbr');
    await writeFile(file.absolutePath, 'original');

    const placed = await service.replace(file, converted, 'b'.repeat(32), 'job2');

    expect(placed.absolutePath).toBe(join(dir, 'Akira v01.cbz'));
    expect(await readdir(dir)).toEqual(['Akira v01.cbz']);
    expect(repo.moveBookFile).toHaveBeenCalledWith(file, join(dir, 'Akira v01.cbz'), 'Akira/Akira v01.cbz');
  });

  it('refuses to overwrite another file when the extension changes', async () => {
    const file = bookFile('Akira v01.cbr', 'cbr');
    await writeFile(file.absolutePath, 'original');
    await writeFile(join(dir, 'Akira v01.cbz'), 'someone else');

    await expect(service.replace(file, converted, 'b'.repeat(32), 'job3')).rejects.toMatchObject({ response: { errorCode: 'KCC_TARGET_EXISTS' } });
    expect(await readFile(file.absolutePath, 'utf-8')).toBe('original');
  });

  it('puts the original back when the database update fails', async () => {
    const file = bookFile('Akira v01.cbr', 'cbr');
    await writeFile(file.absolutePath, 'original');
    fileWriteRepo.updateFileStateAfterMetadataWrite.mockRejectedValueOnce(new Error('db down'));

    await expect(service.replace(file, converted, 'b'.repeat(32), 'job4')).rejects.toThrow('db down');
    expect(await readdir(dir)).toEqual(['Akira v01.cbr']);
    expect(await readFile(file.absolutePath, 'utf-8')).toBe('original');
  });

  it('keeps the original and links the copy for KOReader', async () => {
    const file = bookFile('Akira v01.cbr', 'cbr');
    await writeFile(file.absolutePath, 'original');

    const placed = await service.keep(user, file, converted, 'c'.repeat(32), 'job5', false);

    expect(placed.absolutePath).toBe(join(dir, 'Akira v01_kcc.cbz'));
    expect((await readdir(dir)).sort()).toEqual(['Akira v01.cbr', 'Akira v01_kcc.cbz']);
    expect(await readFile(file.absolutePath, 'utf-8')).toBe('original');
    expect(koreaderRepo.upsertBookHashLink).toHaveBeenCalledWith(7, 'c'.repeat(32), 11, { title: 'Akira', authors: null, lastOpen: null });
    expect(fileWriteRepo.recordHashHistory).not.toHaveBeenCalled();
  });

  it('does not overwrite an existing copy unless asked', async () => {
    const file = bookFile('Akira v01.cbz', 'cbz');
    await writeFile(file.absolutePath, 'original');
    await writeFile(join(dir, 'Akira v01_kcc.cbz'), 'older copy');

    await expect(service.keep(user, file, converted, 'c'.repeat(32), 'job6', false)).rejects.toMatchObject({
      response: { errorCode: 'KCC_COPY_EXISTS' },
    });
    await service.keep(user, file, converted, 'c'.repeat(32), 'job7', true);
    expect(await readFile(join(dir, 'Akira v01_kcc.cbz'), 'utf-8')).toBe('converted');
  });
});
