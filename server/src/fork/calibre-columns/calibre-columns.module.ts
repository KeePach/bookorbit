import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CustomMetadataModule } from '../../modules/custom-metadata/custom-metadata.module';
import { calibreColumnsConfig } from './calibre-columns.config';
import { CalibreColumnsRepository } from './calibre-columns.repository';
import { CalibreColumnsService } from './calibre-columns.service';

/** Fork-only: fills BookOrbit custom fields from the Calibre custom columns in each book's metadata.opf. */
@Module({
  imports: [ConfigModule.forFeature(calibreColumnsConfig), CustomMetadataModule],
  providers: [CalibreColumnsRepository, CalibreColumnsService],
  exports: [CalibreColumnsService],
})
export class CalibreColumnsModule {}
