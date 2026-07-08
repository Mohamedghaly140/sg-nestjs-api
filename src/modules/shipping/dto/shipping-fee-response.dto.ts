import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ShippingZoneSummaryDto {
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
}

export class ShippingFeeResponseDto {
  @ApiProperty({
    description: 'Shipping fee in EGP',
    type: String,
    example: '65.00',
  })
  fee!: string;

  @ApiProperty({
    description: 'Matched shipping zone summary',
    type: ShippingZoneSummaryDto,
  })
  zone!: ShippingZoneSummaryDto;
}
