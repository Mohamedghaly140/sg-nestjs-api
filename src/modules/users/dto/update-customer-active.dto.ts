import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateCustomerActiveDto {
  @ApiProperty({
    description: 'Whether the customer account should be active',
    example: false,
  })
  @IsBoolean()
  active: boolean;
}
