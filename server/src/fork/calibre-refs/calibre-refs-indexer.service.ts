import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';

import { mapWithConcurrency } from '../../common/utils/batch.utils';
import { sanitizeLogValue } from '../../common/utils/log-sanitize.utils';
import { parseCalibreOpfRefs } from './calibre-opf';
import { CalibreRefsRepository, type IndexableBook } from './calibre-refs.repository';

const EVENT = 'fork.calibre_refs_index';
const BATCH_SIZE = 500;
const FS_CONCURRENCY = 16;
const MAX_OPF_BYTES = 2 * 1024 * 1024;
const FULL_PASS_INTERVAL_MS = 30 * 60 * 1000;
const STARTUP_DELAY_MS = 15_000;
const CATCH_UP_MIN_GAP_MS = 15_000;
// Books touched shortly before a pass started may not have been committed when it read them.
const CATCH_UP_OVERLAP_MS = 60_000;

type BookOutcome = 'indexed' | 'unchanged' | 'removed' | 'absent' | 'failed';

export interface IndexPassResult {
  scanned: number;
  indexed: number;
  removed: number;
  failed: number;
}

/**
 * Keeps fork_book_calibre_refs in step with the metadata.opf Calibre writes next to every book. It
 * reads the files itself instead of hooking the upstream scanner, and only parses an OPF whose
 * mtime changed since it was last read.
 */
@Injectable()
export class CalibreRefsIndexerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CalibreRefsIndexerService.name);
  private running: Promise<IndexPassResult> | null = null;
  private lastFullPassStartedAt: Date | null = null;
  private lastPassStartedAt: Date | null = null;
  private lastCatchUpAtMs = 0;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly repository: CalibreRefsRepository) {}

  onApplicationBootstrap(): void {
    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      void this.runFullPass().catch(() => undefined);
    }, STARTUP_DELAY_MS);
    this.startupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
  }

  @Interval(FULL_PASS_INTERVAL_MS)
  async scheduledFullPass(): Promise<void> {
    await this.runFullPass().catch(() => undefined);
  }

  runFullPass(): Promise<IndexPassResult> {
    if (this.running) return this.running;
    return this.track(this.pass('full'));
  }

  /** Indexes books added or changed since the last pass, so a book Calibre just sent can be found right away. */
  async catchUp(): Promise<void> {
    if (this.running) {
      await this.running.catch(() => undefined);
      return;
    }
    if (!this.lastFullPassStartedAt) {
      await this.runFullPass().catch(() => undefined);
      return;
    }
    if (Date.now() - this.lastCatchUpAtMs < CATCH_UP_MIN_GAP_MS) return;
    this.lastCatchUpAtMs = Date.now();
    const since = new Date((this.lastPassStartedAt ?? this.lastFullPassStartedAt).getTime() - CATCH_UP_OVERLAP_MS);
    await this.track(this.pass('catch_up', since)).catch(() => undefined);
  }

  private track(pass: Promise<IndexPassResult>): Promise<IndexPassResult> {
    this.running = pass.finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async pass(kind: 'full' | 'catch_up', since?: Date): Promise<IndexPassResult> {
    const startedAt = new Date();
    const result: IndexPassResult = { scanned: 0, indexed: 0, removed: 0, failed: 0 };
    this.logger.log(`[${EVENT}] [start] kind=${kind} since=${since?.toISOString() ?? 'none'} - calibre ref index pass started`);
    try {
      let afterId = 0;
      for (;;) {
        const batch = await this.repository.findIndexableBooks(afterId, BATCH_SIZE, since);
        if (batch.length === 0) break;
        afterId = batch[batch.length - 1]!.id;
        await this.indexBatch(batch, result);
        if (batch.length < BATCH_SIZE) break;
      }
      this.lastPassStartedAt = startedAt;
      if (kind === 'full') this.lastFullPassStartedAt = startedAt;
      this.logger.log(
        `[${EVENT}] [end] kind=${kind} durationMs=${Date.now() - startedAt.getTime()} scanned=${result.scanned} indexed=${result.indexed} removed=${result.removed} failed=${result.failed} - calibre ref index pass completed`,
      );
      return result;
    } catch (err) {
      this.logger.error(
        `[${EVENT}] [fail] kind=${kind} durationMs=${Date.now() - startedAt.getTime()} errorClass=${err instanceof Error ? err.name : 'Error'} error="${sanitizeLogValue(err instanceof Error ? err.message : String(err))}" - calibre ref index pass failed`,
      );
      throw err;
    }
  }

  private async indexBatch(batch: IndexableBook[], result: IndexPassResult): Promise<void> {
    const known = new Map((await this.repository.findRefs(batch.map((book) => book.id))).map((ref) => [ref.bookId, ref.opfMtime.getTime()]));
    const outcomes = await mapWithConcurrency(batch, FS_CONCURRENCY, (book) => this.indexBook(book, known.get(book.id)));
    const removable: number[] = [];
    outcomes.forEach((outcome, index) => {
      result.scanned += 1;
      if (outcome === 'indexed') result.indexed += 1;
      if (outcome === 'failed') result.failed += 1;
      if (outcome === 'removed') removable.push(batch[index]!.id);
    });
    await this.repository.deleteRefs(removable);
    result.removed += removable.length;
  }

  private async indexBook(book: IndexableBook, knownMtimeMs: number | undefined): Promise<BookOutcome> {
    const opfPath = join(book.folderPath, 'metadata.opf');
    try {
      const info = await stat(opfPath).catch(() => null);
      if (!info?.isFile() || info.size > MAX_OPF_BYTES) return knownMtimeMs === undefined ? 'absent' : 'removed';
      const mtime = new Date(Math.floor(info.mtimeMs));
      if (knownMtimeMs === mtime.getTime()) return 'unchanged';
      const refs = parseCalibreOpfRefs(await readFile(opfPath, 'utf8'));
      if (!refs) return knownMtimeMs === undefined ? 'absent' : 'removed';
      await this.repository.upsertRef(book.id, refs.uuid, refs.calibreBookId, mtime);
      return 'indexed';
    } catch (err) {
      this.logger.warn(
        `[${EVENT}] [fail] bookId=${book.id} path="${sanitizeLogValue(opfPath)}" errorClass=${err instanceof Error ? err.name : 'Error'} error="${sanitizeLogValue(err instanceof Error ? err.message : String(err))}" - calibre ref read failed`,
      );
      return 'failed';
    }
  }
}
