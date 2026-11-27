import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RequestUser } from '../../common/types/request-user';
import { readComicInfoFromZip } from '../../modules/file-write/formats/cbx/cbz-zip-patcher';
import { writeZipArchive } from '../../modules/file-write/formats/shared/zip-rewrite';
import { KccConvertService } from './kcc-convert.service';
import type { KccBookFile } from './kcc.repository';

async function makeCbz(path: string, names: string[]): Promise<void> {
  await writeZipArchive(
    path,
    names.map((name) => ({ name, source: Buffer.from(name) })),
  );
}

describe('KccConvertService', () => {
  let root: string;
  let library: string;
  let workDir: string;
  let file: KccBookFile;
  const user = { id: 5 } as RequestUser;
  const repo = { findBookFile: vi.fn(), findPreset: vi.fn() };
  const client = { schema: vi.fn(), startJob: vi.fn(), getJob: vi.fn() };
  const placement = { replace: vi.fn(), keep: vi.fn() };
  const bookService = { verifyBookAccess: vi.fn(), resolveSelectionToIds: vi.fn((dto: { bookIds: number[] }) => Promise.resolve(dto.bookIds)) };
  const fileWriteRepo = { loadPayload: vi.fn() };
  const fileRename = { performRename: vi.fn() };
  let service: KccConvertService;
  let placedContent: { comicInfo: string | null } | null;

  beforeEach(async () => {
    vi.clearAllMocks();
    root = await mkdtemp(join(tmpdir(), 'kcc-convert-'));
    library = join(root, 'library');
    workDir = join(root, 'work');
    await mkdir(library);
    await mkdir(workDir);
    file = {
      bookId: 9,
      libraryId: 1,
      title: 'Saga 1',
      fileId: 90,
      absolutePath: join(library, 'Saga #01.cbr'),
      relPath: 'Saga #01.cbr',
      bookFolderPath: join(library, 'Saga #01.cbr'),
      format: 'cbr',
      fileHash: 'a'.repeat(32),
      fileWriteEnabled: true,
      excludePatterns: ['*_kcc.cbz'],
    };
    await makeCbz(file.absolutePath, ['001.jpg', '002.jpg']);
    repo.findBookFile.mockImplementation(() => Promise.resolve(file));
    repo.findPreset.mockResolvedValue({ id: 1, options: { profile: 'KoLC', righttoleft: true } });
    client.schema.mockResolvedValue({
      version: '13.0.4',
      profiles: [],
      groups: [
        {
          title: 'MAIN',
          options: [
            { dest: 'profile', flags: ['-p', '--profile'], kind: 'str', default: 'KV', help: '' },
            { dest: 'righttoleft', flags: ['-m', '--manga-style'], kind: 'bool', default: false, help: '' },
          ],
        },
      ],
    });
    // Stands in for the KCC container: writes a CBZ whose spread became two pages.
    client.startJob.mockImplementation(async (_input: string, outputDir: string) => {
      await makeCbz(join(workDir, outputDir, 'book.cbz'), ['kcc-0001-kcc-x.jpg', 'kcc-0002-kcc-b.jpg', 'kcc-0002-kcc-c.jpg']);
      return 'remote-1';
    });
    client.getJob.mockResolvedValue({ state: 'done', outputs: [], log: '', exitCode: 0 });
    fileRename.performRename.mockResolvedValue({ status: 'success', newPath: join(library, 'Saga', 'Saga 001.cbz'), durationMs: 1 });
    fileWriteRepo.loadPayload.mockResolvedValue({ title: 'Saga 1', seriesName: 'Saga', pageCount: 2, description: 'Space opera' });
    placedContent = null;
    const capture = async (_file: KccBookFile, converted: string, hash: string) => {
      placedContent = { comicInfo: await readComicInfoFromZip(converted) };
      await copyFile(converted, join(library, 'placed.cbz'));
      return { absolutePath: join(library, 'Saga #01.cbz'), fileHash: hash };
    };
    placement.replace.mockImplementation(capture);
    placement.keep.mockImplementation((_user: RequestUser, ...rest: [KccBookFile, string, string]) => capture(...rest));
    service = new KccConvertService(
      repo as never,
      client as never,
      placement as never,
      bookService as never,
      fileWriteRepo as never,
      fileRename as never,
      {
        url: 'http://kcc:8090',
        workDir,
        timeoutSeconds: 60,
      },
    );
    service.pollIntervalMs = 1;
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function finish(): Promise<void> {
    await (service as unknown as { queue: Promise<void> }).queue;
  }

  it('converts, writes BookOrbit metadata with the new page count and replaces the file', async () => {
    client.getJob.mockImplementation(async () => {
      const [out] = await readdir(join(workDir, (await readdir(workDir))[0], 'out'));
      const jobDir = (await readdir(workDir))[0];
      return { state: 'done', outputs: [`${jobDir}/out/${out}`], log: '', exitCode: 0 };
    });

    const job = await service.start(user, 9, { mode: 'replace', presetId: 1 });
    await finish();

    expect(client.startJob).toHaveBeenCalledWith(expect.stringMatching(/\/in\/book\.cbr$/), expect.stringMatching(/\/out$/), [
      '--profile',
      'KoLC',
      '--manga-style',
      '--format',
      'CBZ',
      '--batchsplit',
      '0',
      '--tempdir',
    ]);
    expect(placedContent?.comicInfo).toContain('<PageCount>3</PageCount>');
    expect(placedContent?.comicInfo).toContain('<Summary>Space opera</Summary>');
    expect(placement.replace).toHaveBeenCalledWith(file, expect.any(String), expect.stringMatching(/^[0-9a-f]{32}$/), job.id);
    expect(fileRename.performRename).toHaveBeenCalledWith(9, user.id, true, true);
    expect(service.getJob(user, job.id)).toMatchObject({ title: 'Saga 1', state: 'done', outputName: 'Saga 001.cbz', error: null, warning: null });
    const listed = service.listJobs(user);
    expect(listed.jobs.map((entry) => entry.state)).toEqual(['done']);
    expect(service.listJobs(user, new Date(Date.parse(listed.serverTime) + 2000)).jobs).toEqual([]);
    expect(service.listJobs(user, new Date(Date.parse(job.createdAt) - 1)).jobs).toHaveLength(1);
    expect(await readdir(workDir)).toEqual([]);
  });

  it('renames only on Replace, and a rename problem leaves a warning, not a failed conversion', async () => {
    client.getJob.mockImplementation(async () => {
      const jobDir = (await readdir(workDir))[0];
      const [out] = await readdir(join(workDir, jobDir, 'out'));
      return { state: 'done', outputs: [`${jobDir}/out/${out}`], log: '', exitCode: 0 };
    });
    fileRename.performRename.mockResolvedValueOnce({ status: 'skipped', reason: 'no pattern', durationMs: 1 });

    const replaced = await service.start(user, 9, { mode: 'replace' });
    await finish();
    expect(service.getJob(user, replaced.id)).toMatchObject({
      state: 'done',
      outputName: 'Saga #01.cbz',
      warning: 'Converted, but not renamed: no pattern',
    });

    fileRename.performRename.mockClear();
    const kept = await service.start(user, 9, { mode: 'keep', force: true });
    await finish();
    expect(service.getJob(user, kept.id)).toMatchObject({ state: 'done', warning: null });
    expect(fileRename.performRename).not.toHaveBeenCalled();
  });

  it('reports a KCC failure on the job', async () => {
    client.getJob.mockResolvedValue({ state: 'failed', outputs: [], log: 'line 1\nOSError: Failed to extract archive.', exitCode: 1 });

    const job = await service.start(user, 9, { mode: 'keep' });
    await finish();

    expect(service.getJob(user, job.id)).toMatchObject({ state: 'failed', error: expect.stringContaining('Failed to extract archive') });
    expect(placement.keep).not.toHaveBeenCalled();
  });

  it('blocks Replace in a library that leaves files untouched, and Keep without the skip pattern', async () => {
    file = { ...file, fileWriteEnabled: false, excludePatterns: [] };
    await expect(service.start(user, 9, { mode: 'replace' })).rejects.toMatchObject({ response: { errorCode: 'KCC_REPLACE_BLOCKED' } });
    await expect(service.start(user, 9, { mode: 'keep' })).rejects.toMatchObject({ response: { errorCode: 'KCC_KEEP_BLOCKED' } });
  });

  it('warns before converting a CBZ KCC already made, unless forced', async () => {
    file = { ...file, absolutePath: join(library, 'Done.cbz'), format: 'cbz' };
    await makeCbz(file.absolutePath, ['kcc-0001-kcc-x.jpg', 'kcc-0002-kcc-x.jpg']);

    expect((await service.check(user, 9)).alreadyConverted).toBe(true);
    await expect(service.start(user, 9, { mode: 'replace' })).rejects.toMatchObject({ response: { errorCode: 'KCC_ALREADY_CONVERTED' } });
    await expect(service.start(user, 9, { mode: 'replace', force: true })).resolves.toMatchObject({ state: 'queued' });
    await finish();
  });

  it('queues a batch and skips the books it can not convert, with the reason', async () => {
    const epub = { ...file, bookId: 10, title: 'A novel', absolutePath: join(library, 'Novel.epub'), format: 'epub' };
    repo.findBookFile.mockImplementation((bookId: number) => Promise.resolve(bookId === 10 ? epub : file));

    const result = await service.startMany(user, { bookIds: [9, 10, 9] }, { mode: 'keep', presetId: 1 });
    await finish();

    expect(result.jobs.map((job) => job.bookId)).toEqual([9]);
    expect(result.skipped).toEqual([{ bookId: 10, title: 'A novel', reason: expect.stringMatching(/CBZ, CBR, CB7 and PDF only/) }]);
    expect(bookService.resolveSelectionToIds).toHaveBeenCalledWith({ bookIds: [9, 10, 9] }, user, 'editor');
  });

  it('only offers comic formats', async () => {
    file = { ...file, absolutePath: join(library, 'Novel.epub'), format: 'epub' };
    const check = await service.check(user, 9);
    expect(check.canReplace).toBe(false);
    expect(check.canKeep).toBe(false);
    expect(check.replaceBlockedReason).toMatch(/CBZ, CBR, CB7 and PDF only/);
  });

  it('does not show another user their conversions', async () => {
    const job = await service.start(user, 9, { mode: 'keep' });
    expect(() => service.getJob({ id: 6 } as RequestUser, job.id)).toThrow('Conversion not found');
    expect(service.listJobs({ id: 6 } as RequestUser).jobs).toEqual([]);
    expect(service.listJobs(user).jobs.map((listed) => listed.id)).toEqual([job.id]);
    await finish();
  });
});
