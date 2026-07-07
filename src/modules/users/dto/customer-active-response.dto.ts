import { ApiProperty } from '@nestjs/swagger';

export class CustomerActiveResponseDto {
  @ApiProperty({ description: 'Clerk user ID', example: 'user_2abc123' })
  id: string;

  @ApiProperty({
    description: 'Whether the customer account is active',
    example: false,
  })
  active: boolean;
}
