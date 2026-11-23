import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { RequestUser } from '../common/types/request-user';
import { KoreaderAuthGuard } from '../modules/koreader/koreader-auth.guard';
import { CalibreRefsService } from './calibre-refs/calibre-refs.service';
import { FORK_CAPABILITIES } from './fork.constants';
import { CalibreResolveDto } from './koreader-fork.dto';

@Public()
@UseGuards(KoreaderAuthGuard)
@Controller('koreader/plugin/fork')
export class KoreaderForkController {
  constructor(private readonly calibreRefs: CalibreRefsService) {}

  @Get('capabilities')
  capabilities() {
    return { capabilities: [...FORK_CAPABILITIES] };
  }

  @Post('calibre-resolve')
  @HttpCode(200)
  resolveCalibre(@CurrentUser() user: RequestUser, @Body() dto: CalibreResolveDto) {
    return this.calibreRefs.resolve(user, dto.uuids);
  }
}
