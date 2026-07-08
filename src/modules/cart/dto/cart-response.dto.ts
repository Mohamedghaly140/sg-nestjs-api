import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '../../../generated/prisma/client';

export class CartProductDto {
  @ApiProperty({ description: 'Product ID', example: 'ckvprod123' })
  id!: string;

  @ApiProperty({ description: 'Product name', example: 'Satin Dress' })
  name!: string;

  @ApiProperty({ description: 'Product slug', example: 'satin-dress' })
  slug!: string;

  @ApiProperty({
    description: 'Product cover image URL',
    example: 'https://res.cloudinary.com/demo/image/upload/satin.jpg',
  })
  imageUrl!: string;

  @ApiProperty({
    description: 'Current discounted product price in EGP',
    type: String,
    example: '1105.00',
  })
  priceAfterDiscount!: string;

  @ApiProperty({ description: 'Current product stock quantity', example: 8 })
  quantity!: number;

  @ApiProperty({
    description: 'Current product status',
    enum: ProductStatus,
    enumName: 'ProductStatus',
    example: ProductStatus.ACTIVE,
  })
  status!: ProductStatus;
}

export class CartItemResponseDto {
  @ApiProperty({ description: 'Cart item ID', example: 'ckvcartitem123' })
  id!: string;

  @ApiProperty({ description: 'Product summary', type: CartProductDto })
  product!: CartProductDto;

  @ApiProperty({ description: 'Line quantity', example: 2 })
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Selected color',
    nullable: true,
    example: 'Black',
  })
  color!: string | null;

  @ApiPropertyOptional({
    description: 'Selected size',
    nullable: true,
    example: 'M',
  })
  size!: string | null;

  @ApiProperty({
    description: 'Line price snapshot in EGP',
    type: String,
    example: '1105.00',
  })
  price!: string;

  @ApiProperty({
    description: 'Line total from snapshot price and quantity in EGP',
    type: String,
    example: '2210.00',
  })
  lineTotal!: string;
}

export class CartResponseDto {
  @ApiPropertyOptional({
    description: 'Cart ID. Null for a virtual empty cart',
    nullable: true,
    example: 'ckvcart123',
  })
  id!: string | null;

  @ApiProperty({ description: 'Cart lines', type: [CartItemResponseDto] })
  items!: CartItemResponseDto[];

  @ApiProperty({
    description: 'Cart total from live product base prices',
    type: String,
    example: '1300.00',
  })
  totalCartPrice!: string;

  @ApiProperty({
    description: 'Cart total from live product discounted prices',
    type: String,
    example: '1105.00',
  })
  totalPriceAfterDiscount!: string;

  @ApiPropertyOptional({
    description: 'Anonymous cart expiry timestamp. Null for user carts',
    nullable: true,
    example: '2026-07-16T04:00:00.000Z',
  })
  expiresAt!: Date | null;

  @ApiPropertyOptional({
    description:
      'Anonymous cart session token returned only on first anonymous mutation',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sessionToken?: string;
}
