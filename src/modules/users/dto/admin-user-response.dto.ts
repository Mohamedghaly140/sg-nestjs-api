import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/client';

export class AdminUserResponseDto {
  @ApiProperty({
    description: 'Clerk user ID',
    example: 'user_2abc123',
  })
  id: string;

  @ApiProperty({
    description: 'Primary email address',
    example: 'mariam@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Display name',
    example: 'Mariam Hassan',
  })
  name: string;

  @ApiProperty({
    description: 'Egyptian phone number',
    example: '+201000000002',
  })
  phone: string;

  @ApiProperty({
    description: 'Authoritative application role',
    enum: Role,
    enumName: 'Role',
    example: Role.USER,
  })
  role: Role;

  @ApiProperty({
    description: 'Whether the account is active in the application',
    example: true,
  })
  active: boolean;

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2026-07-06T12:00:00.000Z',
  })
  createdAt: Date;
}
