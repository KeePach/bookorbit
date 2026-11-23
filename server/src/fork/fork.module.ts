import { Module } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { KoreaderAuthGuard } from '../modules/koreader/koreader-auth.guard';
import { KoreaderModule } from '../modules/koreader/koreader.module';
import { UserModule } from '../modules/user/user.module';
import { CalibreRefsIndexerService } from './calibre-refs/calibre-refs-indexer.service';
import { CalibreRefsRepository } from './calibre-refs/calibre-refs.repository';
import { CalibreRefsService } from './calibre-refs/calibre-refs.service';
import { KoreaderForkController } from './koreader-fork.controller';

/**
 * Everything specific to this fork. It lives outside upstream's modules so upstream merges never
 * touch it; app.module.ts only registers it.
 */
@Module({
  imports: [CommonModule, UserModule, KoreaderModule],
  controllers: [KoreaderForkController],
  providers: [KoreaderAuthGuard, CalibreRefsRepository, CalibreRefsIndexerService, CalibreRefsService],
})
export class ForkModule {}
