import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserStatsDto {
  @ApiProperty({ example: 4 })
  ordersCount: number;

  @ApiPropertyOptional({
    description: 'Creation time of the most recent order',
    example: '2026-07-06T12:00:00.000Z',
    nullable: true,
  })
  lastOrderAt: Date | null;
}
