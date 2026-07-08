import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { parseBooleanQuery } from '../../../common/utils/parse-boolean-query';

export class QueryAdminCustomersDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Case-insensitive search across customer name, email, and phone',
    maxLength: 100,
    example: 'mariam',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by customer activation status',
    example: true,
  })
  @IsOptional()
  @Transform(parseBooleanQuery)
  @IsBoolean()
  active?: boolean;
}
