import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ShippingZoneResponseDto {
  @ApiProperty({ description: 'Shipping zone ID', example: 'ckvzone123' })
  id!: string;

  @ApiProperty({ description: 'Zone country', example: 'Egypt' })
  country!: string;

  @ApiProperty({ description: 'Zone governorate', example: 'Cairo' })
  governorate!: string;

  @ApiPropertyOptional({
    description: 'Zone city. Null for governorate-wide zones.',
    nullable: true,
    example: 'Nasr City',
  })
  city!: string | null;

  @ApiProperty({
    description: 'Shipping fee in EGP',
    type: String,
    example: '65.00',
  })
  fee!: string;

  @ApiProperty({ description: 'Whether this zone is active', example: true })
  isActive!: boolean;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-07-09T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Update timestamp',
    example: '2026-07-09T12:30:00.000Z',
  })
  updatedAt!: Date;
}
