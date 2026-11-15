import { Injectable } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';

import { SystemCron } from '../../common/decorators/system-cron.decorator';
import { SeriesReleaseNotifierService } from './series-release-notifier.service';

@Injectable()
export class SeriesReleaseNotifierJob {
  constructor(private readonly notifier: SeriesReleaseNotifierService) {}

  @SystemCron(CronExpression.EVERY_MINUTE)
  async runDaily() {
    // Errors are logged and swallowed in the service.
    await this.notifier.runDaily();
  }
}
