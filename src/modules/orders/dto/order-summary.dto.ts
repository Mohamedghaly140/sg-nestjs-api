import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, PaymentMethod } from '../../../generated/prisma/client';

export class OrderSummaryDto {
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

  @ApiProperty({
    description: 'Whether the order has been paid',
    example: false,
  })
  isPaid!: boolean;

  @ApiProperty({
    description: 'Total order price in EGP',
    type: String,
    example: '949.00',
  })
  totalOrderPrice!: string;

  @ApiProperty({
    description: 'Shipping fee in EGP',
    type: String,
    example: '65.00',
  })
  shippingFees!: string;

  @ApiProperty({
    description: 'Discount amount applied in EGP',
    type: String,
    example: '221.00',
  })
  discountApplied!: string;

  @ApiProperty({
    description: 'Order creation timestamp',
    example: '2026-07-09T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({ description: 'Number of order items', example: 2 })
  itemsCount!: number;
}
