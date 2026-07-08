import { ApiProperty } from '@nestjs/swagger';

export class CouponResponseDto {
  @ApiProperty({ description: 'Coupon ID', example: 'ckvcoupon123' })
  id!: string;

  @ApiProperty({ description: 'Coupon code/name', example: 'SAVE20' })
  name!: string;

  @ApiProperty({
    description: 'Discount percentage',
    type: String,
    example: '20.00',
  })
  discount!: string;

  @ApiProperty({ description: 'Number of consumed uses', example: 3 })
  usedCount!: number;

  @ApiProperty({
    description: 'Maximum global usage count. Zero means unlimited.',
    example: 100,
  })
  maxUsage!: number;

  @ApiProperty({
    description: 'Maximum uses per user or guest email. Zero means unlimited.',
    example: 1,
  })
  perUserLimit!: number;

  @ApiProperty({
    description: 'Expiration timestamp',
    example: '2027-12-31T23:59:59.000Z',
  })
  expire!: Date;

  @ApiProperty({ description: 'Whether the coupon is active', example: true })
  isActive!: boolean;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-07-09T12:00:00.000Z',
  })
  createdAt!: Date;
}

export class DeactivateCouponResponseDto {
  @ApiProperty({ description: 'Coupon ID', example: 'ckvcoupon123' })
  id!: string;

  @ApiProperty({
    description: 'Coupon active flag after deactivation',
    example: false,
  })
  isActive!: false;
}
