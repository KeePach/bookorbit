import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';

import type { SeriesRelease, SeriesReleaseCollectResult, SeriesReleasesResponse, SeriesReleaseTracking } from '@bookorbit/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { CreateSeriesReleaseDto } from './dto/create-series-release.dto';
import { UpdateSeriesReleaseDto } from './dto/update-series-release.dto';
import { UpdateSeriesReleaseTrackingDto } from './dto/update-series-release-tracking.dto';
import { SeriesReleaseService } from './series-release.service';

/** Volumes of a series that are not in the library yet. */
@Controller('series')
export class SeriesReleaseController {
  constructor(private readonly releaseService: SeriesReleaseService) {}

  @Get(':seriesId/releases')
  get(@CurrentUser() user: RequestUser, @Param('seriesId', ParseIntPipe) seriesId: number): Promise<SeriesReleasesResponse> {
    return this.releaseService.get(user, seriesId);
  }

  @Post(':seriesId/releases')
  create(
    @CurrentUser() user: RequestUser,
    @Param('seriesId', ParseIntPipe) seriesId: number,
    @Body() dto: CreateSeriesReleaseDto,
  ): Promise<SeriesRelease> {
    return this.releaseService.create(user, seriesId, dto);
  }

  @Patch(':seriesId/releases/:releaseId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('seriesId', ParseIntPipe) seriesId: number,
    @Param('releaseId', ParseIntPipe) releaseId: number,
    @Body() dto: UpdateSeriesReleaseDto,
  ): Promise<SeriesRelease> {
    return this.releaseService.update(user, seriesId, releaseId, dto);
  }

  @Delete(':seriesId/releases/:releaseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('seriesId', ParseIntPipe) seriesId: number,
    @Param('releaseId', ParseIntPipe) releaseId: number,
  ): Promise<void> {
    await this.releaseService.remove(user, seriesId, releaseId);
  }

  @Post(':seriesId/releases/:releaseId/collect')
  @HttpCode(HttpStatus.OK)
  collect(
    @CurrentUser() user: RequestUser,
    @Param('seriesId', ParseIntPipe) seriesId: number,
    @Param('releaseId', ParseIntPipe) releaseId: number,
  ): Promise<SeriesReleaseCollectResult> {
    return this.releaseService.collect(user, seriesId, releaseId);
  }

  @Patch(':seriesId/release-tracking')
  updateTracking(
    @CurrentUser() user: RequestUser,
    @Param('seriesId', ParseIntPipe) seriesId: number,
    @Body() dto: UpdateSeriesReleaseTrackingDto,
  ): Promise<SeriesReleaseTracking> {
    return this.releaseService.updateTracking(user, seriesId, dto);
  }
}
