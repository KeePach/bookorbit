import { BadRequestException, InternalServerErrorException } from '@nestjs/common';

import { KoboSettingsService } from './kobo-settings.service';
import { DEFAULT_KEPUBIFY_SETTINGS } from './kepubify-options';

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    userId: 9,
    readingThreshold: 1,
    finishedThreshold: 99,
    convertToKepub: true,
    ...DEFAULT_KEPUBIFY_SETTINGS,
    forceEnableHyphenation: false,
    kepubConversionLimitMb: 100,
    twoWayProgressSync: false,
    storeSync: false,
    ...overrides,
  };
}

function makeDb() {
  const findFirst = vi.fn();

  const insertReturning = vi.fn();
  const insertOnConflictDoNothing = vi.fn().mockReturnValue({ returning: insertReturning });
  const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflictDoNothing });
  const insert = vi.fn().mockReturnValue({ values: insertValues });

  const updateReturning = vi.fn();
  const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockReturnValue({ set: updateSet });
  const execute = vi.fn().mockResolvedValue(undefined);

  return {
    query: {
      koboSyncSettings: {
        findFirst,
      },
    },
    insert,
    insertValues,
    insertOnConflictDoNothing,
    insertReturning,
    update,
    updateSet,
    updateWhere,
    updateReturning,
    execute,
  };
}

