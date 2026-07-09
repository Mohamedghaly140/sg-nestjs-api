import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '../../../generated/prisma/client';
import { COUPON_CODE_PATTERN } from '../../coupons/dto/validate-coupon.dto';

function normalizeCouponCode(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CheckoutDto {
  @ApiProperty({
    description: 'Owned shipping address ID',
    example: 'ckvaddr123',
  })
  @IsString()
  shippingAddressId!: string;

  @ApiProperty({
    description: 'Payment method for the order',
    enum: PaymentMethod,
    enumName: 'PaymentMethod',
    example: PaymentMethod.CARD,
  })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({
    description:
      'Coupon code. Trimmed and normalized to uppercase before validation.',
    pattern: COUPON_CODE_PATTERN.source,
    example: 'SAVE20',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeCouponCode(value))
  @IsString()
  @Matches(COUPON_CODE_PATTERN)
  couponCode?: string;

  @ApiPropertyOptional({
    description: 'Customer notes for fulfillment',
    maxLength: 1000,
    example: 'Please call before delivery.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
