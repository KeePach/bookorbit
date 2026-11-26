import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CommonModule } from '../../common/common.module';
import { SelfWriteRegistryModule } from '../../common/self-write-registry.module';
import { BookModule } from '../../modules/book/book.module';
import { FileWriteModule } from '../../modules/file-write/file-write.module';
import { KoreaderModule } from '../../modules/koreader/koreader.module';
import { KccClientService } from './kcc-client.service';
import { KccConvertService } from './kcc-convert.service';
import { KccFilePlacementService } from './kcc-file-placement.service';
import { KccPresetsService } from './kcc-presets.service';
import { kccConfig } from './kcc.config';
import { KccController } from './kcc.controller';
import { KccRepository } from './kcc.repository';

/** Fork-only: convert comics with KCC running in its own container (docker/fork-kcc). */
@Module({
  imports: [ConfigModule.forFeature(kccConfig), CommonModule, SelfWriteRegistryModule, BookModule, FileWriteModule, KoreaderModule],
  controllers: [KccController],
  providers: [KccRepository, KccClientService, KccPresetsService, KccConvertService, KccFilePlacementService],
})
export class KccModule {}
