import { IsBoolean, IsOptional } from 'class-validator';

import type { SeriesReleaseTrackingUpdate } from '@bookorbit/types';

export class UpdateSeriesReleaseTrackingDto implements SeriesReleaseTrackingUpdate {
  @IsOptional()
  @IsBoolean()
  tracking?: boolean;

  @IsOptional()
  @IsBoolean()
  finished?: boolean;

  @IsOptional()
  @IsBoolean()
  checkedToday?: boolean;
}
