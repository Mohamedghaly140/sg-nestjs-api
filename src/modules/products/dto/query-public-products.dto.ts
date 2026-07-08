import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { parseBooleanQuery } from '../../../common/utils/parse-boolean-query';

export const PRODUCT_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
  'best_selling',
  'top_rated',
] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

function csv(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export class QueryPublicProductsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive search across product name and description',
    maxLength: 100,
    example: 'satin',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Category slug', example: 'dresses' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Sub-category slug',
    example: 'evening-dresses',
  })
  @IsOptional()
  @IsString()
  subCategory?: string;

  @ApiPropertyOptional({
    description: 'Minimum discounted price',
    minimum: 0,
    example: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({
    description: 'Maximum discounted price',
    minimum: 0,
    example: 2500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'Comma-separated size filters',
    example: 'S,M',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => csv(value))
  @IsString({ each: true })
  sizes?: string[];

  @ApiPropertyOptional({
    description: 'Comma-separated color filters',
    example: 'Black,Emerald',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => csv(value))
  @IsString({ each: true })
  colors?: string[];

  @ApiPropertyOptional({
    description: 'Filter by featured flag',
    example: true,
  })
  @IsOptional()
  @Transform(parseBooleanQuery)
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: PRODUCT_SORTS,
    example: 'newest',
  })
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort?: ProductSort;
}
