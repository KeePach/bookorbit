import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';

import { Permission, type SeriesLicense, type SeriesLicensingOverview } from '@bookorbit/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { UpdateSeriesLicenseOverrideDto } from './dto/update-series-license-override.dto';
import { UpdateSeriesLicensingSettingsDto } from './dto/update-series-licensing-settings.dto';
import { SeriesLicenseService } from './series-license.service';

@Controller()
export class SeriesLicenseController {
  constructor(private readonly service: SeriesLicenseService) {}

  @Get('series-releases/licensing')
  overview(): Promise<SeriesLicensingOverview> {
    return this.service.overview();
  }

  @RequirePermission(Permission.ManageMetadataConfig)
  @Patch('series-releases/licensing')
  update(@Body() dto: UpdateSeriesLicensingSettingsDto): Promise<SeriesLicensingOverview> {
    return this.service.setLibraries(dto.libraryIds);
  }

  @RequirePermission(Permission.ManageMetadataConfig)
  @Post('series-releases/licensing/run')
  @HttpCode(HttpStatus.ACCEPTED)
  async run(): Promise<{ started: boolean }> {
    await this.service.startRun();
    return { started: true };
  }

  @Patch('series/:seriesId/release-license')
  updateOverride(
    @CurrentUser() user: RequestUser,
    @Param('seriesId', ParseIntPipe) seriesId: number,
    @Body() dto: UpdateSeriesLicenseOverrideDto,
  ): Promise<SeriesLicense> {
    return this.service.updateOverride(user, seriesId, dto.override ?? null);
  }
}
