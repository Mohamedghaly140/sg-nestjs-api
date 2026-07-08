import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '../../../generated/prisma/client';

export class ProductCategorySummaryDto {
  @ApiProperty({ description: 'Category ID', example: 'ckvcat123' })
  id: string;

  @ApiProperty({ description: 'Category name', example: 'Dresses' })
  name: string;

  @ApiPropertyOptional({ description: 'Category slug', example: 'dresses' })
  slug?: string;
}

export class ProductSubCategorySummaryDto {
  @ApiProperty({ description: 'Sub-category ID', example: 'ckvsub123' })
  id: string;

  @ApiProperty({ description: 'Sub-category name', example: 'Evening Dresses' })
  name: string;

  @ApiPropertyOptional({
    description: 'Sub-category slug',
    example: 'evening-dresses',
  })
  slug?: string;
}

export class ProductImageResponseDto {
  @ApiProperty({ description: 'Product image row ID', example: 'ckvimage123' })
  id: string;

  @ApiPropertyOptional({
    description: 'Cloudinary public ID',
    example: 'products/satin/front',
    nullable: true,
  })
  imageId: string | null;

  @ApiPropertyOptional({
    description: 'Cloudinary secure URL',
    example: 'https://res.cloudinary.com/demo/image/upload/satin-front.jpg',
    nullable: true,
  })
  imageUrl: string | null;

  @ApiProperty({ description: 'Gallery sort order', example: 0 })
  sortOrder: number;
}

export class PublicProductCardDto {
  @ApiProperty({ description: 'Product ID', example: 'ckvprod123' })
  id: string;

  @ApiProperty({
    description: 'Product name',
    example: 'Satin Cowl-Neck Dress',
  })
  name: string;

  @ApiProperty({
    description: 'Product slug',
    example: 'satin-cowl-neck-dress',
  })
  slug: string;

  @ApiProperty({
    description: 'Cover image URL',
    example: 'https://res.cloudinary.com/demo/image/upload/satin.jpg',
  })
  imageUrl: string;

  @ApiProperty({
    description: 'Base price in EGP',
    type: String,
    example: '2400.00',
  })
  price: string;

  @ApiProperty({
    description: 'Discount percentage',
    type: String,
    example: '15.00',
  })
  discount: string;

  @ApiProperty({
    description: 'Discounted price in EGP',
    type: String,
    example: '2040.00',
  })
  priceAfterDiscount: string;

  @ApiPropertyOptional({
    description: 'Average rating',
    type: String,
    nullable: true,
    example: '4.5',
  })
  ratingsAverage: string | null;

  @ApiProperty({ description: 'Rating count', example: 2 })
  ratingsQuantity: number;

  @ApiProperty({ description: 'Featured flag', example: true })
  featured: boolean;

  @ApiProperty({
    description: 'Available sizes',
    type: [String],
    example: ['S', 'M'],
  })
  sizes: string[];

  @ApiProperty({
    description: 'Available colors',
    type: [String],
    example: ['Black'],
  })
  colors: string[];

  @ApiProperty({ description: 'Available quantity', example: 12 })
  quantity: number;
}

export class PublicProductDetailDto extends PublicProductCardDto {
  @ApiProperty({
    description: 'Description',
    example: 'Floor-length satin evening dress.',
  })
  description: string;

  @ApiProperty({ description: 'Category', type: ProductCategorySummaryDto })
  category: ProductCategorySummaryDto;

  @ApiProperty({
    description: 'Sub-categories',
    type: [ProductSubCategorySummaryDto],
  })
  subCategories: ProductSubCategorySummaryDto[];

  @ApiProperty({
    description: 'Gallery images',
    type: [ProductImageResponseDto],
  })
  images: ProductImageResponseDto[];
}

export class AdminProductListItemDto extends PublicProductCardDto {
  @ApiProperty({ description: 'Quantity sold', example: 3 })
  sold: number;

  @ApiProperty({
    description: 'Product status',
    enum: ProductStatus,
    enumName: 'ProductStatus',
    example: ProductStatus.ACTIVE,
  })
  status: ProductStatus;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-07-08T12:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({ description: 'Category', type: ProductCategorySummaryDto })
  category: ProductCategorySummaryDto;
}

