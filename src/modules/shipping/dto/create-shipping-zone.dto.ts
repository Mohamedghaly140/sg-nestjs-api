import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateShippingZoneDto {
  @ApiProperty({ description: 'Zone country', example: 'Egypt' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  country!: string;

  @ApiProperty({ description: 'Zone governorate', example: 'Cairo' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  governorate!: string;

  @ApiPropertyOptional({
    description: 'Zone city. Omit for a governorate-wide zone.',
    example: 'Nasr City',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  city?: string;

  @ApiProperty({
    description: 'Shipping fee in EGP',
    minimum: 0,
    example: 65,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fee!: number;

  @ApiPropertyOptional({
    description: 'Whether this shipping zone can be used for fee lookup.',
    default: true,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
