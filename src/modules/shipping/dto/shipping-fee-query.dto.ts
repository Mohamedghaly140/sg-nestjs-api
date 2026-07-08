import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ShippingFeeQueryDto {
  @ApiProperty({ description: 'Destination country', example: 'Egypt' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  country!: string;

  @ApiProperty({ description: 'Destination governorate', example: 'Cairo' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  governorate!: string;

  @ApiPropertyOptional({
    description: 'Destination city for a more specific fee match',
    example: 'Nasr City',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  city?: string;
}
