import { ArrayMaxSize, IsArray, IsInt, Min } from 'class-validator';

import type { SeriesLicensingSettings } from '@bookorbit/types';

export class UpdateSeriesLicensingSettingsDto implements SeriesLicensingSettings {
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  libraryIds!: number[];
}
