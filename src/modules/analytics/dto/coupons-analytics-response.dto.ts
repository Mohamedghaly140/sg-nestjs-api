import { ApiProperty } from '@nestjs/swagger';

export class CouponAnalyticsRowDto {
  @ApiProperty({ description: 'Coupon ID', example: 'ckvcoupon123' })
  id!: string;

  @ApiProperty({ description: 'Coupon name/code', example: 'SAVE20' })
  name!: string;

  @ApiProperty({ description: 'Discount percentage', example: 20 })
  discountPct!: number;

  @ApiProperty({
    description: 'Lifetime used count from the coupon row',
    example: 44,
  })
  usedCount!: number;

  @ApiProperty({
    description: 'Maximum usage count. Zero means unlimited.',
    example: 100,
  })
  maxUsage!: number;

  @ApiProperty({
    description: 'Expiration timestamp',
    example: '2026-12-31T23:59:59.000Z',
  })
  expire!: Date;

  @ApiProperty({
    description: 'Redemptions in the selected range',
    example: 12,
  })
  periodRedemptions!: number;

  @ApiProperty({
    description: 'Discount given in EGP for the selected range',
    example: 2400,
  })
  totalDiscountGiven!: number;
}

export class CouponsAnalyticsResponseDto {
  @ApiProperty({ description: 'Total coupons all time', example: 15 })
  totalCoupons!: number;

  @ApiProperty({
    description: 'Orders with a coupon in range across all statuses',
    example: 42,
  })
  totalRedemptions!: number;

  @ApiProperty({
    description: 'Discount given in EGP across all statuses',
    example: 8300,
  })
  totalDiscountGiven!: number;

  @ApiProperty({
    description: 'All coupons with selected-range redemption aggregates',
    type: [CouponAnalyticsRowDto],
  })
  coupons!: CouponAnalyticsRowDto[];
}
