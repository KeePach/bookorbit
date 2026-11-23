import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { RequestUser } from '../common/types/request-user';
import { KoreaderAuthGuard } from '../modules/koreader/koreader-auth.guard';
import { CalibreRefsService } from './calibre-refs/calibre-refs.service';
import { FileUpdatesService } from './file-updates/file-updates.service';
import { FORK_CAPABILITIES } from './fork.constants';
import { CalibreResolveDto, FileUpdatesDto, ReleaseLinksDto } from './koreader-fork.dto';

@Public()
@UseGuards(KoreaderAuthGuard)
@Controller('koreader/plugin/fork')
export class KoreaderForkController {
  constructor(
    private readonly calibreRefs: CalibreRefsService,
    private readonly fileUpdates: FileUpdatesService,
  ) {}

  @Get('capabilities')
  capabilities() {
    return { capabilities: [...FORK_CAPABILITIES] };
  }

  @Post('calibre-resolve')
  @HttpCode(200)
  resolveCalibre(@CurrentUser() user: RequestUser, @Body() dto: CalibreResolveDto) {
    return this.calibreRefs.resolve(user, dto.uuids);
  }

  @Get('libraries')
  libraries(@CurrentUser() user: RequestUser) {
    return this.fileUpdates.libraries(user);
  }

  @Post('file-updates')
  @HttpCode(200)
  checkFileUpdates(@CurrentUser() user: RequestUser, @Body() dto: FileUpdatesDto) {
    return this.fileUpdates.check(user, dto.items, dto.libraryIds);
  }

  @Get('files/:bookFileId/original')
  downloadOriginal(@CurrentUser() user: RequestUser, @Param('bookFileId', ParseIntPipe) bookFileId: number, @Res() reply: FastifyReply) {
    return this.fileUpdates.streamOriginal(user, bookFileId, reply);
  }

  @Post('release-links')
  @HttpCode(200)
  releaseLinks(@CurrentUser() user: RequestUser, @Body() dto: ReleaseLinksDto) {
    return this.fileUpdates.releaseLinks(user, dto.items);
  }
}
