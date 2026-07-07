import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum } from 'class-validator';
import { Role } from '../../../generated/prisma/client';

export class UpdateAdminUserDto {
  @ApiProperty({
    description: 'Authoritative application role',
    enum: Role,
    enumName: 'Role',
    example: Role.MANAGER,
  })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({
    description: 'Whether the account should be active',
    example: true,
  })
  @IsBoolean()
  active: boolean;
}
