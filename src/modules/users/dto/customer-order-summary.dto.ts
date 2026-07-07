import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, PaymentMethod } from '../../../generated/prisma/client';

export class CustomerOrderSummaryDto {
  @ApiProperty({ description: 'Order ID', example: 'order_2abc123' })
  id: string;

  @ApiProperty({
    description: 'Human-readable order ID',
    example: 'ORD-900001',
  })
  humanOrderId: string;

  @ApiProperty({
    description: 'Current order status',
    enum: OrderStatus,
    enumName: 'OrderStatus',
    example: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @ApiProperty({
    description: 'Selected payment method',
    enum: PaymentMethod,
    enumName: 'PaymentMethod',
    example: PaymentMethod.CASH,
  })
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Total order price in EGP',
    example: 2115,
    nullable: true,
  })
  totalOrderPrice: number | null;

  @ApiProperty({ description: 'Whether the order is paid', example: false })
  isPaid: boolean;

  @ApiProperty({
    description: 'Order creation timestamp',
    example: '2026-07-06T12:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({ description: 'Number of line items in the order', example: 1 })
  itemsCount: number;
}
