import type { LibraryScopeService } from '../../common/library-scope/library-scope.service';
import type { RequestUser } from '../../common/types/request-user';
import type { BookService } from '../../modules/book/book.service';
import type { FileUpdatesRepository, TrackedFile } from './file-updates.repository';
import { FileUpdatesService } from './file-updates.service';

const HASH = 'a'.repeat(32);
const OTHER = 'b'.repeat(32);
const user = { id: 3 } as RequestUser;

const file = (overrides: Partial<TrackedFile>): TrackedFile => ({
  bookFileId: 1,
  bookId: 10,
  libraryId: 100,
  title: 'Fic',
  fileHash: HASH,
  sizeBytes: 1234,
  mtime: new Date('2026-11-20T10:00:00Z'),
  format: 'epub',
  role: 'content',
  mediaOverlayAvailable: false,
  ...overrides,
});

describe('FileUpdatesService.check', () => {
  const build = (files: TrackedFile[], visible: number[] | null = null) => {
    const repository = { findFiles: vi.fn(() => Promise.resolve(files)) };
    const libraryScope = { visibleIdsOrAll: vi.fn(() => Promise.resolve(visible)) };
    const service = new FileUpdatesService(
      repository as unknown as FileUpdatesRepository,
      libraryScope as unknown as LibraryScopeService,
      {} as BookService,
    );
    return { service, repository };
  };

  it('skips files with no hash yet and read-along EPUBs, which are not served as stored', async () => {
    const { service } = build([file({ bookFileId: 1, fileHash: null }), file({ bookFileId: 2, mediaOverlayAvailable: true })]);

    const { items } = await service.check(user, [
      { bookFileId: 1, hash: OTHER },
      { bookFileId: 2, hash: OTHER },
    ]);

    expect(items.map((item) => item.status)).toEqual(['skipped', 'skipped']);
  });

  it('treats a non-content file as missing', async () => {
    const { service } = build([file({ role: 'cover' })]);

    await expect(service.check(user, [{ bookFileId: 1, hash: OTHER }])).resolves.toEqual({ items: [{ bookFileId: 1, status: 'missing' }] });
  });

  it('asks the repository once for the unique file ids within the visible libraries', async () => {
    const { service, repository } = build([file({})], [100, 200]);

    await service.check(user, [
      { bookFileId: 1, hash: HASH },
      { bookFileId: 1, hash: OTHER },
    ]);

    expect(repository.findFiles).toHaveBeenCalledTimes(1);
    expect(repository.findFiles).toHaveBeenCalledWith([1], [100, 200]);
  });

  it('gives an updated file the hash, size, change time and format to download', async () => {
    const { service } = build([file({})]);

    const { items } = await service.check(user, [{ bookFileId: 1, hash: OTHER }], [100]);

    expect(items[0]).toEqual({
      bookFileId: 1,
      bookId: 10,
      libraryId: 100,
      title: 'Fic',
      status: 'updated',
      fileHash: HASH,
      sizeBytes: 1234,
      mtimeMs: Date.parse('2026-11-20T10:00:00Z'),
      format: 'epub',
    });
  });

  it('sends a null change time when the file has none recorded', async () => {
    const { service } = build([file({ mtime: null })]);

    const { items } = await service.check(user, [{ bookFileId: 1, hash: OTHER }]);

    expect(items[0]).toMatchObject({ status: 'updated', mtimeMs: null });
  });
});
