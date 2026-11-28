import { Module } from '@nestjs/common';

import { AchievementModule } from '../../modules/achievement/achievement.module';
import { MangabakaSyncClientService } from './mangabaka-sync-client.service';
import { MangabakaSyncController } from './mangabaka-sync.controller';
import { MangabakaSyncRepository } from './mangabaka-sync.repository';
import { MangabakaSyncService } from './mangabaka-sync.service';

/** Fork-only: push the reading state of chosen series to the user's MangaBaka library. */
@Module({
  imports: [AchievementModule],
  controllers: [MangabakaSyncController],
  providers: [MangabakaSyncRepository, MangabakaSyncClientService, MangabakaSyncService],
})
export class MangabakaSyncModule {}
