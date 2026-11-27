import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

import { BulkSelectionDto } from '../../../common/dto/bulk-selection.dto';

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsInt({ each: true })
  @Min(0, { each: true })
  removePages?: number[];
}

export class KccBatchConvertDto extends KccConvertDto {
  @ValidateNested()
  @Type(() => BulkSelectionDto)
  selection!: BulkSelectionDto;
}

export class KccJobListQueryDto {
  @IsOptional()
  @IsISO8601()
  since?: string;
}
