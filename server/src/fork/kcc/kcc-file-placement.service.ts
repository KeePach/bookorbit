import { ConflictException, Injectable } from '@nestjs/common';
import { constants } from 'node:fs';
import { copyFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

import type { RequestUser } from '../../common/types/request-user';
import { FileLockService, bookOperationLockKey } from '../../common/services/file-lock.service';
import { SelfWriteRegistry } from '../../common/services/self-write-registry.service';
import { FileWriteRepository } from '../../modules/file-write/file-write.repository';
import { KoreaderRepository } from '../../modules/koreader/koreader.repository';
import { keepCopyName } from './kcc-detect';
import type { KccBookFile } from './kcc.repository';
import { KccRepository } from './kcc.repository';

export interface PlacedFile {
  absolutePath: string;
  fileHash: string;
}

/**
 * Puts a finished conversion in the library. Files are staged under hidden names in the book's
 * folder first: the scanner and the file watcher skip hidden entries, and the final rename is
 * atomic on the same filesystem.
 */
@Injectable()
export class KccFilePlacementService {
  constructor(
    private readonly repo: KccRepository,
    private readonly fileWriteRepo: FileWriteRepository,
    private readonly koreaderRepo: KoreaderRepository,
    private readonly fileLocks: FileLockService,
    private readonly selfWrites: SelfWriteRegistry,
  ) {}

  /** Where Replace puts the result: the same name with a .cbz extension. */
  static replaceTargetPath(file: Pick<KccBookFile, 'absolutePath'>): string {
    const current = file.absolutePath;
    return extname(current).toLowerCase() === '.cbz' ? current : join(dirname(current), `${basename(current, extname(current))}.cbz`);
  }

  static keepTargetPath(file: Pick<KccBookFile, 'absolutePath'>): string {
    return join(dirname(file.absolutePath), keepCopyName(basename(file.absolutePath)));
  }

  /**
   * The converted file becomes the book's file. The row (and so progress, sessions, links) stays;
   * the old hash goes to the hash history so copies already on a device still match.
   */
  async replace(file: KccBookFile, converted: string, fileHash: string, jobId: string): Promise<PlacedFile> {
    return this.fileLocks.withLock(bookOperationLockKey(file.bookId), async () => {
      const target = KccFilePlacementService.replaceTargetPath(file);
      const renamed = target !== file.absolutePath;
      if (renamed && (await this.exists(target))) {
        throw new ConflictException({ errorCode: 'KCC_TARGET_EXISTS', message: `${basename(target)} already exists next to the original` });
      }
      if (renamed && (await this.repo.pathTaken(target, file.fileId))) {
        throw new ConflictException({ errorCode: 'KCC_TARGET_EXISTS', message: `${basename(target)} already belongs to another book` });
      }

      const folder = dirname(file.absolutePath);
      const partial = join(folder, `.bookorbit-kcc-${jobId}.partial`);
      const previous = join(folder, `.bookorbit-kcc-${jobId}.previous`);
      const paths = [file.absolutePath, target];
      this.selfWrites.begin(paths);
      try {
        await copyFile(converted, partial, constants.COPYFILE_EXCL);
        await rename(file.absolutePath, previous);
        try {
          await rename(partial, target);
          const info = await stat(target, { bigint: true });
          if (file.fileHash) await this.fileWriteRepo.recordHashHistory(file.fileId, file.fileHash, 'file_write');
          if (renamed) {
            const relPath = file.relPath === null ? null : join(dirname(file.relPath), basename(target));
            await this.repo.moveBookFile(file, target, relPath);
          }
          await this.fileWriteRepo.updateFileStateAfterMetadataWrite(file.bookId, file.fileId, file.fileHash, {
            fileHash,
            mtime: info.mtime,
            sizeBytes: Number(info.size),
            ino: info.ino,
          });
        } catch (error) {
          if (renamed) await rm(target, { force: true }).catch(() => undefined);
          await rename(previous, file.absolutePath).catch(() => undefined);
          throw error;
        }
        await rm(previous, { force: true });
        return { absolutePath: target, fileHash };
      } finally {
        await rm(partial, { force: true }).catch(() => undefined);
        this.selfWrites.end(paths);
      }
    });
  }

  /**
   * Writes `Name_kcc.cbz` next to the original, which is never touched. The copy is not a library
   * file (the library skips `*_kcc.cbz`), so KOReader finds it through the user's hash link.
   */
  async keep(user: RequestUser, file: KccBookFile, converted: string, fileHash: string, jobId: string, overwrite: boolean): Promise<PlacedFile> {
    return this.fileLocks.withLock(bookOperationLockKey(file.bookId), async () => {
      const target = KccFilePlacementService.keepTargetPath(file);
      if (!overwrite && (await this.exists(target))) {
        throw new ConflictException({ errorCode: 'KCC_COPY_EXISTS', message: `${basename(target)} already exists` });
      }
      const partial = join(dirname(target), `.bookorbit-kcc-${jobId}.partial`);
      this.selfWrites.begin([target]);
      try {
        await copyFile(converted, partial, constants.COPYFILE_EXCL);
        await rename(partial, target);
        await this.koreaderRepo.upsertBookHashLink(user.id, fileHash, file.fileId, {
          title: file.title ?? basename(target),
          authors: null,
          lastOpen: null,
        });
        await this.koreaderRepo.clearUnmatchedBooks(user.id, [fileHash], true);
        return { absolutePath: target, fileHash };
      } finally {
        await rm(partial, { force: true }).catch(() => undefined);
        this.selfWrites.end([target]);
      }
    });
  }

  private exists(path: string): Promise<boolean> {
    return stat(path).then(
      () => true,
      () => false,
    );
  }
}
