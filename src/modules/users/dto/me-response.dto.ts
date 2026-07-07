import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/client';

export class MeResponseDto {
  @ApiProperty({ example: 'user_2abc123' })
  id: string;

  @ApiProperty({ example: 'mariam@example.com' })
  email: string;

  @ApiProperty({ example: 'Mariam Hassan' })
  name: string;

  @ApiProperty({ example: '+201000000002' })
  phone: string;

  @ApiProperty({ enum: Role, example: Role.USER })
  role: Role;

  @ApiProperty({ example: '2026-07-06T12:00:00.000Z' })
  createdAt: Date;
}
