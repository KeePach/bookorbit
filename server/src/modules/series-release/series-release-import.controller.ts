import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { RouteConfig } from '@nestjs/platform-fastify';

import type { SeriesReleaseImportResult } from '@bookorbit/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { ImportSeriesReleasesDto } from './dto/import-series-releases.dto';
import { SeriesReleaseService } from './series-release.service';

/** A backup with inline covers is far larger than the default request limit. */
export const SERIES_RELEASE_IMPORT_BODY_LIMIT_BYTES = 32 * 1024 * 1024;

@Controller('series-releases')
export class SeriesReleaseImportController {
  constructor(private readonly releaseService: SeriesReleaseService) {}

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @RouteConfig({ bodyLimit: SERIES_RELEASE_IMPORT_BODY_LIMIT_BYTES })
  importEntries(@CurrentUser() user: RequestUser, @Body() dto: ImportSeriesReleasesDto): Promise<SeriesReleaseImportResult> {
    return this.releaseService.importEntries(user, dto);
  }
}
