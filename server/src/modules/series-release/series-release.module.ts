import { Module } from '@nestjs/common';

import { LibraryModule } from '../library/library.module';
import { SeriesRepository } from '../series/series.repository';
import { SeriesReleaseController } from './series-release.controller';
import { SeriesReleaseImportController } from './series-release-import.controller';
import { SeriesReleaseRepository } from './series-release.repository';
import { SeriesReleaseService } from './series-release.service';

@Module({
  imports: [LibraryModule],
  controllers: [SeriesReleaseController, SeriesReleaseImportController],
  // SeriesRepository only answers "can this user see this series", so it is provided here rather than
  // widening what SeriesModule exports.
  providers: [SeriesReleaseService, SeriesReleaseRepository, SeriesRepository],
  exports: [SeriesReleaseService],
})
export class SeriesReleaseModule {}
