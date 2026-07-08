import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export class ProductGalleryImageDto {
  @ApiProperty({
    description: 'Cloudinary gallery image public ID',
    example: 'products/satin/front',
  })
  @IsString()
  @IsNotEmpty()
  imageId: string;

  @ApiProperty({
    description: 'Cloudinary gallery image secure URL',
    example: 'https://res.cloudinary.com/demo/image/upload/satin-front.jpg',
  })
  @IsUrl({ require_tld: false })
  imageUrl: string;

  @ApiPropertyOptional({
    description:
      'Gallery sort order. Defaults to the next available position when omitted',
    minimum: 0,
    example: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
