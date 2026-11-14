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
