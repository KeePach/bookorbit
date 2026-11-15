import { Module } from '@nestjs/common';

import { LibraryModule } from '../library/library.module';
import { NotificationModule } from '../notification/notification.module';
import { UserModule } from '../user/user.module';
import { SeriesRepository } from '../series/series.repository';
import { SeriesReleaseController } from './series-release.controller';
import { SeriesReleaseFeedController } from './series-release-feed.controller';
import { SeriesReleaseImportController } from './series-release-import.controller';
import { SeriesReleaseNotifierJob } from './series-release-notifier.job';
import { SeriesReleaseNotifierService } from './series-release-notifier.service';
import { SeriesReleaseRepository } from './series-release.repository';
import { SeriesReleaseService } from './series-release.service';

@Module({
  imports: [LibraryModule, NotificationModule, UserModule],
  controllers: [SeriesReleaseController, SeriesReleaseFeedController, SeriesReleaseImportController],
  // SeriesRepository only answers "can this user see this series", so it is provided here rather than
  // widening what SeriesModule exports.
  providers: [SeriesReleaseService, SeriesReleaseRepository, SeriesRepository, SeriesReleaseNotifierService, SeriesReleaseNotifierJob],
  exports: [SeriesReleaseService],
})
export class SeriesReleaseModule {}
