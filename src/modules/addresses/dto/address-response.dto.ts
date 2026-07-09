import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddressResponseDto {
  @ApiProperty({ description: 'Address ID', example: 'ckvaddr123' })
  id!: string;

  @ApiProperty({ description: 'Address alias', example: 'Home' })
  alias!: string;

  @ApiProperty({ description: 'Country', example: 'Egypt' })
  country!: string;

  @ApiProperty({ description: 'Governorate', example: 'Cairo' })
  governorate!: string;

  @ApiProperty({ description: 'City', example: 'Nasr City' })
  city!: string;

  @ApiProperty({ description: 'Area or district', example: 'District 7' })
  area!: string;

  @ApiProperty({
    description: 'Delivery phone number',
    example: '+201000000002',
  })
  phone!: string;

  @ApiProperty({
    description: 'Primary street address line',
    example: '12 Mostafa El Nahas Street',
  })
  addressLine1!: string;

  @ApiProperty({
    description: 'Additional delivery details',
    example: 'Building 4, floor 3, apartment 8',
  })
  details!: string;

  @ApiPropertyOptional({
    description: 'Postal code',
    example: 11765,
    nullable: true,
  })
  postalCode!: number | null;

  @ApiPropertyOptional({
    description: 'Latitude coordinate',
    example: 30.0444,
    nullable: true,
  })
  latitude!: number | null;

  @ApiPropertyOptional({
    description: 'Longitude coordinate',
    example: 31.2357,
    nullable: true,
  })
  longitude!: number | null;

  @ApiProperty({
    description: 'Whether this is the default address',
    example: true,
  })
  isDefault!: boolean;

  @ApiProperty({
    description: 'Address creation timestamp',
    example: '2026-07-09T12:00:00.000Z',
  })
  createdAt!: Date;
}
