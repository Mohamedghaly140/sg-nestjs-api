import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, PaymentMethod } from '../../../generated/prisma/client';

export class OrderItemResponseDto {
  @ApiProperty({ description: 'Product ID', example: 'ckvprod123' })
  productId!: string;

  @ApiProperty({
    description: 'Product name at response time',
    example: 'Black Evening Dress',
  })
  name!: string;

  @ApiProperty({
    description: 'Product image URL',
    example: 'https://res.cloudinary.com/demo/image/upload/dress.jpg',
  })
  imageUrl!: string;

  @ApiProperty({ description: 'Quantity ordered', example: 2 })
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Selected color',
    example: 'Black',
    nullable: true,
  })
  color!: string | null;

  @ApiPropertyOptional({
    description: 'Selected size',
    example: 'M',
    nullable: true,
  })
  size!: string | null;

  @ApiProperty({
    description: 'Unit price snapshot in EGP',
    type: String,
    example: '552.50',
  })
  price!: string;

  @ApiProperty({
    description: 'Line total in EGP',
    type: String,
    example: '1105.00',
  })
  lineTotal!: string;
}

export class OrderResponseDto {
  @ApiProperty({ description: 'Order ID', example: 'ckvorder123' })
  id!: string;

  @ApiProperty({
    description: 'Human-readable order number',
    example: 'ORD-000042',
  })
  humanOrderId!: string;

  @ApiProperty({
    description: 'Order status',
    enum: OrderStatus,
    enumName: 'OrderStatus',
  })
  status!: OrderStatus;

  @ApiProperty({
    description: 'Payment method',
    enum: PaymentMethod,
    enumName: 'PaymentMethod',
  })
  paymentMethod!: PaymentMethod;

  @ApiProperty({ description: 'Order items', type: [OrderItemResponseDto] })
  items!: OrderItemResponseDto[];

  @ApiProperty({
    description: 'Items subtotal before shipping and coupon in EGP',
    type: String,
    example: '1105.00',
  })
  itemsSubtotal!: string;

  @ApiProperty({
    description: 'Discount amount applied in EGP',
    type: String,
    example: '221.00',
  })
  discountApplied!: string;

  @ApiProperty({
    description: 'Shipping fee in EGP',
    type: String,
    example: '65.00',
  })
  shippingFees!: string;

  @ApiProperty({
    description: 'Total order price in EGP',
    type: String,
    example: '949.00',
  })
  totalOrderPrice!: string;

  @ApiProperty({
    description: 'Whether the order has been paid',
    example: false,
  })
  isPaid!: boolean;

  @ApiProperty({
    description: 'Order creation timestamp',
    example: '2026-07-09T12:00:00.000Z',
  })
  createdAt!: Date;
}

export class GuestOrderResponseDto extends OrderResponseDto {
  @ApiProperty({
    description:
      'Claim token delivery marker. The actual token is only sent by email.',
    example: 'sent-by-email',
  })
  claimToken!: 'sent-by-email';
}
