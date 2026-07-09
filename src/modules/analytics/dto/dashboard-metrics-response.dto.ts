import { ApiProperty } from '@nestjs/swagger';
import {
  OrderStatus,
  PaymentMethod,
  ProductStatus,
} from '../../../generated/prisma/client';

export class MetricWindowDto {
  @ApiProperty({
    description:
      'Current window value (revenue/avgOrderValue are paid-only: isPaid = true, excluding cancelled/refunded)',
    example: 45200.5,
  })
  current!: number;

  @ApiProperty({
    description:
      'Previous window value (revenue/avgOrderValue are paid-only: isPaid = true, excluding cancelled/refunded)',
    example: 39100,
  })
  previous!: number;
}

export class OrdersByStatusPointDto {
  @ApiProperty({
    description: 'Order status',
    enum: OrderStatus,
    enumName: 'OrderStatus',
    example: OrderStatus.PENDING,
  })
  status!: OrderStatus;

  @ApiProperty({ description: 'Number of orders', example: 7 })
  count!: number;
}

export class RevenueByDayPointDto {
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

export class RecentOrderDto {
  @ApiProperty({ description: 'Order ID', example: 'ckvorder123' })
  id!: string;

  @ApiProperty({
    description: 'Human-readable order number',
    example: 'ORD-000042',
  })
  humanOrderId!: string;

  @ApiProperty({ description: 'Customer display name', example: 'Sara Ahmed' })
  customerName!: string;

  @ApiProperty({
    description: 'Order status',
    enum: OrderStatus,
    enumName: 'OrderStatus',
    example: OrderStatus.PENDING,
  })
  status!: OrderStatus;

  @ApiProperty({
    description: 'Payment method',
    enum: PaymentMethod,
    enumName: 'PaymentMethod',
    example: PaymentMethod.CASH,
  })
  paymentMethod!: PaymentMethod;

  @ApiProperty({ description: 'Total order price in EGP', example: 949 })
  totalOrderPrice!: number;

  @ApiProperty({
    description: 'Order creation timestamp',
    example: '2026-07-09T12:00:00.000Z',
  })
  createdAt!: Date;
}

export class DashboardTopProductDto {
  @ApiProperty({ description: 'Product ID', example: 'ckvprod123' })
  id!: string;

  @ApiProperty({ description: 'Product name', example: 'Silk Dress' })
  name!: string;

  @ApiProperty({
    description: 'Product image URL',
    example: 'https://example.test/dress.jpg',
  })
  imageUrl!: string;

  @ApiProperty({ description: 'Category name', example: 'Dresses' })
  categoryName!: string;

  @ApiProperty({
    description:
      'Paid product revenue in EGP (isPaid = true, excluding cancelled/refunded)',
    example: 12980,
  })
  revenue!: number;

  @ApiProperty({
    description:
      'Paid units sold (isPaid = true, excluding cancelled/refunded)',
    example: 20,
  })
  units!: number;
}

export class LowStockProductDto {
  @ApiProperty({ description: 'Product ID', example: 'ckvprod123' })
  id!: string;

  @ApiProperty({ description: 'Product name', example: 'Silk Dress' })
  name!: string;

  @ApiProperty({ description: 'Current stock quantity', example: 4 })
  quantity!: number;

  @ApiProperty({ description: 'Category name', example: 'Dresses' })
  categoryName!: string;

  @ApiProperty({
    description: 'Product status',
    enum: ProductStatus,
    enumName: 'ProductStatus',
    example: ProductStatus.ACTIVE,
  })
  status!: ProductStatus;
}

export class DashboardMetricsResponseDto {
  @ApiProperty({
    description: 'Revenue window comparison',
    type: MetricWindowDto,
  })
  revenue!: MetricWindowDto;

  @ApiProperty({
    description: 'Order count window comparison',
    type: MetricWindowDto,
  })
  orders!: MetricWindowDto;

  @ApiProperty({
    description: 'New customer window comparison',
    type: MetricWindowDto,
  })
  newCustomers!: MetricWindowDto;

  @ApiProperty({
    description: 'Average order value window comparison',
    type: MetricWindowDto,
  })
  avgOrderValue!: MetricWindowDto;

  @ApiProperty({ description: 'All-time pending order count', example: 7 })
  pendingOrders!: number;

  @ApiProperty({ description: 'Active low-stock product count', example: 4 })
  lowStockCount!: number;

  @ApiProperty({
    description: 'Active and unexhausted coupon count',
    example: 3,
  })
  activeCoupons!: number;

  @ApiProperty({
    description: 'All-time orders grouped by status',
    type: [OrdersByStatusPointDto],
  })
  ordersByStatus!: OrdersByStatusPointDto[];

  @ApiProperty({
    description: 'Trailing 30-day revenue series',
    type: [RevenueByDayPointDto],
  })
  revenueByDay!: RevenueByDayPointDto[];

  @ApiProperty({
    description: 'Ten most recent orders',
    type: [RecentOrderDto],
  })
  recentOrders!: RecentOrderDto[];

  @ApiProperty({
    description: 'Top products by all-time item revenue',
    type: [DashboardTopProductDto],
  })
  topProducts!: DashboardTopProductDto[];

  @ApiProperty({
    description: 'Active products with quantity below ten',
    type: [LowStockProductDto],
  })
  lowStockProducts!: LowStockProductDto[];
}
