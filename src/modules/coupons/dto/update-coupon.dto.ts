import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';
import { CreateCouponDto } from './create-coupon.dto';

export class UpdateCouponDto extends PartialType(
  OmitType(CreateCouponDto, ['expire'] as const),
) {
  @ApiPropertyOptional({
    description:
      'Expiration timestamp. Past dates are allowed on update to expire immediately.',
    example: '2026-07-01T00:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expire?: Date;
}
