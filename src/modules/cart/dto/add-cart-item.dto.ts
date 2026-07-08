import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class AddCartItemDto {
  @ApiProperty({
    description: 'Product ID to add to the cart',
    example: 'ckvprod123',
  })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({
    description: 'Quantity to add. Must be at least 1',
    minimum: 1,
    example: 2,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Selected product color. Must exist in the product colors',
    example: 'Black',
  })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({
    description: 'Selected product size. Must exist in the product sizes',
    example: 'M',
  })
  @IsOptional()
  @IsString()
  size?: string;
}
