import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Min } from 'class-validator';

import type { KccConvertMode, KccOptionValues } from '@bookorbit/types';

export class KccPresetDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsObject()
  options!: KccOptionValues;
}

export class KccConvertDto {
  @IsIn(['replace', 'keep'])
  mode!: KccConvertMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  presetId?: number;

  @IsOptional()
  @IsObject()
  options?: KccOptionValues;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
