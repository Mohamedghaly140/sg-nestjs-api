import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ProductStatus } from '../../../generated/prisma/client';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateProductDto {
  @ApiProperty({
    description: 'Product display name. Slug is generated server-side',
    maxLength: 120,
    example: 'Satin Cowl-Neck Dress',
  })
  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({
    description: 'Product description',
    maxLength: 5000,
    example: 'Floor-length satin evening dress with a softly draped neckline.',
  })
  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description: string;

  @ApiProperty({
    description: 'Available stock quantity',
    minimum: 0,
    example: 12,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity: number;

  @ApiProperty({
    description: 'Base price in EGP',
    minimum: 0.01,
    example: 1299,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  price: number;

  @ApiPropertyOptional({
    description: 'Discount percentage from 0 to 70',
    minimum: 0,
    maximum: 70,
    default: 0,
    example: 15,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(70)
  discount?: number;

  @ApiProperty({
    description: 'Available sizes',
    type: [String],
    example: ['S', 'M'],
  })
  @IsArray()
  @IsString({ each: true })
  sizes: string[];

  @ApiProperty({
    description: 'Available colors',
    type: [String],
    example: ['Black'],
  })
  @IsArray()
  @IsString({ each: true })
  colors: string[];

  @ApiProperty({
    description: 'Cloudinary cover image public ID',
    example: 'products/satin/cover',
  })
  @IsString()
  @IsNotEmpty()
  imageId: string;

  @ApiProperty({
    description: 'Cloudinary cover image secure URL',
    example: 'https://res.cloudinary.com/demo/image/upload/satin.jpg',
  })
  @IsUrl({ require_tld: false })
  imageUrl: string;

  @ApiPropertyOptional({
    description: 'Product status',
    enum: ProductStatus,
    enumName: 'ProductStatus',
    default: ProductStatus.DRAFT,
    example: ProductStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({
    description: 'Featured flag',
    default: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @ApiProperty({ description: 'Primary category ID', example: 'ckvcat123' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiPropertyOptional({
    description:
      'Sub-category IDs. Every sub-category must belong to categoryId',
    type: [String],
    example: ['ckvsub123'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subCategoryIds?: string[];
}
