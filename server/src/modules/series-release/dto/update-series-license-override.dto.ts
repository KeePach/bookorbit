import { IsIn, IsOptional } from 'class-validator';

import type { SeriesLicenseOverride, SeriesLicenseOverrideUpdate } from '@bookorbit/types';

export class UpdateSeriesLicenseOverrideDto implements SeriesLicenseOverrideUpdate {
  /** `always` / `never`, or null to go back to what MangaBaka says. */
  @IsOptional()
  @IsIn(['always', 'never'])
  override: SeriesLicenseOverride | null = null;
}
