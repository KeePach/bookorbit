import { createHash } from 'crypto';

import { KOBO_KEPUB_CUSTOM_CSS_MAX_LENGTH, type KoboKepubTitlePageMode } from '@bookorbit/types';

export type KepubTitlePageMode = KoboKepubTitlePageMode;

export interface KepubifyOptions {
  hyphenate: boolean;
  css: string;
  fullscreenReadingFixes: boolean;
  titlePage: KepubTitlePageMode;
  detectCover: boolean;
}

/** What a delivery record keeps besides `hyphenate`, which predates it and has its own field. */
export type StoredKepubifyOptions = Partial<Omit<KepubifyOptions, 'hyphenate'>>;

export interface KepubifySettings {
  forceEnableHyphenation: boolean;
  kepubCustomCss: string;
  kepubFullscreenReadingFixes: boolean;
  kepubTitlePage: KepubTitlePageMode;
  kepubDetectCover: boolean;
}

export const DEFAULT_KEPUBIFY_OPTIONS: KepubifyOptions = {
  hyphenate: false,
  css: '',
  fullscreenReadingFixes: false,
  titlePage: 'auto',
  detectCover: false,
};

export const DEFAULT_KEPUBIFY_SETTINGS: KepubifySettings = {
  forceEnableHyphenation: DEFAULT_KEPUBIFY_OPTIONS.hyphenate,
  kepubCustomCss: DEFAULT_KEPUBIFY_OPTIONS.css,
  kepubFullscreenReadingFixes: DEFAULT_KEPUBIFY_OPTIONS.fullscreenReadingFixes,
  kepubTitlePage: DEFAULT_KEPUBIFY_OPTIONS.titlePage,
  kepubDetectCover: DEFAULT_KEPUBIFY_OPTIONS.detectCover,
};

export function kepubifyOptionsFromSettings(settings: KepubifySettings): KepubifyOptions {
  return {
    hyphenate: settings.forceEnableHyphenation,
    css: settings.kepubCustomCss,
    fullscreenReadingFixes: settings.kepubFullscreenReadingFixes,
    titlePage: settings.kepubTitlePage,
    detectCover: settings.kepubDetectCover,
  };
}

export function kepubifyOptionsFromDelivery(hyphenate: boolean, stored?: StoredKepubifyOptions): KepubifyOptions {
  return { ...DEFAULT_KEPUBIFY_OPTIONS, ...stored, hyphenate };
}

export function storedKepubifyOptions(options: KepubifyOptions): StoredKepubifyOptions {
  return {
    css: options.css,
    fullscreenReadingFixes: options.fullscreenReadingFixes,
    titlePage: options.titlePage,
    detectCover: options.detectCover,
  };
}

export function kepubifyArgs(options: KepubifyOptions): string[] {
  const args: string[] = [];
  if (options.hyphenate) args.push('--hyphenate');
  if (options.css.trim()) args.push('--css', options.css.trim());
  if (options.fullscreenReadingFixes) args.push('--fullscreen-reading-fixes');
  if (options.titlePage === 'on') args.push('--add-dummy-titlepage');
  if (options.titlePage === 'off') args.push('--no-add-dummy-titlepage');
  if (options.detectCover) args.push('--detect-cover');
  return args;
}

/**
 * Identifies every option except `hyphenate`, which cache keys and delivery hashes already carry on their own.
 * Empty for the defaults, so conversions made before these options existed keep their keys.
 */
export function kepubifyOptionsKey(options: KepubifyOptions): string {
  const css = options.css.trim();
  if (!css && !options.fullscreenReadingFixes && options.titlePage === 'auto' && !options.detectCover) return '';
  const canonical = JSON.stringify([css, options.fullscreenReadingFixes, options.titlePage, options.detectCover]);
  return createHash('sha256').update(canonical).digest('hex').slice(0, 8);
}

/** CSS goes into a `<style>` element of the book, so anything that could close it is refused. */
export function isSafeKepubCss(css: string): boolean {
  return css.length <= KOBO_KEPUB_CUSTOM_CSS_MAX_LENGTH && !css.includes('<') && !css.includes('\0');
}
