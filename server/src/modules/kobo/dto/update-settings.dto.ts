import {
  KOBO_KEPUB_CUSTOM_CSS_MAX_LENGTH,
  KOBO_KEPUB_TITLE_PAGE_MODES,
  READ_ALOUD_DELIVERY_VARIANTS,
  type KoboKepubTitlePageMode,
  type ReadAloudDeliveryPreference,
} from '@bookorbit/types';
import { IsIn, IsNumber, IsOptional, IsInt, IsBoolean, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(READ_ALOUD_DELIVERY_VARIANTS)
  readAloudDelivery?: ReadAloudDeliveryPreference;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(10)
  readingThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(75)
  @Max(100)
  finishedThreshold?: number;

  @IsOptional()
  @IsBoolean()
  convertToKepub?: boolean;

  @IsOptional()
  @IsBoolean()
  forceEnableHyphenation?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(KOBO_KEPUB_CUSTOM_CSS_MAX_LENGTH)
  @Matches(/^[^<\0]*$/, { message: 'kepubCustomCss must not contain "<"' })
  kepubCustomCss?: string;

  @IsOptional()
  @IsBoolean()
  kepubFullscreenReadingFixes?: boolean;

  @IsOptional()
  @IsIn(KOBO_KEPUB_TITLE_PAGE_MODES)
  kepubTitlePage?: KoboKepubTitlePageMode;

  @IsOptional()
  @IsBoolean()
  kepubDetectCover?: boolean;

  @IsOptional()
  @IsBoolean()
  twoWayProgressSync?: boolean;

  @IsOptional()
  @IsBoolean()
  syncBookOrbitAnnotationsToKobo?: boolean;

  @IsOptional()
  @IsBoolean()
  storeSync?: boolean;

  @IsOptional()
  @IsBoolean()
  fullSizeCovers?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  kepubConversionLimitMb?: number;
}
