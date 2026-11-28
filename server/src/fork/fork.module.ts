import { Module } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { BookModule } from '../modules/book/book.module';
import { KoreaderAuthGuard } from '../modules/koreader/koreader-auth.guard';
import { KoreaderModule } from '../modules/koreader/koreader.module';
import { UserBookStatusModule } from '../modules/user-book-status/user-book-status.module';
import { UserModule } from '../modules/user/user.module';
import { CalibreRefsIndexerService } from './calibre-refs/calibre-refs-indexer.service';
import { CalibreRefsRepository } from './calibre-refs/calibre-refs.repository';
import { CalibreRefsService } from './calibre-refs/calibre-refs.service';
import { FileUpdatesRepository } from './file-updates/file-updates.repository';
import { FileUpdatesService } from './file-updates/file-updates.service';
import { forkSchemaProvider } from './fork-schema';
import { KccModule } from './kcc/kcc.module';
import { MangabakaSyncModule } from './mangabaka-sync/mangabaka-sync.module';
import { KoreaderForkController } from './koreader-fork.controller';

/**
 * Everything specific to this fork. It lives outside upstream's modules so upstream merges never
 * touch it; app.module.ts only registers it.
 */
@Module({
  imports: [CommonModule, UserModule, KoreaderModule, BookModule, UserBookStatusModule, KccModule, MangabakaSyncModule],
  controllers: [KoreaderForkController],
  providers: [
    forkSchemaProvider,
    KoreaderAuthGuard,
    CalibreRefsRepository,
    CalibreRefsIndexerService,
    CalibreRefsService,
    FileUpdatesRepository,
    FileUpdatesService,
  ],
})
export class ForkModule {}
