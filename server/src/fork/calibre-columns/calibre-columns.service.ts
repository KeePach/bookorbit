import { readFile } from 'fs/promises';

import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { sanitizeLogValue } from '../../common/utils/log-sanitize.utils';
import { BookMetadataLockService } from '../../modules/book-metadata-lock/book-metadata-lock.service';
import { CustomMetadataService } from '../../modules/custom-metadata/custom-metadata.service';
import type { CustomMetadataValueDto } from '../../modules/custom-metadata/dto/custom-metadata-value.dto';
import { MetadataScoreService } from '../../modules/metadata-score/metadata-score.service';
import { linksSignature, parseLinkOverrides, resolveLinks, type LinkedField } from './calibre-column-links';
import { convertColumnValue } from './calibre-column-value';
import { calibreColumnsConfig } from './calibre-columns.config';
import { CalibreColumnsRepository, type BookState, type PendingBook } from './calibre-columns.repository';
import { parseCalibreColumns } from './calibre-opf-columns';
import { decideSubtitle } from './calibre-subtitle';

const BATCH_SIZE = 200;
const READ_CONCURRENCY = 8;
const INITIAL_DELAY_MS = 10_000;

export interface LibrarySyncSummary {
  libraryId: number;
  booksRead: number;
  booksUnreadable: number;
  valuesWritten: number;
  valuesCleared: number;
  valuesRefused: number;
  subtitlesWritten: number;
  subtitlesCleared: number;
  subtitlesLocked: number;
}

type BookOutcome = {
  state: BookState | null;
  written: number;
  cleared: number;
  refused: number;
  subtitle: 'written' | 'cleared' | 'locked' | null;
};

/**
 * Copies Calibre custom columns from each book's `metadata.opf` into the BookOrbit custom field
 * linked to it (field key `collection` <-> `#collection`, or an override from
 * `FORK_CALIBRE_COLUMN_LINKS`), and the subtitle column (`#subtitle`, or
 * `FORK_CALIBRE_SUBTITLE_COLUMN`) into BookOrbit's own Subtitle field. Calibre is the source: a book
 * is read again whenever the scanner records a change to its `metadata.opf`, or its library's field
 * links change.
 */
