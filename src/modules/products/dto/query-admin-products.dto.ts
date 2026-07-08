import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { parseBooleanQuery } from '../../../common/utils/parse-boolean-query';
import { ProductStatus } from '../../../generated/prisma/client';

export class QueryAdminProductsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive search across product name and slug',
    maxLength: 100,
    example: 'dress',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by product status',
    enum: ProductStatus,
    enumName: 'ProductStatus',
    example: ProductStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({
    description: 'Filter by category ID',
    example: 'ckvcat123',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Filter by featured flag',
    example: true,
  })
  @IsOptional()
  @Transform(parseBooleanQuery)
  @IsBoolean()
  featured?: boolean;
}
