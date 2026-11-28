import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';

import type { MangabakaSyncSeriesStatus, MangabakaSyncSettings } from '@bookorbit/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { MangabakaSyncSeriesDto, MangabakaSyncSettingsDto } from './dto/mangabaka-sync.dto';
import { MangabakaSyncService } from './mangabaka-sync.service';

/** Fork-only: each user syncs their own reading to their own MangaBaka library. */
@Controller('fork/mangabaka-sync')
export class MangabakaSyncController {
  constructor(private readonly service: MangabakaSyncService) {}

  @Get('settings')
  settings(@CurrentUser() user: RequestUser): Promise<MangabakaSyncSettings> {
    return this.service.settings(user.id);
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: RequestUser, @Body() dto: MangabakaSyncSettingsDto): Promise<MangabakaSyncSettings> {
    return this.service.updateSettings(user.id, dto);
  }

  @Post('sync-all')
  @HttpCode(HttpStatus.ACCEPTED)
  syncAll(@CurrentUser() user: RequestUser): { started: boolean } {
    return { started: this.service.startSyncAll(user.id) };
  }

  @Get('series/:seriesId')
  series(@CurrentUser() user: RequestUser, @Param('seriesId', ParseIntPipe) seriesId: number): Promise<MangabakaSyncSeriesStatus> {
    return this.service.seriesStatus(user.id, seriesId);
  }

  @Put('series/:seriesId')
  setSelected(
    @CurrentUser() user: RequestUser,
    @Param('seriesId', ParseIntPipe) seriesId: number,
    @Body() dto: MangabakaSyncSeriesDto,
  ): Promise<MangabakaSyncSeriesStatus> {
    return this.service.setSelected(user.id, seriesId, dto.selected);
  }

  @Post('series/:seriesId/sync')
  syncNow(@CurrentUser() user: RequestUser, @Param('seriesId', ParseIntPipe) seriesId: number): Promise<MangabakaSyncSeriesStatus> {
    return this.service.syncNow(user.id, seriesId);
  }
}
