import { ApiProperty } from '@nestjs/swagger';

export class AdminCustomerResponseDto {
  @ApiProperty({
    description: 'Clerk user ID',
    example: 'user_2abc123',
  })
  id: string;

  @ApiProperty({
    description: 'Customer display name',
    example: 'Mariam Hassan',
  })
  name: string;

  @ApiProperty({
    description: 'Primary email address',
    example: 'mariam@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Egyptian phone number',
    example: '+201000000002',
  })
  phone: string;

  @ApiProperty({
    description: 'Whether the customer account is active',
    example: true,
  })
  active: boolean;

  @ApiProperty({
    description: 'Customer account creation timestamp',
    example: '2026-07-06T12:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Number of orders placed by the customer',
    example: 2,
  })
  ordersCount: number;
}
