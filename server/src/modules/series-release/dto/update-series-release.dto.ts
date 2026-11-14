import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import {
  SERIES_RELEASE_COVER_MAX_LENGTH,
  SERIES_RELEASE_NOTE_MAX_LENGTH,
  SERIES_RELEASE_STATUSES,
  SERIES_RELEASE_URL_MAX_LENGTH,
  SERIES_RELEASE_VOLUME_MAX_LENGTH,
  type SeriesReleaseStatus,
  type SeriesReleaseUpdate,
} from '@bookorbit/types';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

/** Every field is optional; `null` clears a date, link, note or cover. */
export class UpdateSeriesReleaseDto implements SeriesReleaseUpdate {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(SERIES_RELEASE_VOLUME_MAX_LENGTH)
  volume?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  releaseDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(SERIES_RELEASE_URL_MAX_LENGTH)
  storeUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(SERIES_RELEASE_NOTE_MAX_LENGTH)
  note?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(SERIES_RELEASE_COVER_MAX_LENGTH)
  cover?: string | null;

  @IsOptional()
  @IsIn(SERIES_RELEASE_STATUSES)
  status?: SeriesReleaseStatus;
}
