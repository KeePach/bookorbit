import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

import { LibraryScopeService } from '../../common/library-scope/library-scope.service';
import type { RequestUser } from '../../common/types/request-user';
import { sanitizeLogValue } from '../../common/utils/log-sanitize.utils';
import { resolveTimeZone } from '../../common/utils/timezone.utils';
import { BookService } from '../../modules/book/book.service';
import { ReadingAttemptService } from '../../modules/user-book-status/reading-attempt.service';
import { UserBookStatusService } from '../../modules/user-book-status/user-book-status.service';
import { FileUpdatesRepository, type LibrarySummary, type TrackedFile } from './file-updates.repository';

const CHECK_EVENT = 'fork.file_updates_check';
const RELEASE_EVENT = 'fork.release_links';
const DOWNLOAD_EVENT = 'fork.file_download';
const REOPEN_EVENT = 'fork.reopen_books';

export type FileUpdateStatus = 'current' | 'updated' | 'missing' | 'out_of_scope' | 'skipped';

export interface FileUpdateResult {
  bookFileId: number;
  status: FileUpdateStatus;
  bookId?: number;
  libraryId?: number;
  title?: string | null;
  fileHash?: string;
  sizeBytes?: number | null;
  /** When the stored file last changed, so a device can tell new content from a repackaged copy. */
  mtimeMs?: number | null;
  format?: string | null;
}

@Injectable()
export class FileUpdatesService {
  private readonly logger = new Logger(FileUpdatesService.name);

  constructor(
    private readonly repository: FileUpdatesRepository,
    private readonly libraryScope: LibraryScopeService,
    private readonly bookService: BookService,
    private readonly userBookStatus: UserBookStatusService,
    private readonly readingAttempts: ReadingAttemptService,
  ) {}

  async libraries(user: RequestUser): Promise<{ libraries: LibrarySummary[] }> {
    return { libraries: await this.repository.listLibraries(await this.libraryScope.visibleIdsOrAll(user)) };
  }

  /**
   * Compares the hash a device holds for each file with the file BookOrbit has now. A file in a
   * library outside `libraryIds` is reported out of scope; one the user cannot see is missing.
   */
  async check(user: RequestUser, items: { bookFileId: number; hash: string }[], libraryIds?: number[]): Promise<{ items: FileUpdateResult[] }> {
    const startedAt = Date.now();
    const files = new Map<number, TrackedFile>();
    for (const file of await this.repository.findFiles(
      [...new Set(items.map((item) => item.bookFileId))],
      await this.libraryScope.visibleIdsOrAll(user),
    )) {
      files.set(file.bookFileId, file);
    }
    const scope = libraryIds ? new Set(libraryIds) : null;

    const results = items.map((item): FileUpdateResult => {
      const file = files.get(item.bookFileId);
      if (!file || file.role !== 'content') return { bookFileId: item.bookFileId, status: 'missing' };
      const known = { bookFileId: file.bookFileId, bookId: file.bookId, libraryId: file.libraryId, title: file.title };
      if (scope && !scope.has(file.libraryId)) return { ...known, status: 'out_of_scope' };
      if (!file.fileHash || file.mediaOverlayAvailable) return { ...known, status: 'skipped' };
      if (file.fileHash.toLowerCase() === item.hash.toLowerCase()) return { ...known, status: 'current' };
      return {
        ...known,
        status: 'updated',
        fileHash: file.fileHash,
        sizeBytes: file.sizeBytes,
        mtimeMs: file.mtime?.getTime() ?? null,
        format: file.format,
      };
    });

    this.logger.log(
      `[${CHECK_EVENT}] [end] userId=${user.id} durationMs=${Date.now() - startedAt} items=${items.length} libraries=${libraryIds?.length ?? 'all'} updated=${results.filter((result) => result.status === 'updated').length} - file updates checked`,
    );
    return { items: results };
  }

  async releaseLinks(user: RequestUser, links: { hash: string; bookFileId: number }[]): Promise<{ released: number }> {
    const startedAt = Date.now();
    const released = await this.repository.deleteHashLinks(
      user.id,
      links.map((link) => ({ hash: link.hash.toLowerCase(), bookFileId: link.bookFileId })),
    );
    this.logger.log(
      `[${RELEASE_EVENT}] [end] userId=${user.id} durationMs=${Date.now() - startedAt} requested=${links.length} released=${released} - superseded hash links released`,
    );
    return { released };
  }

  /**
   * Moves books the device reopened after new chapters from read back to reading. The device's own
   * status upload can't do it on the day the book was finished: a same-day tie keeps the server
   * value, which would turn the book back to finished at the next sync. New chapters continue the
   * read that just finished, so that read is reopened instead of starting a reread, and the fic is
   * not counted as read twice. Only books that are read change.
   */
  async reopen(user: RequestUser, bookIds: number[]): Promise<{ reopened: number[] }> {
    const startedAt = Date.now();
    const visible = await this.repository.findVisibleBookIds([...new Set(bookIds)], await this.libraryScope.visibleIdsOrAll(user));
    const statuses = await this.userBookStatus.findByBookIds(user.id, visible);
    const timeZone = resolveTimeZone((user.settings as { timezone?: unknown } | undefined)?.timezone, 'UTC');
    const reopened: number[] = [];
    let continued = 0;
    for (const bookId of visible) {
      if (statuses.get(bookId)?.status !== 'read') continue;
      const latest = (await this.readingAttempts.list(user.id, bookId, 1, 1)).items[0];
      if (latest?.outcome === 'completed' && latest.endedOn) {
        await this.readingAttempts.update(user.id, bookId, latest.id, { endedOn: null, outcome: null });
        continued += 1;
      } else {
        await this.userBookStatus.updateManual(user.id, bookId, { status: 'reading' }, undefined, timeZone);
      }
      reopened.push(bookId);
    }
    this.logger.log(
      `[${REOPEN_EVENT}] [end] userId=${user.id} durationMs=${Date.now() - startedAt} requested=${bookIds.length} reopened=${reopened.length} continuedReads=${continued} - finished books reopened`,
    );
    return { reopened };
  }

  /** Streams the stored file byte for byte, so the device copy hashes the same as BookOrbit's. */
  async streamOriginal(user: RequestUser, bookFileId: number, reply: FastifyReply): Promise<void> {
    const file = await this.bookService.verifyFileAccess(bookFileId, user);
    if (file.role !== 'content') throw new NotFoundException('File not found');
    try {
      const { size } = await stat(file.absolutePath);
      reply.header('Content-Length', size);
      if (file.fileHash) reply.header('x-bookorbit-file-hash', file.fileHash);
      reply.type('application/octet-stream');
      reply.send(createReadStream(file.absolutePath));
    } catch (err) {
      this.logger.warn(
        `[${DOWNLOAD_EVENT}] [fail] userId=${user.id} bookFileId=${bookFileId} errorClass=${err instanceof Error ? err.name : 'Error'} error="${sanitizeLogValue(err instanceof Error ? err.message : String(err))}" - file not readable`,
      );
      throw new NotFoundException('File not found on disk');
    }
  }
}
