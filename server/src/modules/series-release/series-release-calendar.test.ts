import type { SeriesReleaseOverviewSeries } from '@bookorbit/types';

import { buildReleaseCalendar, calendarToken, calendarTokenUserId, isCalendarTokenValid } from './series-release-calendar';

const NOW = new Date('2026-11-15T01:00:00.000Z');

function series(overrides?: Partial<SeriesReleaseOverviewSeries>): SeriesReleaseOverviewSeries {
  return {
    seriesId: 3,
    name: 'Aki Sora',
    finished: false,
    checkedAt: '2026-11-01',
    releases: [{ id: 1, volume: '6', releaseDate: '2026-12-19', storeUrl: 'https://store.example/6', note: 'Pre-order, limited' }],
    ...overrides,
  };
}

describe('calendar tokens', () => {
  it('names the user, and only the right user, version and secret open it', () => {
    const token = calendarToken(7, 3, 'secret');

    expect(token).toMatch(/^7\.[0-9a-f]{32}$/);
    expect(calendarTokenUserId(token)).toBe(7);
    expect(isCalendarTokenValid(token, 7, 3, 'secret')).toBe(true);
    expect(isCalendarTokenValid(token, 7, 4, 'secret')).toBe(false);
    expect(isCalendarTokenValid(token, 8, 3, 'secret')).toBe(false);
    expect(isCalendarTokenValid(token, 7, 3, 'other')).toBe(false);
    expect(isCalendarTokenValid(`7.${'0'.repeat(32)}`, 7, 3, 'secret')).toBe(false);
  });

  it('reads no user out of a malformed token', () => {
    for (const token of ['', 'x.abc', '7', '7.', `0.${'a'.repeat(32)}`, `-1.${'a'.repeat(32)}`, `7.${'a'.repeat(31)}`]) {
      expect(calendarTokenUserId(token)).toBeNull();
    }
  });
});

describe('buildReleaseCalendar', () => {
  it('turns a dated volume into an all-day event with its note and store link', () => {
    const ics = buildReleaseCalendar([series()], NOW);

    expect(ics).toContain('UID:release-1@bookorbit-series-releases');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261219');
    expect(ics).toContain('DTEND;VALUE=DATE:20261220');
    expect(ics).toContain('SUMMARY:Aki Sora \u2013 Vol. 6');
    expect(ics).toContain('DESCRIPTION:Pre-order\\, limited');
    expect(ics).toContain('URL:https://store.example/6');
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('reminds monthly to look for a date, except for a finished series', () => {
    const undated = { id: 2, volume: 'Omnibus 2', releaseDate: null, storeUrl: null, note: null };
    const ics = buildReleaseCalendar(
      [series({ releases: [undated] }), series({ seriesId: 9, name: 'Done', finished: true, releases: [{ ...undated, id: 5 }] })],
      NOW,
    );

    expect(ics).toContain('UID:check-3@bookorbit-series-releases');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201');
    expect(ics).toContain('RRULE:FREQ=MONTHLY');
    expect(ics).toContain('SUMMARY:Look for a release date: Aki Sora');
    expect(ics).not.toContain('check-9@');
    expect(ics).not.toContain('release-2@');
    expect(ics).not.toContain('release-5@');
  });

  it('escapes calendar syntax in names and keeps every line inside the 75-octet limit', () => {
    const ics = buildReleaseCalendar(
      [
        series({
          name: 'Aki; Sora, Deluxe',
          releases: [{ id: 1, volume: '6', releaseDate: '2026-12-19', storeUrl: null, note: 'word '.repeat(60).trim() }],
        }),
      ],
      NOW,
    );

    expect(ics).toContain('SUMMARY:Aki\\; Sora\\, Deluxe \u2013 Vol. 6');
    expect(ics.split('\r\n').every((line) => line.length <= 75)).toBe(true);
    expect(ics).toContain('\r\n word');
  });

  it('is an empty but valid calendar when nothing is tracked', () => {
    const ics = buildReleaseCalendar([], NOW);

    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});
