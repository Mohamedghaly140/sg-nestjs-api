import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ClaimOrderDto {
  @ApiProperty({
    description: 'Guest order claim token from the confirmation email',
    example: 'a'.repeat(64),
  })
  @IsString()
  @Length(64, 64)
  token!: string;
}
