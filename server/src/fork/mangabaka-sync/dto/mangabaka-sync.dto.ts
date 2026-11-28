import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

import type { MangabakaSyncSettingsUpdate } from '@bookorbit/types';

export class MangabakaSyncSettingsDto implements MangabakaSyncSettingsUpdate {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiToken?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class MangabakaSyncSeriesDto {
  @IsBoolean()
  selected!: boolean;
}