@Injectable()
export class CalibreColumnsService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CalibreColumnsService.name);
  private readonly overrides: Map<string, string>;
  private readonly lastScanEnd = new Map<number, number>();
  private readonly lastSignature = new Map<number, string>();
  private current: Promise<LibrarySyncSummary[]> | null = null;
  private queued: Promise<LibrarySyncSummary[]> | null = null;
  private interval: NodeJS.Timeout | null = null;
  private initialTimer: NodeJS.Timeout | null = null;
  private tableReady = false;

  constructor(
    private readonly repository: CalibreColumnsRepository,
    private readonly customMetadata: CustomMetadataService,
    private readonly metadataLocks: BookMetadataLockService,
    private readonly metadataScore: MetadataScoreService,
    @Inject(calibreColumnsConfig.KEY) private readonly config: ConfigType<typeof calibreColumnsConfig>,
  ) {
    const parsed = parseLinkOverrides(config.links);
    this.overrides = parsed.byFieldKey;
    for (const entry of parsed.invalid) {
      this.logger.warn(`[fork.calibre_columns.config] [fail] entry="${sanitizeLogValue(entry)}" - ignored link, expected field_key=#column`);
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.repository.ensureStateTable();
      this.tableReady = true;
    } catch (error) {
      this.logger.warn(
        `[fork.calibre_columns.init] [fail] errorClass=${error instanceof Error ? error.name : 'Error'} error="${sanitizeLogValue(error instanceof Error ? error.message : String(error))}" - state table unavailable, sync disabled`,
      );
    }
  }

  onApplicationBootstrap(): void {
    if (!this.tableReady || this.config.pollSeconds <= 0) return;
    const tick = () => {
      this.sync().catch(() => undefined);
    };
    this.initialTimer = setTimeout(tick, INITIAL_DELAY_MS);
    this.initialTimer.unref();
    this.interval = setInterval(tick, this.config.pollSeconds * 1000);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.interval) clearInterval(this.interval);
  }

  /**
   * Runs one pass over every library that has custom fields. Calls made while a pass runs share
   * one follow-up pass, so a change seen mid-pass is never missed and passes never overlap.
   */
  sync(): Promise<LibrarySyncSummary[]> {
    if (!this.tableReady) return Promise.resolve([]);
    if (!this.current) {
      this.current = this.runPass().finally(() => {
        this.current = null;
      });
      return this.current;
    }
    if (!this.queued) {
      this.queued = this.current
        .catch(() => undefined)
        .then(() => {
          this.queued = null;
          return this.sync();
        });
    }
    return this.queued;
  }

  private async runPass(): Promise<LibrarySyncSummary[]> {
    const fields = await this.repository.listActiveFieldsByLibrary();
    const linksByLibrary = new Map<number, LinkedField[]>();
    for (const libraryId of new Set(fields.map((field) => field.libraryId))) {
      const links = resolveLinks(
        fields.filter((field) => field.libraryId === libraryId),
        this.overrides,
      );
      if (links.length > 0) linksByLibrary.set(libraryId, links);
    }
    // Subtitles are copied in every library, linked custom fields or not; a library without
    // Calibre's metadata.opf files simply has no books to read.
    if (this.config.subtitleColumn) {
      for (const libraryId of await this.repository.listLibraryIds()) {
        if (!linksByLibrary.has(libraryId)) linksByLibrary.set(libraryId, []);
      }
    }
    for (const libraryId of [...this.lastSignature.keys()]) {
      if (!linksByLibrary.has(libraryId)) {
        this.lastSignature.delete(libraryId);
        this.lastScanEnd.delete(libraryId);
      }
    }

    const scanEnds = await this.repository.latestScanEndByLibrary([...linksByLibrary.keys()]);
    const summaries: LibrarySyncSummary[] = [];
    for (const [libraryId, links] of linksByLibrary) {
      const signature = linksSignature(links, this.config.subtitleColumn);
      const scanEnd = scanEnds.get(libraryId) ?? 0;
      const reason =
        this.lastSignature.get(libraryId) === undefined
          ? 'startup'
          : this.lastSignature.get(libraryId) !== signature
            ? 'links_changed'
            : scanEnd > (this.lastScanEnd.get(libraryId) ?? 0)
              ? 'scan_finished'
              : null;
      if (!reason) continue;
      try {
        summaries.push(await this.syncLibrary(libraryId, links, signature, reason));
        this.lastSignature.set(libraryId, signature);
        this.lastScanEnd.set(libraryId, scanEnd);
      } catch {
        // Logged by syncLibrary; the next pass retries this library.
      }
    }
    return summaries;
  }

  private async syncLibrary(libraryId: number, links: LinkedField[], signature: string, reason: string): Promise<LibrarySyncSummary> {
    const event = 'fork.calibre_columns.sync_library';
    const startedAt = Date.now();
    const summary: LibrarySyncSummary = {
      libraryId,
      booksRead: 0,
      booksUnreadable: 0,
      valuesWritten: 0,
      valuesCleared: 0,
      valuesRefused: 0,
      subtitlesWritten: 0,
      subtitlesCleared: 0,
      subtitlesLocked: 0,
    };
    const refusedByColumn = new Map<string, { count: number; reason: string }>();
    try {
      let cursor = 0;
      for (;;) {
        const pending = await this.repository.findPendingBooks(libraryId, signature, cursor, BATCH_SIZE);
        if (pending.length === 0) break;
        cursor = pending[pending.length - 1].bookId;
        if (summary.booksRead === 0 && summary.booksUnreadable === 0) {
          this.logger.log(
            `[${event}] [start] libraryId=${libraryId} links=${links.length} subtitleColumn=${this.config.subtitleColumn ?? '-'} reason=${reason} - reading Calibre columns`,
          );
        }

        const subtitleLocked = this.config.subtitleColumn
          ? await this.metadataLocks.getBookIdsWithLockedField(
              pending.map((book) => book.bookId),
              'subtitle',
            )
          : new Set<number>();
        const states: BookState[] = [];
        const subtitleChanged: number[] = [];
        for (let i = 0; i < pending.length; i += READ_CONCURRENCY) {
          const outcomes = await Promise.all(
            pending
              .slice(i, i + READ_CONCURRENCY)
              .map((book) => this.syncBook(libraryId, book, links, signature, subtitleLocked.has(book.bookId), refusedByColumn)),
          );
          for (const outcome of outcomes) {
            if (outcome.state) {
              states.push(outcome.state);
              summary.booksRead++;
            } else {
              summary.booksUnreadable++;
            }
            summary.valuesWritten += outcome.written;
            summary.valuesCleared += outcome.cleared;
            summary.valuesRefused += outcome.refused;
            if (outcome.subtitle === 'written') summary.subtitlesWritten++;
            if (outcome.subtitle === 'cleared') summary.subtitlesCleared++;
            if (outcome.subtitle === 'locked') summary.subtitlesLocked++;
            if ((outcome.subtitle === 'written' || outcome.subtitle === 'cleared') && outcome.state) subtitleChanged.push(outcome.state.bookId);
          }
        }
        await this.repository.recordStates(states);
        if (subtitleChanged.length > 0) await this.rescore(subtitleChanged);
        if (pending.length < BATCH_SIZE) break;
      }

      for (const [column, refused] of refusedByColumn) {
        this.logger.warn(
          `[${event}] [fail] libraryId=${libraryId} column="${sanitizeLogValue(column)}" books=${refused.count} reason=${refused.reason} - values the linked field type cannot hold were left unchanged`,
        );
      }
      if (summary.booksRead > 0 || summary.booksUnreadable > 0) {
        this.logger.log(
          `[${event}] [end] libraryId=${libraryId} durationMs=${Date.now() - startedAt} booksRead=${summary.booksRead} booksUnreadable=${summary.booksUnreadable} valuesWritten=${summary.valuesWritten} valuesCleared=${summary.valuesCleared} valuesRefused=${summary.valuesRefused} subtitlesWritten=${summary.subtitlesWritten} subtitlesCleared=${summary.subtitlesCleared} subtitlesLocked=${summary.subtitlesLocked} - Calibre columns synced`,
        );
      }
      return summary;
    } catch (error) {
      this.logger.warn(
        `[${event}] [fail] libraryId=${libraryId} durationMs=${Date.now() - startedAt} errorClass=${error instanceof Error ? error.name : 'Error'} error="${sanitizeLogValue(error instanceof Error ? error.message : String(error))}" - Calibre column sync failed`,
      );
      throw error;
    }
  }

  private async syncBook(
    libraryId: number,
    book: PendingBook,
    links: LinkedField[],
    signature: string,
    subtitleLocked: boolean,
    refusedByColumn: Map<string, { count: number; reason: string }>,
  ): Promise<BookOutcome> {
    const outcome: BookOutcome = { state: null, written: 0, cleared: 0, refused: 0, subtitle: null };
    let xml: string;
    try {
      xml = await readFile(book.opfPath, 'utf8');
    } catch (error) {
      this.logger.warn(
        `[fork.calibre_columns.read_opf] [fail] bookId=${book.bookId} path="${sanitizeLogValue(book.opfPath)}" errorClass=${error instanceof Error ? error.name : 'Error'} error="${sanitizeLogValue(error instanceof Error ? error.message : String(error))}" - metadata.opf unreadable, retried after the next scan`,
      );
      return outcome;
    }

    const columns = parseCalibreColumns(xml);
    const values: CustomMetadataValueDto[] = [];
    for (const link of links) {
      const column = columns.get(link.column);
      // A library without this column (or an OPF Calibre wrote before it existed) leaves the field alone.
      if (!column) continue;
      const converted = convertColumnValue(column, link.fieldType);
      if (!converted.ok) {
        outcome.refused++;
        const seen = refusedByColumn.get(link.column);
        refusedByColumn.set(link.column, { count: (seen?.count ?? 0) + 1, reason: converted.reason });
        continue;
      }
      values.push({ fieldId: link.fieldId, value: converted.value });
    }

    if (values.length > 0) await this.writeValues(book.bookId, libraryId, values, outcome);
    const subtitleWritten = this.config.subtitleColumn
      ? await this.syncSubtitle(book, columns.get(this.config.subtitleColumn), subtitleLocked, outcome)
      : null;
    outcome.state = { bookId: book.bookId, opfPath: book.opfPath, opfMtime: book.opfMtime, opfSize: book.opfSize, signature, subtitleWritten };
    return outcome;
  }

  /** Copies Calibre's subtitle into the book's Subtitle field; resolves the subtitle the sync now owns. */
  private async syncSubtitle(
    book: PendingBook,
    column: Parameters<typeof decideSubtitle>[0]['column'],
    locked: boolean,
    outcome: BookOutcome,
  ): Promise<string | null> {
    const decision = decideSubtitle({ column, current: book.subtitle, previouslyWritten: book.subtitleWritten, locked });
    if (locked && column) outcome.subtitle = 'locked';
    if (decision.action === 'keep') return decision.written;
    try {
      if (!(await this.repository.writeSubtitle(book.bookId, book.subtitle, decision.value))) {
        // Changed in the moment since the book was picked (an edit, a scan): that change wins, and
        // the book is read again when its metadata.opf next changes.
        return null;
      }
      outcome.subtitle = decision.value === null ? 'cleared' : 'written';
      return decision.written;
    } catch (error) {
      this.logger.warn(
        `[fork.calibre_columns.write_subtitle] [fail] bookId=${book.bookId} errorClass=${error instanceof Error ? error.name : 'Error'} error="${sanitizeLogValue(error instanceof Error ? error.message : String(error))}" - subtitle not written`,
      );
      return null;
    }
  }

  /** The metadata score counts the subtitle, so it is worked out again like after a file read. */
  private async rescore(bookIds: number[]): Promise<void> {
    try {
      await this.metadataScore.calculateAndSaveMany(bookIds);
    } catch (error) {
      this.logger.warn(
        `[fork.calibre_columns.rescore] [fail] books=${bookIds.length} errorClass=${error instanceof Error ? error.name : 'Error'} error="${sanitizeLogValue(error instanceof Error ? error.message : String(error))}" - metadata score not updated`,
      );
    }
  }

  private async writeValues(bookId: number, libraryId: number, values: CustomMetadataValueDto[], outcome: BookOutcome): Promise<void> {
    const count = (written: CustomMetadataValueDto[]) => {
      for (const value of written) {
        if (value.value === null) outcome.cleared++;
        else outcome.written++;
      }
    };
    try {
      await this.customMetadata.updateBookValues(bookId, libraryId, values);
      count(values);
      return;
    } catch {
      // One value BookOrbit refuses (a field switched off for the library mid-pass, say) must not
      // cost the others, so they are written one at a time.
    }
    for (const value of values) {
      try {
        await this.customMetadata.updateBookValues(bookId, libraryId, [value]);
        count([value]);
      } catch (error) {
        outcome.refused++;
        this.logger.warn(
          `[fork.calibre_columns.write_value] [fail] bookId=${bookId} fieldId=${value.fieldId} errorClass=${error instanceof Error ? error.name : 'Error'} error="${sanitizeLogValue(error instanceof Error ? error.message : String(error))}" - custom field value not written`,
        );
      }
    }
  }
}
