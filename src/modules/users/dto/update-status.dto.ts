import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateStatusDto {
  @ApiProperty({
    description: 'Whether the user may authenticate to the application',
    example: false,
  })
  @IsBoolean()
  active: boolean;
}