export class AdminProductDetailDto extends AdminProductListItemDto {
  @ApiProperty({
    description: 'Description',
    example: 'Floor-length satin evening dress.',
  })
  description: string;

  @ApiProperty({
    description: 'Cover image public ID',
    example: 'products/satin/cover',
  })
  imageId: string;

  @ApiProperty({
    description: 'Update timestamp',
    example: '2026-07-08T12:30:00.000Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Sub-categories',
    type: [ProductSubCategorySummaryDto],
  })
  subCategories: ProductSubCategorySummaryDto[];

  @ApiProperty({
    description: 'Gallery images',
    type: [ProductImageResponseDto],
  })
  images: ProductImageResponseDto[];
}

export class AdminProductFormDto {
  @ApiProperty({ description: 'Product ID', example: 'ckvprod123' })
  id: string;

  @ApiProperty({
    description: 'Product name',
    example: 'Satin Cowl-Neck Dress',
  })
  name: string;

  @ApiProperty({
    description: 'Product slug',
    example: 'satin-cowl-neck-dress',
  })
  slug: string;

  @ApiProperty({
    description: 'Description',
    example: 'Floor-length satin evening dress.',
  })
  description: string;

  @ApiProperty({ description: 'Base price', type: String, example: '2400.00' })
  price: string;

  @ApiProperty({ description: 'Discount', type: String, example: '15.00' })
  discount: string;

  @ApiProperty({
    description: 'Discounted price',
    type: String,
    example: '2040.00',
  })
  priceAfterDiscount: string;

  @ApiProperty({ description: 'Quantity', example: 12 })
  quantity: number;

  @ApiProperty({ description: 'Sizes', type: [String], example: ['S', 'M'] })
  sizes: string[];

  @ApiProperty({ description: 'Colors', type: [String], example: ['Black'] })
  colors: string[];

  @ApiProperty({
    description: 'Cover image public ID',
    example: 'products/satin/cover',
  })
  imageId: string;

  @ApiProperty({
    description: 'Cover image URL',
    example: 'https://res.cloudinary.com/demo/image/upload/satin.jpg',
  })
  imageUrl: string;

  @ApiProperty({
    description: 'Status',
    enum: ProductStatus,
    enumName: 'ProductStatus',
  })
  status: ProductStatus;

  @ApiProperty({ description: 'Featured flag', example: false })
  featured: boolean;

  @ApiProperty({ description: 'Category ID', example: 'ckvcat123' })
  categoryId: string;

  @ApiProperty({
    description: 'Sub-category IDs',
    type: [String],
    example: ['ckvsub123'],
  })
  subCategoryIds: string[];

  @ApiProperty({
    description: 'Gallery images',
    type: [ProductImageResponseDto],
  })
  images: ProductImageResponseDto[];
}

export class ProductFilterOptionsDto {
  @ApiProperty({
    description: 'Category filter options',
    type: [ProductCategorySummaryDto],
  })
  categories: ProductCategorySummaryDto[];
}

export class ProductFormDataDto extends ProductFilterOptionsDto {
  @ApiProperty({
    description: 'Sub-category form options',
    type: [ProductSubCategorySummaryDto],
  })
  subCategories: Array<ProductSubCategorySummaryDto & { categoryId: string }>;
}

export class DeleteProductResponseDto {
  @ApiProperty({
    description: 'Whether the product was hard-deleted',
    example: true,
  })
  deleted: boolean;

  @ApiProperty({
    description: 'Whether the product was archived instead',
    example: false,
  })
  archived: boolean;
}

export class ProductFeaturedResponseDto {
  @ApiProperty({ description: 'Product ID', example: 'ckvprod123' })
  id: string;

  @ApiProperty({ description: 'Featured flag', example: true })
  featured: boolean;
}

export class ProductStatusResponseDto {
  @ApiProperty({ description: 'Product ID', example: 'ckvprod123' })
  id: string;

  @ApiProperty({
    description: 'Product status',
    enum: ProductStatus,
    enumName: 'ProductStatus',
    example: ProductStatus.ACTIVE,
  })
  status: ProductStatus;
}
