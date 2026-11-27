import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';

import {
  Permission,
  type KccBatchConvertResult,
  type KccConvertCheck,
  type KccJobList,
  type KccConvertJob,
  type KccOptionSchema,
  type KccPreset,
  type KccStatus,
} from '@bookorbit/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { KccBatchConvertDto, KccConvertDto, KccJobListQueryDto, KccPresetDto } from './dto/kcc.dto';
import { KccClientService } from './kcc-client.service';
import { KccConvertService } from './kcc-convert.service';
import { KccPresetsService } from './kcc-presets.service';

/** Fork-only: KCC conversion. Converting rewrites library files, so every route needs metadata editing rights. */
@Controller('fork/kcc')
@RequirePermission(Permission.LibraryEditMetadata)
export class KccController {
  constructor(
    private readonly client: KccClientService,
    private readonly presets: KccPresetsService,
    private readonly converter: KccConvertService,
  ) {}

  @Get('status')
  status(): Promise<KccStatus> {
    return this.client.status();
  }

  @Get('options')
  options(): Promise<KccOptionSchema> {
    return this.presets.optionSchema();
  }

  @Get('presets')
  listPresets(@CurrentUser() user: RequestUser): Promise<KccPreset[]> {
    return this.presets.list(user);
  }

  @Post('presets')
  createPreset(@CurrentUser() user: RequestUser, @Body() dto: KccPresetDto): Promise<KccPreset> {
    return this.presets.create(user, dto);
  }

  @Put('presets/:id')
  updatePreset(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number, @Body() dto: KccPresetDto): Promise<KccPreset> {
    return this.presets.update(user, id, dto);
  }

  @Delete('presets/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePreset(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.presets.remove(user, id);
  }

  @Get('books/:bookId/check')
  check(@CurrentUser() user: RequestUser, @Param('bookId', ParseIntPipe) bookId: number): Promise<KccConvertCheck> {
    return this.converter.check(user, bookId);
  }

  @Get('books/:bookId/job')
  latestJob(@CurrentUser() user: RequestUser, @Param('bookId', ParseIntPipe) bookId: number): { job: KccConvertJob | null } {
    return { job: this.converter.latestJob(user, bookId) };
  }

  @Post('books/:bookId/convert')
  convert(@CurrentUser() user: RequestUser, @Param('bookId', ParseIntPipe) bookId: number, @Body() dto: KccConvertDto): Promise<KccConvertJob> {
    return this.converter.start(user, bookId, dto);
  }

  @Post('convert')
  convertMany(@CurrentUser() user: RequestUser, @Body() dto: KccBatchConvertDto): Promise<KccBatchConvertResult> {
    const { selection, ...request } = dto;
    return this.converter.startMany(user, selection, request);
  }

  @Get('jobs')
  listJobs(@CurrentUser() user: RequestUser, @Query() query: KccJobListQueryDto): KccJobList {
    return this.converter.listJobs(user, query.since ? new Date(query.since) : null);
  }

  @Get('jobs/:id')
  job(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string): KccConvertJob {
    return this.converter.getJob(user, id);
  }
}
