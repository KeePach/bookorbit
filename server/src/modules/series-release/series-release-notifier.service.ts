import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Permission } from '@bookorbit/types';

import { NotificationService } from '../notification/notification.service';
import { SeriesLicenseRepository } from './series-license.repository';
import { SeriesReleaseRepository, type DueReleaseRow } from './series-release.repository';
import { todayIso } from './series-release.validation';

/** Mirror of the client's release-state windows (SOON_DAYS / CHECK_EVERY_DAYS). */
export const RELEASE_SOON_DAYS = 14;
export const RELEASE_CHECK_EVERY_DAYS = 30;

function addDaysIso(day: string, days: number): string {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, dayOfMonth + days)).toISOString().slice(0, 10);
}

/**
 * The daily reminder pass behind the tracked-series feature: "out today", "out soon" and
 * "time to check for a date". Each reminder fires once — releases remember how far their
 * reminders got (`notifiedStage`), check nags remember their last send (`checkNotifiedAt`) —
 * so a volume that sits uncollected does not nag every morning.
 */
@Injectable()
export class SeriesReleaseNotifierService {
  private readonly logger = new Logger(SeriesReleaseNotifierService.name);

  constructor(
    private readonly repo: SeriesReleaseRepository,
    private readonly notifications: NotificationService,
    private readonly licenseRepo: SeriesLicenseRepository,
  ) {}

  async runDaily(now: Date = new Date()): Promise<void> {
    const event = 'series_release.notify';
    const today = todayIso(now);
    try {
      const releaseReminders = await this.notifyDueReleases(today);
      const checkReminders = await this.notifyCheckDue(today);
      const staleReminder = await this.notifyStaleLicenseData(today);
      this.logger.log(
        `[${event}] [end] day=${today} releaseReminders=${releaseReminders} checkReminders=${checkReminders} staleReminder=${staleReminder} - series release reminders dispatched`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${event}] [fail] day=${today} error="${message}" - series release reminders failed`);
    }
  }

  private async notifyDueReleases(today: string): Promise<number> {
    const due = await this.repo.listDueForNotification(addDaysIso(today, RELEASE_SOON_DAYS));
    if (due.length === 0) return 0;
    const libraries = await this.repo.listLibrariesForSeries([...new Set(due.map((row) => row.seriesId))]);
    const bySeries = new Map<number, number[]>();
    for (const { seriesId, libraryId } of libraries) bySeries.set(seriesId, [...(bySeries.get(seriesId) ?? []), libraryId]);

    let sent = 0;
    for (const release of due) {
      const stage: 'soon' | 'today' = release.releaseDate <= today ? 'today' : 'soon';
      // The "soon" nudge already went out; stay quiet until the day itself.
      if (stage === 'soon' && release.notifiedStage === 'soon') continue;
      await this.notifyRelease(release, stage, today, bySeries.get(release.seriesId) ?? []);
      await this.repo.setNotifiedStage(release.id, stage);
      sent++;
    }
    return sent;
  }

  private async notifyRelease(release: DueReleaseRow, stage: 'soon' | 'today', today: string, libraryIds: number[]): Promise<void> {
    const name = `${release.seriesName} ${release.volume}`;
    const content =
      stage === 'today'
        ? {
            type: NotificationType.SeriesReleaseToday,
            title: 'Series volume out',
            message: release.releaseDate === today ? `${name} is out today.` : `${name} came out on ${release.releaseDate}.`,
          }
        : {
            type: NotificationType.SeriesReleaseSoon,
            title: 'Series volume out soon',
            message: `${name} arrives on ${release.releaseDate}.`,
          };
    // A series can span libraries; users in more than one may see the reminder once per library.
    for (const libraryId of libraryIds) {
      await this.notifications.notify({
        ...content,
        actionUrl: `/series/${release.seriesId}`,
        meta: { seriesId: release.seriesId, releaseId: release.id, volume: release.volume, releaseDate: release.releaseDate },
        scope: { kind: 'library', libraryId },
      });
    }
  }

  private async notifyCheckDue(today: string): Promise<number> {
    const cutoff = addDaysIso(today, -RELEASE_CHECK_EVERY_DAYS);
    const series = await this.repo.listCheckDueForNotification(cutoff);
    if (series.length === 0) return 0;
    const libraries = await this.repo.listLibrariesForSeries(series.map((row) => row.seriesId));
    const bySeries = new Map<number, number[]>();
    for (const { seriesId, libraryId } of libraries) bySeries.set(seriesId, [...(bySeries.get(seriesId) ?? []), libraryId]);

    for (const row of series) {
      for (const libraryId of bySeries.get(row.seriesId) ?? []) {
        await this.notifications.notify({
          type: NotificationType.SeriesReleaseCheckDue,
          title: 'Release check due',
          message: `No release date yet for ${row.seriesName}; it has been over a month since the last check.`,
          actionUrl: `/series/${row.seriesId}`,
          meta: { seriesId: row.seriesId },
          scope: { kind: 'library', libraryId },
        });
      }
    }
    await this.repo.setCheckNotified(
      series.map((row) => row.seriesId),
      today,
    );
    return series.length;
  }

  /**
   * The monthly nudge to re-run the manual MangaBaka licensing check: it goes to the people
   * who can run it, once per month, and only when licensing is actually set up.
   */
  private async notifyStaleLicenseData(today: string): Promise<boolean> {
    const settings = await this.licenseRepo.getSettings();
    if (!settings || settings.libraryIds.length === 0) return false;
    const cutoff = addDaysIso(today, -RELEASE_CHECK_EVERY_DAYS);
    const lastRun = settings.lastRunAt ? todayIso(settings.lastRunAt) : null;
    if (lastRun && lastRun > cutoff) return false;
    if (settings.staleNotifiedAt && settings.staleNotifiedAt > cutoff) return false;
    await this.notifications.notify({
      type: NotificationType.SeriesReleaseCheckDue,
      title: 'Licensing data is stale',
      message: lastRun
        ? `MangaBaka licensing was last checked on ${lastRun}. Run a new check from the releases page.`
        : 'MangaBaka licensing has never been checked. Run the first check from the releases page.',
      actionUrl: '/releases',
      meta: { lastRunAt: lastRun },
      scope: { kind: 'permission', permission: Permission.ManageMetadataConfig },
    });
    await this.licenseRepo.setStaleNotified(today);
    return true;
  }
}
