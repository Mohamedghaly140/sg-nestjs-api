import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateAddressDto {
  @ApiProperty({ description: 'Address alias', example: 'Home' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  alias!: string;

  @ApiProperty({ description: 'Country', example: 'Egypt' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  country!: string;

  @ApiProperty({ description: 'Governorate', example: 'Cairo' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  governorate!: string;

  @ApiProperty({ description: 'City', example: 'Nasr City' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city!: string;

  @ApiProperty({ description: 'Area or district', example: 'District 7' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  area!: string;

  @ApiProperty({
    description: 'Delivery phone number',
    example: '+201000000002',
  })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsPhoneNumber('EG')
  phone!: string;

  @ApiProperty({
    description: 'Primary street address line',
    example: '12 Mostafa El Nahas Street',
  })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  addressLine1!: string;

  @ApiProperty({
    description: 'Additional delivery details',
    example: 'Building 4, floor 3, apartment 8',
  })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  details!: string;

  @ApiPropertyOptional({ description: 'Postal code', example: 11765 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999999)
  postalCode?: number;

  @ApiPropertyOptional({ description: 'Latitude coordinate', example: 30.0444 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude coordinate',
    example: 31.2357,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Whether this address should become the default address',
    default: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
