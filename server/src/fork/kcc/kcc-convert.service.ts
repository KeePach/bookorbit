import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';

import {
  CBX_BOOK_FILE_WRITE_FIELDS,
  type KccBatchConvertResult,
  type KccBatchSkip,
  type KccConvertCheck,
  type KccConvertJob,
  type KccConvertRequest,
  type KccJobList,
  type KccOptionValues,
} from '@bookorbit/types';

import type { BulkSelectionDto } from '../../common/dto/bulk-selection.dto';
import { buildNameExcludeMatcher } from '../../common/fs-walk.utils';
import type { RequestUser } from '../../common/types/request-user';
import { computeFileHash } from '../../common/utils/file-hash.utils';
import { sanitizeLogValue } from '../../common/utils/log-sanitize.utils';
import { BookService } from '../../modules/book/book.service';
import { FileRenameService } from '../../modules/file-write/file-rename.service';
import { FileWriteRepository } from '../../modules/file-write/file-write.repository';
import { buildComicInfoXml } from '../../modules/file-write/formats/cbx/comic-info-builder';
import { writeComicInfoToZip } from '../../modules/file-write/formats/cbx/cbz-zip-patcher';
import type { BookWritePayloadKey } from '../../modules/file-write/interfaces/book-write-payload.interface';
import { buildKccArgs, validateOptionValues } from './kcc-args';
import { KccClientService } from './kcc-client.service';
import { countZipImages, keepCopyName, looksConvertedByKcc, readZipEntryPaths } from './kcc-detect';
import { KccFilePlacementService } from './kcc-file-placement.service';
import { kccConfig } from './kcc.config';
import { type KccBookFile, KccRepository } from './kcc.repository';

/**
 * Replace rewrites and renames the book's file, so the library must allow both. Names the settings
 * to turn on, as Settings > Libraries labels them.
 */
export function replaceNotAllowedReason(file: Pick<KccBookFile, 'fileWriteEnabled' | 'fileRenameEnabled'>): string | null {
  const missing = [file.fileWriteEnabled ? null : 'Write to file', file.fileRenameEnabled ? null : 'Rename files'].filter(Boolean);
  if (missing.length === 0) return null;
  return `Replace isn't allowed in this library. Turn on ${missing.join(' and ')} for it in Settings > Libraries.`;
}

/** Formats KCC reads (with bsdtar/7z in its container) and BookOrbit offers to convert. */
export const KCC_SOURCE_FORMATS = new Set(['cbz', 'cbr', 'cb7', 'pdf']);
const FINISHED_JOB_TTL_MS = 6 * 3600_000;
export const MAX_BATCH_BOOKS = 3000;
const COMIC_INFO_FIELDS = new Set<BookWritePayloadKey>(CBX_BOOK_FILE_WRITE_FIELDS as readonly BookWritePayloadKey[]);

interface JobRecord extends KccConvertJob {
  userId: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Converts a book's file with KCC, writes BookOrbit's metadata into the result and puts it in place. */
@Injectable()
export class KccConvertService {
  private readonly logger = new Logger(KccConvertService.name);
  private readonly jobs = new Map<string, JobRecord>();
  /** New on every start: conversions live in memory, so a restart forgets them all. */
  private readonly bootId = randomUUID();
  private queue: Promise<void> = Promise.resolve();
  /** How often to ask the KCC container about a running job. */
  pollIntervalMs = 2000;

  constructor(
    private readonly repo: KccRepository,
    private readonly client: KccClientService,
    private readonly placement: KccFilePlacementService,
    private readonly bookService: BookService,
    private readonly fileWriteRepo: FileWriteRepository,
    private readonly fileRename: FileRenameService,
    @Inject(kccConfig.KEY) private readonly config: ConfigType<typeof kccConfig>,
  ) {}

  async check(user: RequestUser, bookId: number): Promise<KccConvertCheck> {
    const file = await this.loadFile(user, bookId);
    return this.describe(file);
  }

