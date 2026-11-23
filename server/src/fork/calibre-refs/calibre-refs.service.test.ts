import type { LibraryScopeService } from '../../common/library-scope/library-scope.service';
import type { RequestUser } from '../../common/types/request-user';
import type { CalibreRefsIndexerService } from './calibre-refs-indexer.service';
import type { CalibreRefsRepository, UuidBookMatch } from './calibre-refs.repository';
import { CalibreRefsService } from './calibre-refs.service';

const UUID_A = '41499828-334d-467e-93ca-cc81d7ec47ba';
const UUID_B = '00000000-1111-2222-3333-444444444444';
const user = { id: 7 } as RequestUser;

describe('CalibreRefsService', () => {
  const build = (indexed: UuidBookMatch[], afterCatchUp: UuidBookMatch[] = indexed, libraryIds: number[] | null = null) => {
    let caughtUp = false;
    const repository = {
      findBooksByUuids: vi.fn((uuids: string[]) =>
        Promise.resolve((caughtUp ? afterCatchUp : indexed).filter((match) => uuids.includes(match.uuid))),
      ),
    };
    const indexer = {
      catchUp: vi.fn(() => {
        caughtUp = true;
        return Promise.resolve();
      }),
    };
    const libraryScope = { visibleIdsOrAll: vi.fn(() => Promise.resolve(libraryIds)) };
    const service = new CalibreRefsService(
      repository as unknown as CalibreRefsRepository,
      indexer as unknown as CalibreRefsIndexerService,
      libraryScope as unknown as LibraryScopeService,
    );
    return { service, repository, indexer };
  };

  it('resolves a known uuid without a catch-up pass and normalises case', async () => {
    const { service, indexer } = build([{ uuid: UUID_A, bookId: 1, bookFileId: 10 }]);

    await expect(service.resolve(user, [UUID_A.toUpperCase()])).resolves.toEqual({ matches: [{ uuid: UUID_A, bookId: 1, bookFileId: 10 }] });
    expect(indexer.catchUp).not.toHaveBeenCalled();
  });

  it('runs a catch-up pass for unknown uuids and looks only those up again', async () => {
    const { service, repository, indexer } = build(
      [{ uuid: UUID_A, bookId: 1, bookFileId: 10 }],
      [
        { uuid: UUID_A, bookId: 1, bookFileId: 10 },
        { uuid: UUID_B, bookId: 2, bookFileId: 20 },
      ],
    );

    const result = await service.resolve(user, [UUID_A, UUID_B]);

    expect(indexer.catchUp).toHaveBeenCalledTimes(1);
    expect(repository.findBooksByUuids).toHaveBeenLastCalledWith([UUID_B], null);
    expect(result.matches).toHaveLength(2);
  });

  it('leaves out a uuid that several books share', async () => {
    const { service } = build([
      { uuid: UUID_A, bookId: 1, bookFileId: 10 },
      { uuid: UUID_A, bookId: 2, bookFileId: 20 },
    ]);

    await expect(service.resolve(user, [UUID_A])).resolves.toEqual({ matches: [] });
  });

  it('passes the caller library scope to the lookup', async () => {
    const { service, repository } = build([{ uuid: UUID_A, bookId: 1, bookFileId: 10 }], undefined, [3, 4]);

    await service.resolve(user, [UUID_A]);

    expect(repository.findBooksByUuids).toHaveBeenCalledWith([UUID_A], [3, 4]);
  });
});
