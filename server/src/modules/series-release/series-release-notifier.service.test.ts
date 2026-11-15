import { NotificationType, Permission } from '@bookorbit/types';

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

function makeLicenseRepo() {
  return {
    getSettings: vi.fn().mockResolvedValue(null),
    setStaleNotified: vi.fn().mockResolvedValue(undefined),
  };
}

function makeService() {
  const repo = makeRepo();
  const notifications = makeNotifications();
  const licenseRepo = makeLicenseRepo();
  const service = new SeriesReleaseNotifierService(
    repo as unknown as SeriesReleaseRepository,
    notifications as unknown as NotificationService,
    licenseRepo as never,
  );
  return { service, repo, notifications, licenseRepo };
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

  it('sums up many due checks in one library as a single notification', async () => {
    const { service, repo, notifications } = makeService();
    const due = [1, 2, 3, 4, 5].map((seriesId) => ({ seriesId, seriesName: `Series ${seriesId}` }));
    repo.listCheckDueForNotification.mockResolvedValue(due);
    repo.listLibrariesForSeries.mockResolvedValue(due.map(({ seriesId }) => ({ seriesId, libraryId: 2 })));

    await service.runDaily(NOW);

    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith({
      type: NotificationType.SeriesReleaseCheckDue,
      title: 'Release checks due',
      message: '5 tracked series have no release date and have not been checked in over a month.',
      actionUrl: '/releases',
      meta: { count: 5 },
      scope: { kind: 'library', libraryId: 2 },
    });
    expect(repo.setCheckNotified).toHaveBeenCalledWith([1, 2, 3, 4, 5], '2026-11-14');
  });

  it('does nothing when nothing is due', async () => {
    const { service, repo, notifications } = makeService();

    await service.runDaily(NOW);

    expect(notifications.notify).not.toHaveBeenCalled();
    expect(repo.setNotifiedStage).not.toHaveBeenCalled();
    expect(repo.setCheckNotified).not.toHaveBeenCalled();
  });

  it('nags monthly when the licensing data has gone stale', async () => {
    const { service, notifications, licenseRepo } = makeService();
    licenseRepo.getSettings.mockResolvedValue({
      libraryIds: [9],
      lastRunAt: new Date(2026, 9, 1),
      staleNotifiedAt: null,
    });

    await service.runDaily(NOW);

    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.SeriesReleaseCheckDue,
        title: 'Licensing data is stale',
        actionUrl: '/releases',
        scope: { kind: 'permission', permission: Permission.ManageMetadataConfig },
      }),
    );
    expect(licenseRepo.setStaleNotified).toHaveBeenCalledWith('2026-11-14');
  });

  it('stays quiet about licensing when the data is fresh, already nagged, or not set up', async () => {
    const { service, notifications, licenseRepo } = makeService();
    licenseRepo.getSettings.mockResolvedValue({ libraryIds: [9], lastRunAt: new Date(2026, 10, 1), staleNotifiedAt: null });
    await service.runDaily(NOW);

    licenseRepo.getSettings.mockResolvedValue({ libraryIds: [9], lastRunAt: new Date(2026, 9, 1), staleNotifiedAt: '2026-11-01' });
    await service.runDaily(NOW);

    licenseRepo.getSettings.mockResolvedValue({ libraryIds: [], lastRunAt: null, staleNotifiedAt: null });
    await service.runDaily(NOW);

    expect(notifications.notify).not.toHaveBeenCalled();
    expect(licenseRepo.setStaleNotified).not.toHaveBeenCalled();
  });

  it('logs instead of throwing when the pass fails', async () => {
    const { service, repo, notifications } = makeService();
    repo.listDueForNotification.mockRejectedValue(new Error('db down'));

    await expect(service.runDaily(NOW)).resolves.toBeUndefined();
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
