import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateCartItemDto {
  @ApiProperty({
    description: 'Replacement quantity. Use DELETE to remove a line',
    minimum: 1,
    example: 3,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}
