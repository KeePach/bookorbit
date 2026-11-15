import { createHmac, timingSafeEqual } from 'crypto';

import type { SeriesReleaseOverviewSeries } from '@bookorbit/types';

/** Days between "look for a release date" reminders; matches the client's CHECK_EVERY_DAYS. */
export const CALENDAR_CHECK_EVERY_DAYS = 30;

const TOKEN_SCOPE = 'series-release-calendar';
const TOKEN_PATTERN = /^(\d{1,12})\.[0-9a-f]{32}$/;

/**
 * The link a calendar app polls carries this token instead of a session. It is signed with the
 * server secret and the user's token version, so signing the user out everywhere retires it too,
 * and the scope keeps it from opening anything but this calendar.
 */
export function calendarToken(userId: number, tokenVersion: number, secret: string): string {
  const signature = createHmac('sha256', secret).update(`${TOKEN_SCOPE}:${userId}:${tokenVersion}`).digest('hex').slice(0, 32);
  return `${userId}.${signature}`;
}

/** The user a token names, read before its signature can be checked against that user's version. */
export function calendarTokenUserId(token: string): number | null {
  const match = TOKEN_PATTERN.exec(token);
  const userId = match ? Number(match[1]) : Number.NaN;
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

export function isCalendarTokenValid(token: string, userId: number, tokenVersion: number, secret: string): boolean {
  const expected = Buffer.from(calendarToken(userId, tokenVersion, secret));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// ---------------------------------------------------------------------------
// The calendar itself, RFC 5545: CRLF line ends, escaped text, long lines folded.

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** A content line longer than 75 octets continues on the next line behind one space. */
function fold(line: string): string[] {
  if (line.length <= 74) return [line];
  const parts: string[] = [line.slice(0, 74)];
  for (let at = 74; at < line.length; at += 73) parts.push(' ' + line.slice(at, at + 73));
  return parts;
}

/** `YYYY-MM-DD` as the basic date an all-day event uses. */
function basicDate(isoDay: string): string {
  return isoDay.replaceAll('-', '');
}

function addDays(isoDay: string, days: number): string {
  const [year, month, day] = isoDay.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function timestamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function localDay(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function summaryFor(name: string, volume: string): string {
  return `${name} \u2013 ${/^\d/.test(volume) ? `Vol. ${volume}` : volume}`;
}

function event(uid: string, day: string, summary: string, stamp: string, extras: string[]): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${basicDate(day)}`,
    `DTEND;VALUE=DATE:${basicDate(addDays(day, 1))}`,
    `SUMMARY:${escapeText(summary)}`,
    'TRANSP:TRANSPARENT',
    ...extras,
    'END:VEVENT',
  ];
}

/**
 * All-day events for every dated upcoming volume, and a monthly "look for a date" reminder for
 * each unfinished series that still has an undated one. Event ids are stable, so a calendar app
 * that polls the link updates events in place instead of duplicating them.
 */
export function buildReleaseCalendar(series: readonly SeriesReleaseOverviewSeries[], now: Date = new Date()): string {
  const stamp = timestamp(now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BookOrbit//Series Releases//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Upcoming volumes',
  ];

  for (const entry of series) {
    for (const release of entry.releases) {
      if (!release.releaseDate) continue;
      const extras: string[] = [];
      if (release.note) extras.push(`DESCRIPTION:${escapeText(release.note)}`);
      if (release.storeUrl) extras.push(`URL:${escapeText(release.storeUrl)}`);
      lines.push(
        ...event(`release-${release.id}@bookorbit-series-releases`, release.releaseDate, summaryFor(entry.name, release.volume), stamp, extras),
      );
    }

    if (!entry.finished && entry.releases.some((release) => release.releaseDate === null)) {
      const checkDay = addDays(entry.checkedAt ?? localDay(now), CALENDAR_CHECK_EVERY_DAYS);
      lines.push(
        ...event(`check-${entry.seriesId}@bookorbit-series-releases`, checkDay, `Look for a release date: ${entry.name}`, stamp, [
          'RRULE:FREQ=MONTHLY',
        ]),
      );
    }
  }

  lines.push('END:VCALENDAR');
  return lines.flatMap(fold).join('\r\n') + '\r\n';
}
