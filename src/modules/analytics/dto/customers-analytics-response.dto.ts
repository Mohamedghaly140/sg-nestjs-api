import { ApiProperty } from '@nestjs/swagger';
import type { AnalyticsGrouping } from '../utils/resolve-date-range.util';

export class NewCustomersOverTimePointDto {
  @ApiProperty({
    description: 'Bucket date in ISO date format',
    example: '2026-06-08',
  })
  date!: string;

  @ApiProperty({ description: 'New customer count', example: 3 })
  count!: number;
}

export class TopSpenderDto {
  @ApiProperty({ description: 'User ID', example: 'user_2abc' })
  id!: string;

  @ApiProperty({ description: 'Customer name', example: 'Sara Ahmed' })
  name!: string;

  @ApiProperty({ description: 'Customer email', example: 'sara@example.com' })
  email!: string;

  @ApiProperty({ description: 'Order count in range', example: 5 })
  ordersCount!: number;

  @ApiProperty({
    description:
      'Total paid spend in EGP (isPaid = true, excluding cancelled/refunded)',
    example: 6210,
  })
  totalSpent!: number;
}

export class CustomersAnalyticsResponseDto {
  @ApiProperty({ description: 'Total USER customers all time', example: 340 })
  totalCustomers!: number;

  @ApiProperty({ description: 'New USER customers in range', example: 25 })
  newThisPeriod!: number;

  @ApiProperty({
    description: 'USER customers with at least one order in range',
    example: 61,
  })
  activeThisPeriod!: number;

  @ApiProperty({
    description: 'Resolved time bucket grouping',
    enum: ['day', 'week', 'month'],
    example: 'day',
  })
  grouping!: AnalyticsGrouping;

  @ApiProperty({
    description: 'New customers grouped by resolved bucket',
    type: [NewCustomersOverTimePointDto],
  })
  newCustomersOverTime!: NewCustomersOverTimePointDto[];

  @ApiProperty({
    description: 'Top ten customers by spend in range',
    type: [TopSpenderDto],
  })
  topSpenders!: TopSpenderDto[];
}
