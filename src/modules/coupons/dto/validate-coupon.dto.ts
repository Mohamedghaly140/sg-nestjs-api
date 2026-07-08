import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';

export const COUPON_CODE_PATTERN = /^[A-Z0-9_-]{3,30}$/;

function normalizeCouponCode(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class ValidateCouponDto {
  @ApiProperty({
    description:
      'Coupon code. The value is trimmed and normalized to uppercase before validation.',
    pattern: COUPON_CODE_PATTERN.source,
    example: 'SAVE20',
  })
  @Transform(({ value }: { value: unknown }) => normalizeCouponCode(value))
  @IsString()
  @Matches(COUPON_CODE_PATTERN)
  code!: string;

  @ApiPropertyOptional({
    description:
      'Guest email used for the per-user coupon limit check. Omit to preview without an identity.',
    example: 'customer@example.com',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @IsEmail()
  email?: string;
}

export class ValidateCouponResponseDto {
  @ApiProperty({
    description: 'Validation result. Successful responses are always true.',
    example: true,
  })
  valid!: true;

  @ApiProperty({ description: 'Normalized coupon code', example: 'SAVE20' })
  code!: string;

  @ApiProperty({
    description: 'Coupon discount percentage',
    type: String,
    example: '20.00',
  })
  discountPercent!: string;

  @ApiProperty({
    description: 'Discount amount applied to the current cart subtotal in EGP',
    type: String,
    example: '221.00',
  })
  discountApplied!: string;

  @ApiProperty({
    description: 'Current cart subtotal before coupon discount in EGP',
    type: String,
    example: '1105.00',
  })
  itemsSubtotal!: string;
}
