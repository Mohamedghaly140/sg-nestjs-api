import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'up' })
  app: 'up';

  @ApiProperty({ example: 'up', enum: ['up', 'down'] })
  database: 'up' | 'down';
}
