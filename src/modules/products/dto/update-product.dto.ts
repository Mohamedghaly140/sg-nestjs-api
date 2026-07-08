import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ProductStatus } from '../../../generated/prisma/client';
import { CreateProductDto } from './create-product.dto';
import { ProductGalleryImageDto } from './product-gallery-image.dto';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({
    description: 'Product display name. Slug is generated server-side',
    maxLength: 120,
    example: 'Satin Cowl-Neck Dress',
  })
  @Transform(({ value }: { value: unknown }) => trim(value))
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  declare name?: string;

  @ApiPropertyOptional({
    description: 'Product description',
    maxLength: 5000,
    example: 'Floor-length satin evening dress with a softly draped neckline.',
  })
  @Transform(({ value }: { value: unknown }) => trim(value))
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  declare description?: string;

  @ApiPropertyOptional({
    description: 'Available stock quantity',
    minimum: 0,
    example: 12,
  })
  @Type(() => Number)
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  declare quantity?: number;

  @ApiPropertyOptional({
    description: 'Base price in EGP',
    minimum: 0.01,
    example: 1299,
  })
  @Type(() => Number)
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  declare price?: number;

  @ApiPropertyOptional({
    description: 'Discount percentage from 0 to 70',
    minimum: 0,
    maximum: 70,
    default: 0,
    example: 15,
  })
  @Type(() => Number)
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(70)
  declare discount?: number;

  @ApiPropertyOptional({
    description: 'Available sizes',
    type: [String],
    example: ['S', 'M'],
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsArray()
  @IsString({ each: true })
  declare sizes?: string[];

  @ApiPropertyOptional({
    description: 'Available colors',
    type: [String],
    example: ['Black'],
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsArray()
  @IsString({ each: true })
  declare colors?: string[];

  @ApiPropertyOptional({
    description: 'Cloudinary cover image public ID',
    example: 'products/satin/cover',
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  declare imageId?: string;

  @ApiPropertyOptional({
    description: 'Cloudinary cover image secure URL',
    example: 'https://res.cloudinary.com/demo/image/upload/satin.jpg',
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsUrl({ require_tld: false })
  declare imageUrl?: string;

  @ApiPropertyOptional({
    description: 'Product status',
    enum: ProductStatus,
    enumName: 'ProductStatus',
    default: ProductStatus.DRAFT,
    example: ProductStatus.ACTIVE,
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEnum(ProductStatus)
  declare status?: ProductStatus;

  @ApiPropertyOptional({
    description: 'Featured flag',
    default: false,
    example: true,
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  declare featured?: boolean;

  @ApiPropertyOptional({
    description: 'Primary category ID',
    example: 'ckvcat123',
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  declare categoryId?: string;

  @ApiPropertyOptional({
    description:
      'Complete desired gallery image set, diffed by Cloudinary imageId',
    type: [ProductGalleryImageDto],
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductGalleryImageDto)
  images?: ProductGalleryImageDto[];
}
