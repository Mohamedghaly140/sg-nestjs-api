import { ApiProperty } from '@nestjs/swagger';

export class ProductAnalyticsTopProductDto {
  @ApiProperty({ description: 'Product ID', example: 'ckvprod123' })
  id!: string;

  @ApiProperty({ description: 'Product name', example: 'Silk Dress' })
  name!: string;

  @ApiProperty({ description: 'Category name', example: 'Dresses' })
  categoryName!: string;

  @ApiProperty({
    description:
      'Paid units sold in range (isPaid = true, excluding cancelled/refunded)',
    example: 20,
  })
  sold!: number;

  @ApiProperty({
    description:
      'Paid revenue in EGP (isPaid = true, excluding cancelled/refunded)',
    example: 12980,
  })
  revenue!: number;
}

export class RevenueByCategoryPointDto {
  @ApiProperty({ description: 'Category name', example: 'Dresses' })
  name!: string;

  @ApiProperty({
    description:
      'Paid revenue in EGP (isPaid = true, excluding cancelled/refunded)',
    example: 20110,
  })
  revenue!: number;
}

export class ProductsAnalyticsResponseDto {
  @ApiProperty({
    description:
      'Paid units sold in range (isPaid = true, excluding cancelled/refunded orders)',
    example: 214,
  })
  totalUnitsSold!: number;

  @ApiProperty({
    description: 'Active product count across the catalog',
    example: 52,
  })
  activeProductsCount!: number;

  @ApiProperty({ description: 'Active products with zero stock', example: 3 })
  outOfStockCount!: number;

  @ApiProperty({
    description: 'Top ten products by units sold in range',
    type: [ProductAnalyticsTopProductDto],
  })
  topProducts!: ProductAnalyticsTopProductDto[];

  @ApiProperty({
    description: 'Revenue by category in range',
    type: [RevenueByCategoryPointDto],
  })
  revenueByCategory!: RevenueByCategoryPointDto[];
}
