import { mkdtemp, mkdir, rm, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { CalibreRefsIndexerService } from './calibre-refs-indexer.service';
import type { CalibreRefsRepository, CalibreRefRow, IndexableBook } from './calibre-refs.repository';

const UUID_A = '41499828-334d-467e-93ca-cc81d7ec47ba';
const UUID_B = '00000000-1111-2222-3333-444444444444';
const opf = (uuid: string) => `<dc:identifier opf:scheme="calibre">12</dc:identifier><dc:identifier opf:scheme="uuid">${uuid}</dc:identifier>`;

describe('CalibreRefsIndexerService', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'fork-calibre-refs-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const bookDir = async (name: string, content?: string) => {
    const dir = join(root, name);
    await mkdir(dir, { recursive: true });
    if (content !== undefined) await writeFile(join(dir, 'metadata.opf'), content);
    return dir;
  };

  const build = (books: IndexableBook[], refs: CalibreRefRow[] = []) => {
    const repository = {
      findIndexableBooks: vi.fn((afterId: number, limit: number) => Promise.resolve(books.filter((book) => book.id > afterId).slice(0, limit))),
      findRefs: vi.fn((ids: number[]) => Promise.resolve(refs.filter((ref) => ids.includes(ref.bookId)))),
      upsertRef: vi.fn(() => Promise.resolve()),
      deleteRefs: vi.fn(() => Promise.resolve()),
    };
    return { service: new CalibreRefsIndexerService(repository as unknown as CalibreRefsRepository), repository };
  };

  it('indexes books whose metadata.opf carries a Calibre uuid and skips folders without one', async () => {
    const withOpf = await bookDir('A (12)', opf(UUID_A));
    const withoutOpf = await bookDir('B');
    const { service, repository } = build([
      { id: 1, folderPath: withOpf },
      { id: 2, folderPath: withoutOpf },
    ]);

    const result = await service.runFullPass();

    expect(result).toEqual({ scanned: 2, indexed: 1, removed: 0, failed: 0 });
    expect(repository.upsertRef).toHaveBeenCalledWith(1, UUID_A, 12, expect.any(Date));
    expect(repository.deleteRefs).toHaveBeenCalledWith([]);
  });

  it('does not re-read an unchanged metadata.opf', async () => {
    const dir = await bookDir('A', opf(UUID_A));
    const mtime = new Date('2026-01-02T03:04:05Z');
    await utimes(join(dir, 'metadata.opf'), mtime, mtime);
    const { service, repository } = build([{ id: 1, folderPath: dir }], [{ bookId: 1, opfMtime: mtime }]);

    const result = await service.runFullPass();

    expect(result.indexed).toBe(0);
    expect(repository.upsertRef).not.toHaveBeenCalled();
  });

  it('re-reads a changed metadata.opf and drops refs whose file disappeared', async () => {
    const changed = await bookDir('A', opf(UUID_B));
    const gone = await bookDir('B');
    const { service, repository } = build(
      [
        { id: 1, folderPath: changed },
        { id: 2, folderPath: gone },
      ],
      [
        { bookId: 1, opfMtime: new Date('2020-01-01T00:00:00Z') },
        { bookId: 2, opfMtime: new Date('2020-01-01T00:00:00Z') },
      ],
    );

    const result = await service.runFullPass();

    expect(repository.upsertRef).toHaveBeenCalledWith(1, UUID_B, 12, expect.any(Date));
    expect(repository.deleteRefs).toHaveBeenCalledWith([2]);
    expect(result).toEqual({ scanned: 2, indexed: 1, removed: 1, failed: 0 });
  });

  it('walks every page of books', async () => {
    const dir = await bookDir('A', opf(UUID_A));
    const books = Array.from({ length: 501 }, (_, index) => ({ id: index + 1, folderPath: dir }));
    const { service, repository } = build(books);

    const result = await service.runFullPass();

    expect(result.scanned).toBe(501);
    expect(repository.findIndexableBooks).toHaveBeenNthCalledWith(2, 500, 500, undefined);
  });

  it('runs a full pass on the first catch-up, then only books changed since the last pass', async () => {
    const { service, repository } = build([]);

    await service.catchUp();
    expect(repository.findIndexableBooks).toHaveBeenLastCalledWith(0, 500, undefined);

    await service.catchUp();
    expect(repository.findIndexableBooks).toHaveBeenLastCalledWith(0, 500, expect.any(Date));
  });

  it('shares one pass between concurrent callers', async () => {
    const { service, repository } = build([]);

    await Promise.all([service.runFullPass(), service.runFullPass(), service.catchUp()]);

    expect(repository.findIndexableBooks).toHaveBeenCalledTimes(1);
  });
});
