import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsString } from 'class-validator';
import { ProductStatus } from '../../../generated/prisma/client';

export class SetProductFeaturedDto {
  @ApiProperty({ description: 'Featured flag', example: true })
  @IsBoolean()
  featured: boolean;
}

export class SetProductStatusDto {
  @ApiProperty({
    description: 'Product status',
    enum: ProductStatus,
    enumName: 'ProductStatus',
    example: ProductStatus.ACTIVE,
  })
  @IsEnum(ProductStatus)
  status: ProductStatus;
}

export class ReorderProductImagesDto {
  @ApiProperty({
    description: 'Exact ordered list of product image record IDs',
    type: [String],
    example: ['ckvimage1', 'ckvimage2'],
  })
  @IsArray()
  @IsString({ each: true })
  order: string[];
}
