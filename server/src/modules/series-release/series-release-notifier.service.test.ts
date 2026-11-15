import { NotificationType } from '@bookorbit/types';

import { SeriesReleaseNotifierService } from './series-release-notifier.service';
import type { NotificationService } from '../notification/notification.service';
import type { DueReleaseRow, SeriesReleaseRepository } from './series-release.repository';

const NOW = new Date(2026, 10, 14, 9); // 2026-11-14 local time

function makeRepo() {
  return {
    listDueForNotification: vi.fn().mockResolvedValue([]),
    listLibrariesForSeries: vi.fn().mockResolvedValue([]),
    listCheckDueForNotification: vi.fn().mockResolvedValue([]),
    setNotifiedStage: vi.fn().mockResolvedValue(undefined),
    setCheckNotified: vi.fn().mockResolvedValue(undefined),
  };
}

function makeNotifications() {
  return { notify: vi.fn().mockResolvedValue(undefined) };
}

function dueRow(overrides: Partial<DueReleaseRow> = {}): DueReleaseRow {
  return { id: 1, seriesId: 3, seriesName: 'Aki Sora', volume: 'Vol. 6', releaseDate: '2026-11-14', notifiedStage: null, ...overrides };
}

function makeService() {
  const repo = makeRepo();
  const notifications = makeNotifications();
  const service = new SeriesReleaseNotifierService(repo as unknown as SeriesReleaseRepository, notifications as unknown as NotificationService);
  return { service, repo, notifications };
}

describe('SeriesReleaseNotifierService', () => {
  it('announces a volume released today to every library holding the series', async () => {
    const { service, repo, notifications } = makeService();
    repo.listDueForNotification.mockResolvedValue([dueRow()]);
    repo.listLibrariesForSeries.mockResolvedValue([
      { seriesId: 3, libraryId: 9 },
      { seriesId: 3, libraryId: 11 },
    ]);

    await service.runDaily(NOW);

    expect(repo.listDueForNotification).toHaveBeenCalledWith('2026-11-28');
    expect(notifications.notify).toHaveBeenCalledTimes(2);
    expect(notifications.notify).toHaveBeenCalledWith({
      type: NotificationType.SeriesReleaseToday,
      title: 'Series volume out',
      message: 'Aki Sora Vol. 6 is out today.',
      actionUrl: '/series/3',
      meta: { seriesId: 3, releaseId: 1, volume: 'Vol. 6', releaseDate: '2026-11-14' },
      scope: { kind: 'library', libraryId: 9 },
    });
    expect(repo.setNotifiedStage).toHaveBeenCalledWith(1, 'today');
  });

  it('says when the volume came out if the date already passed', async () => {
    const { service, repo, notifications } = makeService();
    repo.listDueForNotification.mockResolvedValue([dueRow({ releaseDate: '2026-11-01', notifiedStage: 'soon' })]);
    repo.listLibrariesForSeries.mockResolvedValue([{ seriesId: 3, libraryId: 9 }]);

    await service.runDaily(NOW);

    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: NotificationType.SeriesReleaseToday, message: 'Aki Sora Vol. 6 came out on 2026-11-01.' }),
    );
    expect(repo.setNotifiedStage).toHaveBeenCalledWith(1, 'today');
  });

  it('nudges once about a volume arriving within two weeks', async () => {
    const { service, repo, notifications } = makeService();
    repo.listDueForNotification.mockResolvedValue([dueRow({ releaseDate: '2026-11-20' })]);
    repo.listLibrariesForSeries.mockResolvedValue([{ seriesId: 3, libraryId: 9 }]);

    await service.runDaily(NOW);

    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.SeriesReleaseSoon,
        title: 'Series volume out soon',
        message: 'Aki Sora Vol. 6 arrives on 2026-11-20.',
      }),
    );
    expect(repo.setNotifiedStage).toHaveBeenCalledWith(1, 'soon');
  });

  it('stays quiet between the "soon" nudge and the day itself', async () => {
    const { service, repo, notifications } = makeService();
    repo.listDueForNotification.mockResolvedValue([dueRow({ releaseDate: '2026-11-20', notifiedStage: 'soon' })]);
    repo.listLibrariesForSeries.mockResolvedValue([{ seriesId: 3, libraryId: 9 }]);

    await service.runDaily(NOW);

    expect(notifications.notify).not.toHaveBeenCalled();
    expect(repo.setNotifiedStage).not.toHaveBeenCalled();
  });

  it('reminds about overdue date checks and remembers the nag', async () => {
    const { service, repo, notifications } = makeService();
    repo.listCheckDueForNotification.mockResolvedValue([{ seriesId: 5, seriesName: 'Yokohama Kaidashi Kikou' }]);
    repo.listLibrariesForSeries.mockResolvedValue([{ seriesId: 5, libraryId: 2 }]);

    await service.runDaily(NOW);

    expect(repo.listCheckDueForNotification).toHaveBeenCalledWith('2026-10-15');
    expect(notifications.notify).toHaveBeenCalledWith({
      type: NotificationType.SeriesReleaseCheckDue,
      title: 'Release check due',
      message: 'No release date yet for Yokohama Kaidashi Kikou; it has been over a month since the last check.',
      actionUrl: '/series/5',
      meta: { seriesId: 5 },
      scope: { kind: 'library', libraryId: 2 },
    });
    expect(repo.setCheckNotified).toHaveBeenCalledWith([5], '2026-11-14');
  });

  it('does nothing when nothing is due', async () => {
    const { service, repo, notifications } = makeService();

    await service.runDaily(NOW);

    expect(notifications.notify).not.toHaveBeenCalled();
    expect(repo.setNotifiedStage).not.toHaveBeenCalled();
    expect(repo.setCheckNotified).not.toHaveBeenCalled();
  });

  it('logs instead of throwing when the pass fails', async () => {
    const { service, repo, notifications } = makeService();
    repo.listDueForNotification.mockRejectedValue(new Error('db down'));

    await expect(service.runDaily(NOW)).resolves.toBeUndefined();
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
