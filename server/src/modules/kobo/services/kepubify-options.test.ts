import { KOBO_KEPUB_CUSTOM_CSS_MAX_LENGTH } from '@bookorbit/types';

import {
  DEFAULT_KEPUBIFY_OPTIONS,
  isSafeKepubCss,
  kepubifyArgs,
  kepubifyOptionsFromDelivery,
  kepubifyOptionsFromSettings,
  kepubifyOptionsKey,
  storedKepubifyOptions,
  type KepubifyOptions,
} from './kepubify-options';

const options = (patch: Partial<KepubifyOptions> = {}): KepubifyOptions => ({ ...DEFAULT_KEPUBIFY_OPTIONS, ...patch });

describe('kepubifyArgs', () => {
  it('passes nothing for the defaults', () => {
    expect(kepubifyArgs(options())).toEqual([]);
  });

  it('maps each option to its kepubify flag', () => {
    expect(
      kepubifyArgs(options({ hyphenate: true, css: 'p { margin: 0 }', fullscreenReadingFixes: true, titlePage: 'on', detectCover: true })),
    ).toEqual(['--hyphenate', '--css', 'p { margin: 0 }', '--fullscreen-reading-fixes', '--add-dummy-titlepage', '--detect-cover']);
  });

  it('forces the title page off only when asked', () => {
    expect(kepubifyArgs(options({ titlePage: 'off' }))).toEqual(['--no-add-dummy-titlepage']);
    expect(kepubifyArgs(options({ titlePage: 'auto' }))).toEqual([]);
  });

  it('skips blank CSS', () => {
    expect(kepubifyArgs(options({ css: '  \n ' }))).toEqual([]);
  });
});

describe('kepubifyOptionsKey', () => {
  it('is empty for the defaults, with or without hyphenation', () => {
    expect(kepubifyOptionsKey(options())).toBe('');
    expect(kepubifyOptionsKey(options({ hyphenate: true }))).toBe('');
  });

  it('changes with every option that changes the output', () => {
    const keys = [
      options({ css: 'p { margin: 0 }' }),
      options({ css: 'p { margin: 1em }' }),
      options({ fullscreenReadingFixes: true }),
      options({ titlePage: 'on' }),
      options({ titlePage: 'off' }),
      options({ detectCover: true }),
    ].map(kepubifyOptionsKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-f0-9]{8}$/);
  });

  it('ignores whitespace around the CSS', () => {
    expect(kepubifyOptionsKey(options({ css: ' p{a:b} ' }))).toBe(kepubifyOptionsKey(options({ css: 'p{a:b}' })));
  });
});

describe('delivery round trip', () => {
  it('rebuilds the options a delivery was made with', () => {
    const delivered = options({ hyphenate: true, css: 'p{a:b}', detectCover: true });
    expect(kepubifyOptionsFromDelivery(true, storedKepubifyOptions(delivered))).toEqual(delivered);
  });

  it('treats a record from before these options as the defaults', () => {
    expect(kepubifyOptionsFromDelivery(true, undefined)).toEqual(options({ hyphenate: true }));
  });
});

describe('kepubifyOptionsFromSettings', () => {
  it('reads the stored settings', () => {
    expect(
      kepubifyOptionsFromSettings({
        forceEnableHyphenation: true,
        kepubCustomCss: 'p{a:b}',
        kepubFullscreenReadingFixes: true,
        kepubTitlePage: 'off',
        kepubDetectCover: true,
      }),
    ).toEqual({ hyphenate: true, css: 'p{a:b}', fullscreenReadingFixes: true, titlePage: 'off', detectCover: true });
  });
});

describe('isSafeKepubCss', () => {
  it('accepts ordinary CSS, including child combinators', () => {
    expect(isSafeKepubCss('div > p { text-indent: 1.2em; }')).toBe(true);
    expect(isSafeKepubCss('')).toBe(true);
  });

  it('refuses anything that could close the style element', () => {
    expect(isSafeKepubCss('</style><script>x</script>')).toBe(false);
    expect(isSafeKepubCss('a { b: c }\0')).toBe(false);
  });

  it('refuses CSS over the length limit', () => {
    expect(isSafeKepubCss('a'.repeat(KOBO_KEPUB_CUSTOM_CSS_MAX_LENGTH))).toBe(true);
    expect(isSafeKepubCss('a'.repeat(KOBO_KEPUB_CUSTOM_CSS_MAX_LENGTH + 1))).toBe(false);
  });
});
