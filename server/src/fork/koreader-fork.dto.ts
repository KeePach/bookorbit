import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MD5_HEX = /^[0-9a-f]{32}$/i;

export class CalibreResolveDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @Matches(UUID, { each: true })
  uuids!: string[];
}

export class FileHashItemDto {
  @IsInt()
  @Min(1)
  bookFileId!: number;

  @IsString()
  @Matches(MD5_HEX)
  hash!: string;
}

export class FileUpdatesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  @Min(1, { each: true })
  libraryIds?: number[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => FileHashItemDto)
  items!: FileHashItemDto[];
}

export class ReleaseLinksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => FileHashItemDto)
  items!: FileHashItemDto[];
}

export class ReopenBooksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  @Min(1, { each: true })
  bookIds!: number[];
}
