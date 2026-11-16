import { Controller, Get, Header, Headers, NotFoundException, Param, ParseIntPipe, Query, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RouteConfig } from '@nestjs/platform-fastify';
import type { FastifyReply } from 'fastify';

import type { SeriesReleaseCalendarInfo, SeriesReleasesOverviewResponse } from '@bookorbit/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { UserService } from '../user/user.service';
import { buildReleaseCalendar, calendarToken, calendarTokenUserId, isCalendarTokenValid } from './series-release-calendar';
import { SeriesReleaseService } from './series-release.service';

/** The cross-series reads: grid badges, the agenda page and the calendar a calendar app polls. */
@Controller('series-releases')
export class SeriesReleaseFeedController {
  constructor(
    private readonly releaseService: SeriesReleaseService,
    private readonly userService: UserService,
    private readonly config: ConfigService,
  ) {}

  @Get('overview')
  overview(@CurrentUser() user: RequestUser): Promise<SeriesReleasesOverviewResponse> {
    return this.releaseService.overview(user);
  }

  /** A volume's own cover for the browse page and dashboard; `?v=` busts the cache on change. */
  @Get(':releaseId/cover')
  @RouteConfig({ compress: false })
  async cover(
    @CurrentUser() user: RequestUser,
    @Param('releaseId', ParseIntPipe) releaseId: number,
    @Res() reply: FastifyReply,
    @Query('v') version?: string,
    @Headers('if-none-match') ifNoneMatch?: string,
  ): Promise<void> {
    const image = await this.releaseService.cover(user, releaseId);
    if (!image) throw new NotFoundException('This volume has no cover');
    if ('redirect' in image) {
      reply.redirect(image.redirect, 302);
      return;
    }
    const cacheControl = version ? 'private, max-age=31536000, immutable' : 'private, max-age=3600';
    if (ifNoneMatch === image.etag) {
      reply.status(304).header('Cache-Control', cacheControl).header('ETag', image.etag).send();
      return;
    }
    reply.header('Cache-Control', cacheControl).header('ETag', image.etag).type(image.type).send(image.body);
  }

  /** Where this user's calendar lives. The client puts its own origin in front. */
  @Get('calendar-token')
  calendarInfo(@CurrentUser() user: RequestUser): SeriesReleaseCalendarInfo {
    return { path: `/api/v1/series-releases/calendar.ics?token=${calendarToken(user.id, user.tokenVersion, this.secret())}` };
  }

  /**
   * Public because calendar apps cannot sign in: the token in the link is the whole credential.
   * It is scoped to this calendar and dies with the user's token version.
   */
  @Public()
  @Get('calendar.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'inline; filename="bookorbit-releases.ics"')
  @Header('Cache-Control', 'private, no-cache')
  async calendar(@Query('token') token?: string): Promise<string> {
    const value = typeof token === 'string' ? token : '';
    const userId = calendarTokenUserId(value);
    const user = userId === null ? null : await this.userService.findByIdWithPermissions(userId);
    if (!user || !user.active || !isCalendarTokenValid(value, user.id, user.tokenVersion, this.secret())) {
      throw new UnauthorizedException('This calendar link is no longer valid');
    }
    const { series } = await this.releaseService.overview(user);
    return buildReleaseCalendar(series);
  }

  private secret(): string {
    return this.config.get<string>('auth.jwtSecret')!;
  }
}
