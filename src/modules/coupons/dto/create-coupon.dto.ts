import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { IsFutureDate } from '../../../common/validators/is-future-date.validator';
import { COUPON_CODE_PATTERN } from './validate-coupon.dto';

export function normalizeCouponName(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class CreateCouponDto {
  @ApiProperty({
    description:
      'Coupon code/name. The value is trimmed and normalized to uppercase.',
    pattern: COUPON_CODE_PATTERN.source,
    example: 'SAVE20',
  })
  @Transform(({ value }: { value: unknown }) => normalizeCouponName(value))
  @IsString()
  @Matches(COUPON_CODE_PATTERN)
  name!: string;

  @ApiProperty({
    description: 'Percentage discount from 1 to 70',
    minimum: 1,
    maximum: 70,
    example: 20,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(70)
  discount!: number;

  @ApiPropertyOptional({
    description: 'Maximum global usage count. Zero means unlimited.',
    minimum: 0,
    default: 0,
    example: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxUsage?: number;

  @ApiPropertyOptional({
    description: 'Maximum uses per user or guest email. Zero means unlimited.',
    minimum: 0,
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  perUserLimit?: number;

  @ApiProperty({
    description: 'Expiration timestamp. Must be in the future on create.',
    example: '2027-12-31T23:59:59.000Z',
  })
  @Type(() => Date)
  @IsDate()
  @IsFutureDate()
  expire!: Date;

  @ApiPropertyOptional({
    description: 'Whether the coupon is active.',
    default: true,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
