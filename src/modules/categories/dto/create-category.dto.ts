import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Category display name. Slug is generated server-side',
    example: 'Dresses',
    maxLength: 120,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    description: 'Cloudinary public ID for the category image',
    example: 'categories/dresses',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  imageId?: string;

  @ApiPropertyOptional({
    description: 'Cloudinary secure URL for the category image',
    example: 'https://res.cloudinary.com/demo/image/upload/dresses.jpg',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;
}
