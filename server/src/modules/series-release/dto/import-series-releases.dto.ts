import { ArrayMaxSize, IsArray, IsObject } from 'class-validator';

import { SERIES_RELEASE_IMPORT_MAX_ENTRIES, type SeriesReleaseImportEntry, type SeriesReleaseImportRequest } from '@bookorbit/types';

/**
 * Entries are not validated one by one here. The userscript's backup is read as far as it fits and
 * the rest is reported as skipped, so a file with one odd entry still imports the others.
 */
export class ImportSeriesReleasesDto implements SeriesReleaseImportRequest {
  @IsArray()
  @ArrayMaxSize(SERIES_RELEASE_IMPORT_MAX_ENTRIES)
  @IsObject({ each: true })
  entries!: SeriesReleaseImportEntry[];
}