describe('KoboSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns existing settings row when present', async () => {
    const db = makeDb();
    db.query.koboSyncSettings.findFirst.mockResolvedValue(makeRow({ convertToKepub: true }));
    const service = new KoboSettingsService(db as never);

    await expect(service.getSettings(9)).resolves.toEqual({
      readingThreshold: 1,
      finishedThreshold: 99,
      convertToKepub: true,
      ...DEFAULT_KEPUBIFY_SETTINGS,
      forceEnableHyphenation: false,
      kepubConversionLimitMb: 100,
      twoWayProgressSync: false,
      storeSync: false,
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('creates missing settings row and falls back to re-read when insert returns nothing', async () => {
    const db = makeDb();
    db.query.koboSyncSettings.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(makeRow({ kepubConversionLimitMb: 150 }));
    db.insertReturning.mockResolvedValueOnce([]);
    const service = new KoboSettingsService(db as never);

    await expect(service.getSettings(7)).resolves.toEqual({
      readingThreshold: 1,
      finishedThreshold: 99,
      convertToKepub: true,
      ...DEFAULT_KEPUBIFY_SETTINGS,
      forceEnableHyphenation: false,
      kepubConversionLimitMb: 150,
      twoWayProgressSync: false,
      storeSync: false,
    });
    expect(db.insertValues).toHaveBeenCalledWith({ userId: 7 });
  });

  it('self-heals stale settings where two-way sync is enabled without KEPUB conversion', async () => {
    const db = makeDb();
    db.query.koboSyncSettings.findFirst.mockResolvedValue(makeRow({ convertToKepub: false, twoWayProgressSync: true }));
    db.updateReturning.mockResolvedValue([makeRow({ convertToKepub: true, twoWayProgressSync: true })]);
    const service = new KoboSettingsService(db as never);

    await expect(service.getSettings(9)).resolves.toEqual({
      readingThreshold: 1,
      finishedThreshold: 99,
      convertToKepub: true,
      ...DEFAULT_KEPUBIFY_SETTINGS,
      forceEnableHyphenation: false,
      kepubConversionLimitMb: 100,
      twoWayProgressSync: true,
      storeSync: false,
    });
    expect(db.updateSet).toHaveBeenCalledWith(expect.objectContaining({ convertToKepub: true }));
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('throws when settings row cannot be created', async () => {
    const db = makeDb();
    db.query.koboSyncSettings.findFirst.mockResolvedValue(null);
    db.insertReturning.mockResolvedValue([]);
    const service = new KoboSettingsService(db as never);

    await expect(service.getSettings(7)).rejects.toThrow(InternalServerErrorException);
  });

  it('updates and returns merged settings fields', async () => {
    const db = makeDb();
    const service = new KoboSettingsService(db as never);
    vi.spyOn(service, 'getSettings').mockResolvedValue({
      readingThreshold: 1,
      finishedThreshold: 99,
      convertToKepub: false,
      ...DEFAULT_KEPUBIFY_SETTINGS,
      forceEnableHyphenation: false,
      kepubConversionLimitMb: 100,
      twoWayProgressSync: false,
      storeSync: false,
    });
    db.updateReturning.mockResolvedValue([
      makeRow({
        convertToKepub: true,
        ...DEFAULT_KEPUBIFY_SETTINGS,
        forceEnableHyphenation: true,
        kepubConversionLimitMb: 200,
        twoWayProgressSync: true,
        storeSync: false,
      }),
    ]);

    await expect(service.updateSettings(9, { convertToKepub: false, twoWayProgressSync: true })).resolves.toEqual({
      readingThreshold: 1,
      finishedThreshold: 99,
      convertToKepub: true,
      ...DEFAULT_KEPUBIFY_SETTINGS,
      forceEnableHyphenation: true,
      kepubConversionLimitMb: 200,
      twoWayProgressSync: true,
      storeSync: false,
    });
    expect(db.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        convertToKepub: true,
        twoWayProgressSync: true,
        storeSync: false,
      }),
    );
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('does not mark Kobo books for re-delivery when only progress thresholds change', async () => {
    const db = makeDb();
    const service = new KoboSettingsService(db as never);
    vi.spyOn(service, 'getSettings').mockResolvedValue({
      readingThreshold: 1,
      finishedThreshold: 99,
      convertToKepub: true,
      ...DEFAULT_KEPUBIFY_SETTINGS,
      forceEnableHyphenation: false,
      kepubConversionLimitMb: 100,
      twoWayProgressSync: false,
      storeSync: false,
    });
    db.updateReturning.mockResolvedValue([makeRow({ readingThreshold: 5, finishedThreshold: 95 })]);

    await expect(service.updateSettings(9, { readingThreshold: 5, finishedThreshold: 95 })).resolves.toEqual({
      readingThreshold: 5,
      finishedThreshold: 95,
      convertToKepub: true,
      ...DEFAULT_KEPUBIFY_SETTINGS,
      forceEnableHyphenation: false,
      kepubConversionLimitMb: 100,
      twoWayProgressSync: false,
      storeSync: false,
    });
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('toggles store sync without forcing every Kobo book to be re-delivered', async () => {
    const db = makeDb();
    const service = new KoboSettingsService(db as never);
    vi.spyOn(service, 'getSettings').mockResolvedValue({
      readingThreshold: 1,
      finishedThreshold: 99,
      convertToKepub: true,
      ...DEFAULT_KEPUBIFY_SETTINGS,
      forceEnableHyphenation: false,
      kepubConversionLimitMb: 100,
      twoWayProgressSync: false,
      storeSync: false,
    });
    db.updateReturning.mockResolvedValue([makeRow({ storeSync: true })]);

    await expect(service.updateSettings(9, { storeSync: true })).resolves.toMatchObject({ storeSync: true });
    expect(db.updateSet).toHaveBeenCalledWith(expect.objectContaining({ storeSync: true }));
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('throws when update does not return a row', async () => {
    const db = makeDb();
    const service = new KoboSettingsService(db as never);
    vi.spyOn(service, 'getSettings').mockResolvedValue({
      readingThreshold: 1,
      finishedThreshold: 99,
      convertToKepub: false,
      ...DEFAULT_KEPUBIFY_SETTINGS,
      forceEnableHyphenation: false,
      kepubConversionLimitMb: 100,
      twoWayProgressSync: false,
      storeSync: false,
    });
    db.updateReturning.mockResolvedValue([]);

    await expect(service.updateSettings(9, { kepubConversionLimitMb: 101 })).rejects.toThrow(InternalServerErrorException);
  });

  it('throws BadRequestException when readingThreshold >= finishedThreshold', async () => {
    const db = makeDb();
    const service = new KoboSettingsService(db as never);
    vi.spyOn(service, 'getSettings').mockResolvedValue({
      readingThreshold: 1,
      finishedThreshold: 99,
      convertToKepub: false,
      ...DEFAULT_KEPUBIFY_SETTINGS,
      forceEnableHyphenation: false,
      kepubConversionLimitMb: 100,
      twoWayProgressSync: false,
      storeSync: false,
    });

    await expect(service.updateSettings(9, { readingThreshold: 99, finishedThreshold: 99 })).rejects.toThrow(
      'Reading threshold must be less than finished threshold',
    );
    await expect(service.updateSettings(9, { readingThreshold: 99, finishedThreshold: 80 })).rejects.toThrow(
      'Reading threshold must be less than finished threshold',
    );
  });

  describe('kepub conversion options', () => {
    const current = (overrides: Partial<Record<string, unknown>> = {}) => ({
      readingThreshold: 1,
      finishedThreshold: 99,
      convertToKepub: true,
      ...DEFAULT_KEPUBIFY_SETTINGS,
      kepubConversionLimitMb: 100,
      twoWayProgressSync: false,
      syncBookOrbitAnnotationsToKobo: false,
      storeSync: false,
      fullSizeCovers: true,
      ...overrides,
    });

    function setup(existing: Record<string, unknown>, saved: Record<string, unknown>) {
      const db = makeDb();
      const service = new KoboSettingsService(db as never);
      vi.spyOn(service, 'getSettings').mockResolvedValue(existing as never);
      db.updateReturning.mockResolvedValue([makeRow(saved)]);
      return { db, service };
    }

    it('stores and returns the options', async () => {
      const patch = { kepubCustomCss: 'p { margin: 0 }', kepubFullscreenReadingFixes: true, kepubTitlePage: 'off' as const, kepubDetectCover: true };
      const { db, service } = setup(current(), patch);

      await expect(service.updateSettings(9, patch)).resolves.toMatchObject(patch);
      expect(db.updateSet).toHaveBeenCalledWith(expect.objectContaining(patch));
    });

    it.each([
      ['custom CSS', { kepubCustomCss: 'p { margin: 0 }' }],
      ['fullscreen reading fixes', { kepubFullscreenReadingFixes: true }],
      ['the title page mode', { kepubTitlePage: 'on' }],
      ['cover detection', { kepubDetectCover: true }],
    ])('marks Kobo books for re-delivery when %s changes', async (_name, patch) => {
      const { db, service } = setup(current(), patch);

      await service.updateSettings(9, patch);

      expect(db.execute).toHaveBeenCalledTimes(1);
    });

    it('does not re-deliver when only whitespace around the CSS changes', async () => {
      const { db, service } = setup(current({ kepubCustomCss: 'p { margin: 0 }' }), { kepubCustomCss: ' p { margin: 0 } ' });

      await service.updateSettings(9, { kepubCustomCss: ' p { margin: 0 } ' });

      expect(db.execute).not.toHaveBeenCalled();
    });

    it('does not re-deliver for an option change while conversion is off', async () => {
      const { db, service } = setup(current({ convertToKepub: false }), { convertToKepub: false, kepubDetectCover: true });

      await service.updateSettings(9, { kepubDetectCover: true });

      expect(db.execute).not.toHaveBeenCalled();
    });

    it.each(['</style><script>alert(1)</script>', 'a'.repeat(10_001)])(
      'rejects CSS that could break out of the style element or is too long',
      async (css) => {
        const { db, service } = setup(current(), {});

        await expect(service.updateSettings(9, { kepubCustomCss: css })).rejects.toBeInstanceOf(BadRequestException);
        expect(db.update).not.toHaveBeenCalled();
      },
    );
  });
});
