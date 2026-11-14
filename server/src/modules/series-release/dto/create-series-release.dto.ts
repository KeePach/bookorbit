import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import {
  SERIES_RELEASE_COVER_MAX_LENGTH,
  SERIES_RELEASE_NOTE_MAX_LENGTH,
  SERIES_RELEASE_URL_MAX_LENGTH,
  SERIES_RELEASE_VOLUME_MAX_LENGTH,
  type SeriesReleaseInput,
} from '@bookorbit/types';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class CreateSeriesReleaseDto implements SeriesReleaseInput {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(SERIES_RELEASE_VOLUME_MAX_LENGTH)
  volume!: string;

  /** Checked as a real calendar day by the service. */
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
}
