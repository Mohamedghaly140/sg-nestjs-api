import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSubCategoryDto {
  @ApiProperty({
    description: 'Sub-category display name. Slug is generated server-side',
    example: 'Evening Dresses',
    maxLength: 120,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({
    description: 'Parent category ID',
    example: 'ckvcat123',
  })
  @IsString()
  @IsNotEmpty()
  categoryId: string;
}
