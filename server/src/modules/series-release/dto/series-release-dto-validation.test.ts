import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';

import { CreateSeriesReleaseDto } from './create-series-release.dto';
import { ImportSeriesReleasesDto } from './import-series-releases.dto';
import { UpdateSeriesReleaseDto } from './update-series-release.dto';
import { UpdateSeriesReleaseTrackingDto } from './update-series-release-tracking.dto';

/** The same pipe settings the app boots with, so a stray property is rejected here as it is there. */
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

function run<T>(metatype: new () => T, value: unknown): Promise<T> {
  return pipe.transform(value, { type: 'body', metatype }) as Promise<T>;
}

describe('series release DTOs', () => {
  it('trims the volume and accepts clearing optional fields with null', async () => {
    const dto = await run(CreateSeriesReleaseDto, { volume: '  Vol. 6  ', releaseDate: null, storeUrl: null, note: null, cover: null });
    expect(dto.volume).toBe('Vol. 6');
    expect(dto.releaseDate).toBeNull();
  });

  it('rejects an empty volume and unknown properties', async () => {
    await expect(run(CreateSeriesReleaseDto, { volume: '   ' })).rejects.toBeDefined();
    await expect(run(CreateSeriesReleaseDto, { volume: '6', status: 'upcoming' })).rejects.toBeDefined();
    await expect(run(CreateSeriesReleaseDto, { volume: 'x'.repeat(61) })).rejects.toBeDefined();
  });

  it('allows an update to change only one thing', async () => {
    await expect(run(UpdateSeriesReleaseDto, { releaseDate: '2026-12-19' })).resolves.toBeDefined();
    await expect(run(UpdateSeriesReleaseDto, { status: 'skipped' })).resolves.toBeDefined();
    await expect(run(UpdateSeriesReleaseDto, { status: 'finished' })).rejects.toBeDefined();
    await expect(run(UpdateSeriesReleaseDto, { volume: '' })).rejects.toBeDefined();
  });

  it('takes tracking changes as booleans only', async () => {
    await expect(run(UpdateSeriesReleaseTrackingDto, { tracking: true, finished: false, checkedToday: true })).resolves.toBeDefined();
    await expect(run(UpdateSeriesReleaseTrackingDto, { tracking: 'yes' })).rejects.toBeDefined();
  });

  it('reads backup entries whatever keys they carry', async () => {
    const entries = [
      { sid: 12, title: 'Series', volume: '6', date: '2026-12-19', extra: { nested: true } },
      { sid: '14', finished: true },
    ];
    const dto = await run(ImportSeriesReleasesDto, { entries });
    expect(dto.entries).toHaveLength(2);
    expect(dto.entries[0]).toMatchObject({ sid: 12, volume: '6' });
  });

  it('refuses an import that is not a list of objects', async () => {
    await expect(run(ImportSeriesReleasesDto, { entries: 'nope' })).rejects.toBeDefined();
    await expect(run(ImportSeriesReleasesDto, { entries: [1, 2] })).rejects.toBeDefined();
    await expect(run(ImportSeriesReleasesDto, { entries: Array.from({ length: 2001 }, () => ({})) })).rejects.toBeDefined();
  });
});