  private async describe(file: KccBookFile): Promise<KccConvertCheck> {
    const format = file.format?.toLowerCase() ?? null;
    const fileName = basename(file.absolutePath);
    const supported = format !== null && KCC_SOURCE_FORMATS.has(format);
    const copyName = keepCopyName(fileName);

    let alreadyConverted = false;
    if (format === 'cbz') {
      try {
        alreadyConverted = looksConvertedByKcc(await readZipEntryPaths(file.absolutePath));
      } catch (error) {
        this.logger.warn(
          `[fork.kcc.check] [fail] bookId=${file.bookId} error="${sanitizeLogValue(error instanceof Error ? error.message : String(error))}" - could not list pages`,
        );
      }
    }

    const unsupported = supported ? null : `KCC can't convert ${format ? format.toUpperCase() : 'this'} files here (CBZ, CBR, CB7 and PDF only)`;
    const replaceBlockedReason = unsupported ?? replaceNotAllowedReason(file);
    const skipsCopy = buildNameExcludeMatcher(file.excludePatterns)(copyName);
    const keepBlockedReason =
      unsupported ?? (skipsCopy ? null : 'Add *_kcc.cbz to this library\'s "Skip files matching" first, or the copy becomes a separate book');

    return {
      bookId: file.bookId,
      fileName,
      format,
      alreadyConverted,
      canReplace: replaceBlockedReason === null,
      replaceBlockedReason,
      canKeep: keepBlockedReason === null,
      keepBlockedReason,
      keepCopyName: copyName,
      keepCopyExists: await this.exists(KccFilePlacementService.keepTargetPath(file)),
    };
  }

