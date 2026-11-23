import { Injectable, Logger } from '@nestjs/common';

import { LibraryScopeService } from '../../common/library-scope/library-scope.service';
import type { RequestUser } from '../../common/types/request-user';
import { CalibreRefsIndexerService } from './calibre-refs-indexer.service';
import { CalibreRefsRepository, type UuidBookMatch } from './calibre-refs.repository';

const EVENT = 'fork.calibre_resolve';

export interface CalibreResolveResult {
  matches: UuidBookMatch[];
}

@Injectable()
export class CalibreRefsService {
  private readonly logger = new Logger(CalibreRefsService.name);

  constructor(
    private readonly repository: CalibreRefsRepository,
    private readonly indexer: CalibreRefsIndexerService,
    private readonly libraryScope: LibraryScopeService,
  ) {}

  /** Maps each Calibre uuid to the one visible book carrying it. A uuid shared by several books is left out. */
  async resolve(user: RequestUser, uuids: string[]): Promise<CalibreResolveResult> {
    const startedAt = Date.now();
    const wanted = [...new Set(uuids.map((uuid) => uuid.toLowerCase()))];
    const libraryIds = await this.libraryScope.visibleIdsOrAll(user);

    let found = await this.repository.findBooksByUuids(wanted, libraryIds);
    const missing = wanted.filter((uuid) => !found.some((match) => match.uuid === uuid));
    let caughtUp = false;
    if (missing.length > 0) {
      await this.indexer.catchUp();
      caughtUp = true;
      found = [...found, ...(await this.repository.findBooksByUuids(missing, libraryIds))];
    }

    const byUuid = new Map<string, UuidBookMatch[]>();
    for (const match of found) byUuid.set(match.uuid, [...(byUuid.get(match.uuid) ?? []), match]);
    const matches = [...byUuid.values()].flatMap((list) => (list.length === 1 ? list : []));

    this.logger.log(
      `[${EVENT}] [end] userId=${user.id} durationMs=${Date.now() - startedAt} requested=${wanted.length} matched=${matches.length} ambiguous=${byUuid.size - matches.length} caughtUp=${caughtUp} - calibre uuids resolved`,
    );
    return { matches };
  }
}
