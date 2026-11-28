/** Where an upcoming volume stands. `collected` and `skipped` entries are kept as history. */
export const SERIES_RELEASE_STATUSES = ["upcoming", "collected", "skipped"] as const;
export type SeriesReleaseStatus = (typeof SERIES_RELEASE_STATUSES)[number];

export const SERIES_RELEASE_VOLUME_MAX_LENGTH = 60;
export const SERIES_RELEASE_URL_MAX_LENGTH = 2000;
export const SERIES_RELEASE_NOTE_MAX_LENGTH = 1000;
/** A cover is a link or a small downscaled picture stored inline, never a full-size upload. */
export const SERIES_RELEASE_COVER_MAX_LENGTH = 450_000;
/** Upcoming volumes one series can hold at a time. */
export const SERIES_RELEASE_MAX_OPEN_PER_SERIES = 20;
export const SERIES_RELEASE_IMPORT_MAX_ENTRIES = 2000;

/** A volume of a series that is not in the library yet, entered by hand. */
export interface SeriesRelease {
  id: number;
  seriesId: number;
  /** Free text as the publisher writes it: "6", "Vol. 6", "Omnibus 2". */
  volume: string;
  /** `YYYY-MM-DD`, or null while no date is known. */
  releaseDate: string | null;
  storeUrl: string | null;
  note: string | null;
  /** An `https` link or an inline `data:image` picture. */
  cover: string | null;
  status: SeriesReleaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SeriesReleaseTracking {
  seriesId: number;
  /** False until someone starts tracking the series. */
  tracking: boolean;
  /** No more volumes are expected, so none is suggested after the last one. */
  finished: boolean;
  /** The last day someone looked for a date, `YYYY-MM-DD`. */
  checkedAt: string | null;
}

export interface SeriesReleasesResponse {
  tracking: SeriesReleaseTracking;
  releases: SeriesRelease[];
  /** Whether the caller may change this series' releases. */
  canEdit: boolean;
  /** What the last MangaBaka licensing check made of this series; null when never checked. */
  license: SeriesLicense | null;
}

export interface SeriesReleaseInput {
  volume: string;
  releaseDate?: string | null;
  storeUrl?: string | null;
  note?: string | null;
  cover?: string | null;
}

export type SeriesReleaseUpdate = Partial<SeriesReleaseInput> & { status?: SeriesReleaseStatus };

/** Collecting a volume closes it and, unless the series is finished, opens the next one with no date. */
export interface SeriesReleaseCollectResult {
  collected: SeriesRelease;
  next: SeriesRelease | null;
}

export interface SeriesReleaseTrackingUpdate {
  tracking?: boolean;
  finished?: boolean;
  /** Mark the series as checked today. */
  checkedToday?: boolean;
}

/** One upcoming volume in the overview. Covers stay out so the whole answer loads in one small request. */
export interface SeriesReleaseOverviewRelease extends Pick<SeriesRelease, "id" | "volume" | "releaseDate" | "storeUrl" | "note"> {
  /**
   * Set when the volume has its own cover, served at `/api/v1/series-releases/{id}/cover`;
   * the number changes whenever the entry does, so it doubles as the cache-buster.
   */
  coverVersion?: number | null;
}

export interface SeriesReleaseOverviewSeries {
  seriesId: number;
  name: string;
  finished: boolean;
  /** Never null here: the day tracking started counts as the first check. */
  checkedAt: string | null;
  /** Nearest date first, volumes without a date last. */
  releases: SeriesReleaseOverviewRelease[];
  /** The latest volume the caller owns, whose cover stands in when a release has none. */
  coverBookId?: number | null;
  /** The caller's libraries that hold this series. */
  libraryIds?: number[];
  /** The licensing verdict with any override applied; null when never checked. */
  licensed?: boolean | null;
}

/** Every tracked series the caller can see: grid badges, the agenda page and the calendar read this. */
export interface SeriesReleasesOverviewResponse {
  series: SeriesReleaseOverviewSeries[];
}

/** Where this user's release calendar lives; the client prefixes its own origin. */
export interface SeriesReleaseCalendarInfo {
  path: string;
}

/** One entry of the `bookorbit-next-releases.json` backup the userscript wrote, as far as it is read. */
export interface SeriesReleaseImportEntry {
  /** BookOrbit's own series id. Entries without one cannot be placed. */
  sid?: number | string | null;
  title?: string | null;
  volume?: string | null;
  date?: string | null;
  store?: string | null;
  note?: string | null;
  cover?: string | null;
  finished?: boolean | null;
  checked?: string | null;
}

export interface SeriesReleaseImportRequest {
  entries: SeriesReleaseImportEntry[];
}

export interface SeriesReleaseImportResult {
  imported: number;
  skipped: { key: string; reason: string }[];
}

export type SeriesLicenseMatchedBy = "id" | "title";
export type SeriesLicenseOverride = "always" | "never";

export interface SeriesLicense {
  /** What MangaBaka said. The effective answer also honors `override`. */
  licensed: boolean;
  mangabakaId: string | null;
  matchedBy: SeriesLicenseMatchedBy | null;
  /** English publishers, comma-joined. */
  publishers: string | null;
  override: SeriesLicenseOverride | null;
  checkedAt: string;
}

export interface SeriesLicenseOverrideUpdate {
  override: SeriesLicenseOverride | null;
}

export interface SeriesLicensingSettings {
  /** The libraries whose series are checked against MangaBaka and auto-tracked. */
  libraryIds: number[];
}

export interface SeriesLicensingStatus {
  running: boolean;
  /** Dump lines read so far while a run is underway. */
  progressLines: number | null;
  lastRunAt: string | null;
  lastRunSeries: number | null;
  lastRunLicensed: number | null;
  lastRunError: string | null;
}

export interface SeriesLicensingOverview {
  settings: SeriesLicensingSettings;
  status: SeriesLicensingStatus;
}

/** MangaBaka library states (`state` of a library entry). */
export type MangabakaLibraryState = "considering" | "completed" | "dropped" | "paused" | "plan_to_read" | "reading" | "rereading";

/** What the last sync of a series did. */
export type MangabakaSyncOutcome = "created" | "updated" | "unchanged" | "skipped" | "error";

export interface MangabakaSyncResult {
  outcome: MangabakaSyncOutcome;
  /** Why it was skipped or failed, or what changed, in plain words. */
  message: string;
  mangabakaId: string | null;
  /** The series' page on mangabaka.org, as MangaBaka gives it. */
  url: string | null;
  /** The entry as BookOrbit worked it out (before "never lower" kept MangaBaka's higher numbers). */
  state: MangabakaLibraryState | null;
  progressChapter: number | null;
  progressVolume: number | null;
  syncedAt: string;
}

export interface MangabakaSyncSeriesSummary {
  seriesId: number;
  seriesName: string;
  last: MangabakaSyncResult | null;
}

export interface MangabakaSyncSettings {
  /** True once a personal access token is saved. The token itself is never sent back. */
  configured: boolean;
  /** Last 4 characters of the saved token. */
  tokenHint: string | null;
  enabled: boolean;
  /** A sync of every selected series is running. */
  running: boolean;
  series: MangabakaSyncSeriesSummary[];
}

export interface MangabakaSyncSettingsUpdate {
  /** A new personal access token ("mb-..."); an empty string removes the saved one. */
  apiToken?: string;
  enabled?: boolean;
}

export interface MangabakaSyncSeriesStatus {
  configured: boolean;
  enabled: boolean;
  selected: boolean;
  /** The MangaBaka series the books point at, when one is known. */
  mangabakaId: string | null;
  last: MangabakaSyncResult | null;
}
