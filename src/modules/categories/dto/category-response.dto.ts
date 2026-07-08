import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicSubCategoryResponseDto {
  @ApiProperty({ description: 'Sub-category ID', example: 'ckvsub123' })
  id: string;

  @ApiProperty({
    description: 'Sub-category display name',
    example: 'Evening Dresses',
  })
  name: string;

  @ApiProperty({ description: 'Sub-category slug', example: 'evening-dresses' })
  slug: string;

  @ApiProperty({
    description: 'Number of active products in this sub-category',
    example: 4,
  })
  productCount: number;
}

export class PublicCategoryResponseDto {
  @ApiProperty({ description: 'Category ID', example: 'ckvcat123' })
  id: string;

  @ApiProperty({ description: 'Category display name', example: 'Dresses' })
  name: string;

  @ApiProperty({ description: 'Category slug', example: 'dresses' })
  slug: string;

  @ApiPropertyOptional({
    description: 'Cloudinary category image URL',
    example: 'https://res.cloudinary.com/demo/image/upload/dresses.jpg',
    nullable: true,
  })
  imageUrl: string | null;

  @ApiProperty({
    description: 'Number of active products in this category',
    example: 12,
  })
  productCount: number;

  @ApiProperty({
    description: 'Sub-categories',
    type: [PublicSubCategoryResponseDto],
  })
  subCategories: PublicSubCategoryResponseDto[];
}

export class AdminSubCategorySummaryDto {
  @ApiProperty({ description: 'Sub-category ID', example: 'ckvsub123' })
  id: string;

  @ApiProperty({
    description: 'Sub-category display name',
    example: 'Evening Dresses',
  })
  name: string;

  @ApiProperty({ description: 'Sub-category slug', example: 'evening-dresses' })
  slug: string;
}

export class AdminCategoryResponseDto {
  @ApiProperty({ description: 'Category ID', example: 'ckvcat123' })
  id: string;

  @ApiProperty({ description: 'Category display name', example: 'Dresses' })
  name: string;

  @ApiProperty({ description: 'Category slug', example: 'dresses' })
  slug: string;

  @ApiPropertyOptional({
    description: 'Cloudinary category image public ID',
    example: 'categories/dresses',
    nullable: true,
  })
  imageId: string | null;

  @ApiPropertyOptional({
    description: 'Cloudinary category image URL',
    example: 'https://res.cloudinary.com/demo/image/upload/dresses.jpg',
    nullable: true,
  })
  imageUrl: string | null;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-07-08T12:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Sub-categories',
    type: [AdminSubCategorySummaryDto],
  })
  subCategories: AdminSubCategorySummaryDto[];
}
