import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, PaymentMethod } from '../../../generated/prisma/client';
import type { AnalyticsGrouping } from '../utils/resolve-date-range.util';

export class RevenueOverTimePointDto {
  @ApiProperty({
    description: 'Bucket date in ISO date format',
    example: '2026-06-08',
  })
  date!: string;

  @ApiProperty({
    description:
      'Paid revenue in EGP (isPaid = true, excluding cancelled/refunded)',
    example: 1240,
  })
  revenue!: number;
}

export class SalesOrdersByStatusPointDto {
  @ApiProperty({
    description: 'Order status',
    enum: OrderStatus,
    enumName: 'OrderStatus',
    example: OrderStatus.PENDING,
  })
  status!: OrderStatus;

  @ApiProperty({ description: 'Order count', example: 7 })
  count!: number;
}

export class PaymentMethodSplitPointDto {
  @ApiProperty({
    description: 'Payment method',
    enum: PaymentMethod,
    enumName: 'PaymentMethod',
    example: PaymentMethod.CASH,
  })
  method!: PaymentMethod;

  @ApiProperty({ description: 'Order count', example: 61 })
  count!: number;
}

export class SalesAnalyticsResponseDto {
  @ApiProperty({
    description:
      'Paid revenue in EGP (isPaid = true, excluding cancelled and refunded orders)',
    example: 45200.5,
  })
  totalRevenue!: number;

  @ApiProperty({
    description: 'Order count in range across all statuses',
    example: 88,
  })
  totalOrders!: number;

  @ApiProperty({
    description:
      'Paid revenue divided by paid order count in range (0 when no paid orders)',
    example: 513.6,
  })
  avgOrderValue!: number;

  @ApiProperty({
    description: 'Discount applied in range across all statuses',
    example: 1200,
  })
  totalDiscountApplied!: number;

  @ApiProperty({
    description: 'Resolved time bucket grouping',
    enum: ['day', 'week', 'month'],
    example: 'day',
  })
  grouping!: AnalyticsGrouping;

  @ApiProperty({
    description: 'Revenue series by resolved bucket',
    type: [RevenueOverTimePointDto],
  })
  revenueOverTime!: RevenueOverTimePointDto[];

  @ApiProperty({
    description: 'Orders grouped by status in range',
    type: [SalesOrdersByStatusPointDto],
  })
  ordersByStatus!: SalesOrdersByStatusPointDto[];

  @ApiProperty({
    description: 'Orders grouped by payment method in range',
    type: [PaymentMethodSplitPointDto],
  })
  paymentMethodSplit!: PaymentMethodSplitPointDto[];
}
