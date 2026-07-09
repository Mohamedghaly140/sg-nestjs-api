import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class QueryAnalyticsRangeDto {
  @ApiPropertyOptional({
    description: 'Start date for the analytics range, inclusive',
    example: '2026-07-01',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'End date for the analytics range, inclusive',
    example: '2026-07-31',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
