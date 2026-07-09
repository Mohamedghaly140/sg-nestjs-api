import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CheckoutDto } from './checkout.dto';

function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class GuestContactDto {
  @ApiProperty({ description: 'Guest full name', example: 'Sara Ghaly' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ description: 'Guest phone number', example: '+201000000001' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsPhoneNumber('EG')
  phone!: string;

  @ApiProperty({
    description: 'Guest email address',
    example: 'sara@example.com',
  })
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @IsEmail()
  email!: string;
}

export class GuestShippingDto {
  @ApiProperty({ description: 'Shipping country', example: 'Egypt' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  country!: string;

  @ApiProperty({ description: 'Shipping governorate', example: 'Cairo' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  governorate!: string;

  @ApiProperty({ description: 'Shipping city', example: 'Nasr City' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city!: string;

  @ApiProperty({
    description: 'Shipping area or district',
    example: 'District 7',
  })
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
}

export class GuestCheckoutDto extends OmitType(CheckoutDto, [
  'shippingAddressId',
] as const) {
  @ApiProperty({
    description: 'Guest contact information',
    type: GuestContactDto,
  })
  @ValidateNested()
  @Type(() => GuestContactDto)
  contact!: GuestContactDto;

  @ApiProperty({
    description: 'Guest shipping destination',
    type: GuestShippingDto,
  })
  @ValidateNested()
  @Type(() => GuestShippingDto)
  shipping!: GuestShippingDto;
}
