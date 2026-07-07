import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/client';
import { CustomerAddressDto } from './customer-address.dto';
import { CustomerOrderSummaryDto } from './customer-order-summary.dto';

export class AdminCustomerDetailResponseDto {
  @ApiProperty({ description: 'Clerk user ID', example: 'user_2abc123' })
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
    description: 'Authoritative application role',
    enum: Role,
    enumName: 'Role',
    example: Role.USER,
  })
  role: Role;

  @ApiProperty({
    description: 'Customer account creation timestamp',
    example: '2026-07-06T12:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Customer saved addresses',
    type: [CustomerAddressDto],
  })
  addresses: CustomerAddressDto[];

  @ApiProperty({
    description: 'Customer order history ordered by creation time descending',
    type: [CustomerOrderSummaryDto],
  })
  orders: CustomerOrderSummaryDto[];
}
