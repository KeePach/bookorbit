import { registerAs } from '@nestjs/config';

export const calibreColumnsConfig = registerAs('forkCalibreColumns', () => ({
  /** `field_key=#column` pairs for fields whose key differs from the Calibre lookup name. */
  links: process.env.FORK_CALIBRE_COLUMN_LINKS ?? '',
  /** How often to look for finished scans and changed field links. 0 turns the background check off. */
  pollSeconds: parseNonNegativeInteger(process.env.FORK_CALIBRE_COLUMNS_POLL_SECONDS, 60),
  /** Calibre column copied into BookOrbit's own Subtitle field, or null (`-`) to leave subtitles alone. */
  subtitleColumn: parseColumn(process.env.FORK_CALIBRE_SUBTITLE_COLUMN, '#subtitle'),
}));

/** `#subtitle`, `subtitle` -> `#subtitle`; `-` -> null; empty or invalid -> the fallback. */
export function parseColumn(raw: string | undefined, fallback: string): string | null {
  const trimmed = (raw ?? '').trim().toLowerCase();
  if (trimmed === '-') return null;
  const match = /^#?([a-z0-9_]+)$/.exec(trimmed);
  return match ? `#${match[1]}` : fallback;
}

function parseNonNegativeInteger(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw.trim());
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}