  async start(user: RequestUser, bookId: number, request: KccConvertRequest): Promise<KccConvertJob> {
    const file = await this.loadFile(user, bookId);
    const check = await this.describe(file);
    if (request.mode === 'replace' && !check.canReplace)
      throw new BadRequestException({ errorCode: 'KCC_REPLACE_BLOCKED', message: check.replaceBlockedReason });
    if (request.mode === 'keep' && !check.canKeep) throw new BadRequestException({ errorCode: 'KCC_KEEP_BLOCKED', message: check.keepBlockedReason });
    if (!request.force && check.alreadyConverted) {
      throw new ConflictException({ errorCode: 'KCC_ALREADY_CONVERTED', message: `${check.fileName} looks like it was already converted with KCC` });
    }
    if (!request.force && request.mode === 'keep' && check.keepCopyExists) {
      throw new ConflictException({ errorCode: 'KCC_COPY_EXISTS', message: `${check.keepCopyName} already exists` });
    }
    if ([...this.jobs.values()].some((job) => job.bookId === bookId && (job.state === 'queued' || job.state === 'running'))) {
      throw new ConflictException({ errorCode: 'KCC_JOB_RUNNING', message: 'This book is already being converted' });
    }

    const options = await this.resolveOptions(user, request);
    const schema = await this.client.schema();
    const { args, ignored } = buildKccArgs(options, schema.groups);

    const job: JobRecord = {
      id: randomUUID(),
      userId: user.id,
      bookId,
      title: file.title ?? check.fileName,
      mode: request.mode,
      state: 'queued',
      error: null,
      outputName: null,
      warning: null,
      ignoredOptions: ignored,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    this.pruneJobs();
    this.queue = this.queue.then(() => this.run(user, job, args, Boolean(request.force)));
    return this.toDto(job);
  }

  getJob(user: RequestUser, id: string): KccConvertJob {
    const job = this.jobs.get(id);
    if (!job || job.userId !== user.id) throw new NotFoundException('Conversion not found');
    return this.toDto(job);
  }

  /**
   * The user's conversions BookOrbit still remembers (running, and finished in the last hours),
   * oldest first, or only those that changed after `since`, so following a big batch stays cheap.
   */
  listJobs(user: RequestUser, since: Date | null = null): KccJobList {
    const serverTime = new Date().toISOString();
    // A second of overlap: a change in the same millisecond as the last list is never missed, and
    // seeing a job twice is harmless.
    const after = since ? new Date(since.getTime() - 1000).toISOString() : null;
    const jobs = [...this.jobs.values()]
      .filter((job) => job.userId === user.id && (after === null || job.updatedAt > after))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((job) => this.toDto(job));
    return { jobs, serverTime, bootId: this.bootId };
  }

  /**
   * Queues one conversion per book with the same settings. A book that can't be converted that way
   * (format, library settings, already converted without force) is skipped with the reason instead
   * of stopping the batch.
   */
  async startMany(user: RequestUser, selection: BulkSelectionDto, request: KccConvertRequest): Promise<KccBatchConvertResult> {
    const startedAt = Date.now();
    const unique = [...new Set(await this.bookService.resolveSelectionToIds(selection, user, 'editor'))];
    if (unique.length > MAX_BATCH_BOOKS) {
      throw new BadRequestException({
        errorCode: 'KCC_BATCH_TOO_LARGE',
        message: `At most ${MAX_BATCH_BOOKS} books at a time (${unique.length} selected)`,
      });
    }
    this.logger.log(
      `[fork.kcc.batch] [start] userId=${user.id} books=${unique.length} mode=${request.mode} force=${Boolean(request.force)} - batch started`,
    );
    await this.resolveOptions(user, request);
    const jobs: KccConvertJob[] = [];
    const skipped: KccBatchSkip[] = [];
    for (const bookId of unique) {
      try {
        jobs.push(await this.start(user, bookId, request));
      } catch (error) {
        const file = await this.repo.findBookFile(bookId).catch(() => null);
        skipped.push({ bookId, title: file?.title ?? null, reason: this.errorMessage(error) });
      }
    }
    this.logger.log(
      `[fork.kcc.batch] [end] userId=${user.id} queued=${jobs.length} skipped=${skipped.length} durationMs=${Date.now() - startedAt} - batch queued`,
    );
    return { jobs, skipped };
  }

  latestJob(user: RequestUser, bookId: number): KccConvertJob | null {
    const jobs = [...this.jobs.values()].filter((job) => job.userId === user.id && job.bookId === bookId);
    const latest = jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return latest ? this.toDto(latest) : null;
  }

  private async run(user: RequestUser, job: JobRecord, args: string[], force: boolean): Promise<void> {
    const startedAt = Date.now();
    const jobDir = join(this.config.workDir, job.id);
    job.state = 'running';
    job.updatedAt = new Date().toISOString();
    this.logger.log(`[fork.kcc.convert] [start] jobId=${job.id} bookId=${job.bookId} userId=${user.id} mode=${job.mode} - conversion started`);
    try {
      // Re-read the file: it may have been renamed or rewritten while the job waited in the queue.
      const file = await this.loadFile(user, job.bookId);
      const inputDir = join(jobDir, 'in');
      const outputDir = join(jobDir, 'out');
      await mkdir(inputDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });
      const input = join(inputDir, `book${extname(file.absolutePath).toLowerCase()}`);
      await copyFile(file.absolutePath, input);

      const remoteId = await this.client.startJob(relative(this.config.workDir, input), relative(this.config.workDir, outputDir), args);
      const output = await this.waitForOutput(remoteId);
      const converted = join(this.config.workDir, output);

      await this.writeMetadata(file.bookId, converted);
      const fileHash = await computeFileHash(converted);
      const placed =
        job.mode === 'replace'
          ? await this.placement.replace(file, converted, fileHash, job.id)
          : await this.placement.keep(user, file, converted, fileHash, job.id, force);

      job.outputName = basename(placed.absolutePath);
      if (job.mode === 'replace') await this.renameLikeTheButton(user, job);
      job.state = 'done';
      this.logger.log(
        `[fork.kcc.convert] [end] jobId=${job.id} bookId=${job.bookId} mode=${job.mode} durationMs=${Date.now() - startedAt} hash=${fileHash.slice(0, 8)} - conversion finished`,
      );
    } catch (error) {
      job.state = 'failed';
      job.error = this.errorMessage(error);
      this.logger.warn(
        `[fork.kcc.convert] [fail] jobId=${job.id} bookId=${job.bookId} mode=${job.mode} durationMs=${Date.now() - startedAt} errorClass=${error instanceof Error ? error.name : 'Error'} error="${sanitizeLogValue(job.error)}" - conversion failed`,
      );
    } finally {
      job.finishedAt = new Date().toISOString();
      job.updatedAt = job.finishedAt;
      await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * The same rename as "Write to File & Rename": the library's naming pattern (or the app's default).
   * Replace is only offered where the library renames files, so this is not forced; if the setting
   * was turned off meanwhile, the rename is skipped. The conversion already succeeded, so a failed or
   * skipped rename only leaves a warning on the job.
   */
  private async renameLikeTheButton(user: RequestUser, job: JobRecord): Promise<void> {
    try {
      const result = await this.fileRename.performRename(job.bookId, user.id, false, true);
      if (result.status === 'success' && result.newPath) job.outputName = basename(result.newPath);
      else if (result.status === 'failed') job.warning = `Converted, but not renamed: ${result.reason ?? 'rename failed'}`;
      else if (result.reason && result.reason !== 'path unchanged') job.warning = `Converted, but not renamed: ${result.reason}`;
    } catch (error) {
      job.warning = `Converted, but not renamed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async waitForOutput(remoteId: string): Promise<string> {
    const deadline = Date.now() + this.config.timeoutSeconds * 1000;
    while (Date.now() < deadline) {
      await sleep(this.pollIntervalMs);
      const remote = await this.client.getJob(remoteId);
      if (remote.state === 'failed') {
        const tail = (remote.log ?? '').trim().split('\n').slice(-3).join(' | ');
        throw new Error(`KCC failed (exit ${remote.exitCode ?? '?'}): ${tail || 'no output'}`);
      }
      if (remote.state === 'done') {
        const outputs = (remote.outputs ?? []).filter((path) => path.toLowerCase().endsWith('.cbz'));
        if (outputs.length !== 1) throw new Error(`KCC made ${outputs.length} CBZ files instead of one`);
        return outputs[0];
      }
    }
    throw new Error('KCC took too long');
  }

  /**
   * A fresh ComicInfo.xml from BookOrbit's metadata. Not built on any ComicInfo the source had:
   * KCC splits spreads and renames pages, so a copied <Pages> list and page count would be wrong.
   */
  private async writeMetadata(bookId: number, cbzPath: string): Promise<void> {
    const payload = await this.fileWriteRepo.loadPayload(bookId);
    if (!payload) return;
    const pageCount = await countZipImages(cbzPath);
    const xml = buildComicInfoXml(null, { ...payload, pageCount }, COMIC_INFO_FIELDS);
    await writeComicInfoToZip(cbzPath, xml);
  }

  private async resolveOptions(user: RequestUser, request: KccConvertRequest): Promise<KccOptionValues> {
    let options: KccOptionValues = {};
    if (request.presetId !== undefined) {
      const preset = await this.repo.findPreset(user.id, request.presetId);
      if (!preset) throw new NotFoundException('Preset not found');
      options = preset.options;
    }
    if (request.options) options = { ...options, ...request.options };
    const problem = validateOptionValues(options);
    if (problem) throw new BadRequestException({ errorCode: 'KCC_INVALID_OPTIONS', message: problem });
    return options;
  }

  private async loadFile(user: RequestUser, bookId: number): Promise<KccBookFile> {
    await this.bookService.verifyBookAccess(bookId, user, 'editor');
    const file = await this.repo.findBookFile(bookId);
    if (!file) throw new NotFoundException('Book has no file');
    return file;
  }

  private exists(path: string): Promise<boolean> {
    return stat(path).then(
      () => true,
      () => false,
    );
  }

  private errorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'getResponse' in error && typeof error.getResponse === 'function') {
      const response = error.getResponse() as { message?: string } | string;
      if (typeof response === 'string') return response;
      if (response?.message) return response.message;
    }
    if (error instanceof Error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EROFS' || code === 'EACCES' || code === 'EPERM') {
        return `BookOrbit can't write in the book's folder (${code}). If the library is mounted read-only (:ro), remove that.`;
      }
      return error.message;
    }
    return String(error);
  }

  private pruneJobs(): void {
    const cutoff = Date.now() - FINISHED_JOB_TTL_MS;
    for (const [id, job] of this.jobs) {
      if (job.finishedAt && Date.parse(job.finishedAt) < cutoff) this.jobs.delete(id);
    }
  }

  private toDto(job: JobRecord): KccConvertJob {
    return {
      id: job.id,
      bookId: job.bookId,
      title: job.title,
      mode: job.mode,
      state: job.state,
      error: job.error,
      outputName: job.outputName,
      warning: job.warning,
      ignoredOptions: job.ignoredOptions,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      updatedAt: job.updatedAt,
    };
  }
}
