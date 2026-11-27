import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { BookMetadataLockModule } from '../../modules/book-metadata-lock/book-metadata-lock.module';
import { CustomMetadataModule } from '../../modules/custom-metadata/custom-metadata.module';
import { MetadataScoreModule } from '../../modules/metadata-score/metadata-score.module';
import { calibreColumnsConfig } from './calibre-columns.config';
import { CalibreColumnsRepository } from './calibre-columns.repository';
import { CalibreColumnsService } from './calibre-columns.service';

/** Fork-only: fills BookOrbit custom fields and the Subtitle field from the Calibre custom columns in each book's metadata.opf. */
@Module({
  imports: [ConfigModule.forFeature(calibreColumnsConfig), CustomMetadataModule, BookMetadataLockModule, MetadataScoreModule],
  providers: [CalibreColumnsRepository, CalibreColumnsService],
  exports: [CalibreColumnsService],
})
export class CalibreColumnsModule {}
