import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AddressResponseDto } from '../../addresses/dto/address-response.dto';
import { OrderItemResponseDto, OrderResponseDto } from './order-response.dto';

export class AdminOrderUserDto {
  @ApiProperty({ description: 'User ID', example: 'user_123' })
  id!: string;

  @ApiProperty({ description: 'User name', example: 'Sara Ghaly' })
  name!: string;

  @ApiProperty({ description: 'User email', example: 'sara@example.com' })
  email!: string;

  @ApiProperty({ description: 'User phone', example: '+201000000001' })
  phone!: string;
}

export class AdminOrderCouponDto {
  @ApiProperty({ description: 'Coupon code', example: 'SAVE20' })
  name!: string;

  @ApiProperty({
    description: 'Coupon discount percentage',
    type: String,
    example: '20.00',
  })
  discount!: string;
}

export class AdminOrderItemProductDto {
  @ApiProperty({ description: 'Product ID', example: 'ckvprod123' })
  id!: string;

  @ApiProperty({ description: 'Product name', example: 'Black Evening Dress' })
  name!: string;

  @ApiProperty({ description: 'Product slug', example: 'black-evening-dress' })
  slug!: string;

  @ApiProperty({
    description: 'Product image URL',
    example: 'https://res.cloudinary.com/demo/image/upload/dress.jpg',
  })
  imageUrl!: string;
}

export class AdminOrderItemResponseDto extends OrderItemResponseDto {
  @ApiProperty({
    description: 'Current product card for the order item',
    type: AdminOrderItemProductDto,
  })
  product!: AdminOrderItemProductDto;
}

export class AdminOrderDetailResponseDto extends OrderResponseDto {
  @ApiPropertyOptional({
    description: 'Registered user, null for guest orders',
    type: AdminOrderUserDto,
    nullable: true,
  })
  user!: AdminOrderUserDto | null;

  @ApiPropertyOptional({
    description: 'Registered shipping address, null for guest orders',
    type: AddressResponseDto,
    nullable: true,
  })
  shippingAddress!: AddressResponseDto | null;

  @ApiPropertyOptional({
    description: 'Guest contact name',
    example: 'Sara Ghaly',
    nullable: true,
  })
  anonName!: string | null;

  @ApiPropertyOptional({
    description: 'Guest contact phone',
    example: '+201000000001',
    nullable: true,
  })
  anonPhone!: string | null;

  @ApiPropertyOptional({
    description: 'Guest contact email',
    example: 'sara@example.com',
    nullable: true,
  })
  anonEmail!: string | null;

  @ApiPropertyOptional({
    description: 'Guest shipping country',
    example: 'Egypt',
    nullable: true,
  })
  anonCountry!: string | null;

  @ApiPropertyOptional({
    description: 'Guest shipping governorate',
    example: 'Cairo',
    nullable: true,
  })
  anonGovernorate!: string | null;

  @ApiPropertyOptional({
    description: 'Guest shipping city',
    example: 'Nasr City',
    nullable: true,
  })
  anonCity!: string | null;

  @ApiPropertyOptional({
    description: 'Guest shipping area',
    example: 'District 7',
    nullable: true,
  })
  anonArea!: string | null;

  @ApiPropertyOptional({
    description: 'Guest shipping phone',
    example: '+201000000002',
    nullable: true,
  })
  anonShippingPhone!: string | null;

  @ApiPropertyOptional({
    description: 'Guest shipping street address',
    example: '12 Mostafa El Nahas Street',
    nullable: true,
  })
  anonAddressLine1!: string | null;

  @ApiPropertyOptional({
    description: 'Guest shipping delivery details',
    example: 'Building 4, floor 3, apartment 8',
    nullable: true,
  })
  anonDetails!: string | null;

  @ApiPropertyOptional({
    description: 'Guest shipping postal code',
    example: 11765,
    nullable: true,
  })
  anonPostalCode!: number | null;

  @ApiPropertyOptional({
    description: 'Guest shipping latitude',
    example: 30.0444,
    nullable: true,
  })
  anonLatitude!: number | null;

  @ApiPropertyOptional({
    description: 'Guest shipping longitude',
    example: 31.2357,
    nullable: true,
  })
  anonLongitude!: number | null;

  @ApiProperty({
    description: 'Order items with product cards',
    type: [AdminOrderItemResponseDto],
  })
  declare items: AdminOrderItemResponseDto[];

  @ApiPropertyOptional({
    description: 'Coupon, null when no coupon was used',
    type: AdminOrderCouponDto,
    nullable: true,
  })
  coupon!: AdminOrderCouponDto | null;

  @ApiPropertyOptional({
    description: 'Geidea session ID',
    example: 'geidea-session-123',
    nullable: true,
  })
  geideaSessionId!: string | null;

  @ApiPropertyOptional({
    description: 'Geidea order ID',
    example: 'geidea-order-123',
    nullable: true,
  })
  geideaOrderId!: string | null;
}
