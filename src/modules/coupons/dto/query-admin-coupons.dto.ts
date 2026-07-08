import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export const COUPON_STATUS_VALUES = [
  'active',
  'expired',
  'exhausted',
  'deactivated',
] as const;

export type CouponLifecycleStatus = (typeof COUPON_STATUS_VALUES)[number];

export class QueryAdminCouponsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive search by coupon name',
    maxLength: 30,
    example: 'save',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(30)
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by derived coupon lifecycle status',
    enum: COUPON_STATUS_VALUES,
    enumName: 'CouponLifecycleStatus',
    example: 'active',
  })
  @IsOptional()
  @IsIn(COUPON_STATUS_VALUES)
  status?: CouponLifecycleStatus;
}
