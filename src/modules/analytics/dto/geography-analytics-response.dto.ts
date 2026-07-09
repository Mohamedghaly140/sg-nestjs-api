import { ApiProperty } from '@nestjs/swagger';

export class GeographyAnalyticsRowDto {
  @ApiProperty({ description: 'Governorate name', example: 'Cairo' })
  governorate!: string;

  @ApiProperty({ description: 'Order count across all statuses', example: 120 })
  orderCount!: number;

  @ApiProperty({
    description:
      'Paid revenue in EGP (isPaid = true, excluding cancelled and refunded orders)',
    example: 61000,
  })
  revenue!: number;
}

export class GeographyAnalyticsResponseDto {
  @ApiProperty({
    description: 'Governorate aggregate rows ordered by order count descending',
    type: [GeographyAnalyticsRowDto],
  })
  rows!: GeographyAnalyticsRowDto[];
}
